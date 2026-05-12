// Public reschedule: lookup an existing confirmed booking by id, validate slot,
// cancel old (delete gcal event, status=cancelled), then book new via scheduler-public-book.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { deleteGoogleEvent } from '../_shared/google-calendar-busy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const id = url.searchParams.get('booking_id');
      if (!id) return new Response(JSON.stringify({ error: 'missing booking_id' }), { status: 400, headers: corsHeaders });
      const { data: b } = await supabase
        .from('crm_scheduler_bookings')
        .select('id,start_at,end_at,status,invitee_first_name,invitee_email,invitee_phone,event_type_id')
        .eq('id', id).maybeSingle();
      if (!b) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: corsHeaders });
      if (b.status === 'cancelled') return new Response(JSON.stringify({ error: 'already_cancelled' }), { status: 410, headers: corsHeaders });
      const { data: evt } = await supabase
        .from('crm_scheduler_event_types')
        .select('slug,title,duration_min,agent_user_id').eq('id', b.event_type_id).maybeSingle();
      const { data: agent } = evt ? await supabase
        .from('crm_team').select('slug,display_name').eq('user_id', evt.agent_user_id).maybeSingle() : { data: null };
      return new Response(JSON.stringify({ booking: b, event_type: evt, agent }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { booking_id, new_start_at, timezone } = body || {};
    if (!booking_id || !new_start_at) {
      return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400, headers: corsHeaders });
    }

    const { data: existing, error: exErr } = await supabase
      .from('crm_scheduler_bookings')
      .select('*, event_type:crm_scheduler_event_types(*)')
      .eq('id', booking_id).maybeSingle();
    if (exErr || !existing) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: corsHeaders });
    if (existing.status === 'cancelled') {
      return new Response(JSON.stringify({ error: 'already_cancelled' }), { status: 410, headers: corsHeaders });
    }

    const { data: agent } = await supabase
      .from('crm_team').select('slug').eq('user_id', existing.agent_user_id).maybeSingle();
    if (!agent?.slug) return new Response(JSON.stringify({ error: 'agent_not_found' }), { status: 404, headers: corsHeaders });

    // Cancel the old booking (best-effort gcal delete)
    if (existing.google_event_id && existing.google_calendar_id) {
      try {
        await deleteGoogleEvent(supabase, existing.agent_user_id, existing.google_calendar_id, existing.google_event_id);
      } catch (e) { console.warn('gcal delete failed', e); }
    }
    await supabase.from('crm_scheduler_bookings')
      .update({ status: 'cancelled', deleted_at: new Date().toISOString(), cancelled_at: new Date().toISOString(), cancellation_reason: 'rescheduled' })
      .eq('id', booking_id);

    // Book the new slot via the standard pipeline
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const bookRes = await fetch(`${SUPABASE_URL}/functions/v1/scheduler-public-book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify({
        team_slug: agent.slug,
        event_slug: existing.event_type.slug,
        start_at: new_start_at,
        timezone: timezone || existing.invitee_timezone,
        invitee: {
          name: `${existing.invitee_first_name} ${existing.invitee_last_name === '(unknown)' ? '' : existing.invitee_last_name}`.trim(),
          email: existing.invitee_email,
          phone: existing.invitee_phone,
          notes: existing.notes_for_agent,
        },
      }),
    });
    const bookJson = await bookRes.json();
    if (!bookRes.ok) {
      // Restore old booking if we failed to book
      await supabase.from('crm_scheduler_bookings')
        .update({ status: 'confirmed', cancelled_at: null, cancellation_reason: null })
        .eq('id', booking_id);
      return new Response(JSON.stringify({ error: bookJson.error || 'rebook_failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Link old → new for audit
    await supabase.from('crm_scheduler_bookings')
      .update({ rescheduled_to_booking_id: bookJson.booking_id })
      .eq('id', booking_id);

    return new Response(JSON.stringify({ ok: true, booking_id: bookJson.booking_id, confirmation: bookJson.confirmation }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('reschedule error', e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
