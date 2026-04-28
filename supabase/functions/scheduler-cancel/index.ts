// Public endpoint: cancel a booking (token-based, no auth required for invitee).
// Token = booking id; we accept it because guessing a UUID is infeasible AND
// status changes are reversible/auditable. Best-effort: also delete the
// linked Google Calendar event and send cancellation emails.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { deleteGoogleEvent } from '../_shared/google-calendar-busy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { booking_id, reason, by } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: 'booking_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: existing, error: fetchErr } = await supabase
      .from('crm_scheduler_bookings')
      .select('id, status, agent_user_id, contact_id, start_at, event_type_id, google_event_id, google_calendar_id')
      .eq('id', booking_id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (existing.status === 'cancelled') {
      return new Response(JSON.stringify({ ok: true, already: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updErr } = await supabase
      .from('crm_scheduler_bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: by === 'agent' ? 'agent' : 'invitee',
        cancellation_reason: reason || null,
      })
      .eq('id', booking_id);
    if (updErr) throw updErr;

    // Best-effort: delete from Google Calendar
    if (existing.google_event_id && existing.google_calendar_id) {
      try {
        await deleteGoogleEvent(supabase, existing.agent_user_id, existing.google_calendar_id, existing.google_event_id);
      } catch (e) { console.warn('gcal delete failed', e); }
    }

    // In-app notification for agent
    try {
      await supabase.from('crm_notifications').insert({
        user_id: existing.agent_user_id,
        title: 'Booking cancelled',
        body: reason ? `Reason: ${reason}` : 'No reason provided',
        type: 'scheduler_cancelled',
        link_to: `/crm/scheduler/bookings`,
        is_read: false,
      });
    } catch (e) { console.warn('notify failed', e); }

    // Best-effort: cancellation emails to both sides
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const targets: string[] = by === 'agent'
      ? ['invitee_cancellation']
      : ['invitee_cancellation', 'agent_cancellation'];
    for (const kind of targets) {
      fetch(`${SUPABASE_URL}/functions/v1/scheduler-send-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ kind, booking_id, reason: reason || null }),
      }).catch((e) => console.warn(`cancel email ${kind} dispatch failed`, e));
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
