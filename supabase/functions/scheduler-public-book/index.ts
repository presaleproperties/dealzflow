// Public endpoint: create a booking. Match-or-create contact, validate slot, persist.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function splitName(full: string): { first: string; last: string } {
  const trimmed = (full || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return { first: '(unknown)', last: '(unknown)' };
  const idx = trimmed.indexOf(' ');
  if (idx === -1) return { first: trimmed, last: '(unknown)' };
  return { first: trimmed.slice(0, idx), last: trimmed.slice(idx + 1) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const {
      team_slug, event_slug, start_at, invitee,
      timezone, answers, utm, referrer,
    } = body || {};

    if (!team_slug || !event_slug || !start_at || !invitee?.name || (!invitee?.email && !invitee?.phone)) {
      return new Response(JSON.stringify({ error: 'missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolve agent + event type
    const { data: resolved, error: resErr } = await supabase.rpc('crm_scheduler_resolve_slug', {
      _team_slug: String(team_slug).toLowerCase(),
      _event_slug: String(event_slug).toLowerCase(),
    });
    if (resErr) throw resErr;
    if (!resolved) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const agent = resolved.agent;
    const evt = resolved.event_type;
    const startDate = new Date(start_at);
    const endDate = new Date(startDate.getTime() + (evt.duration_min as number) * 60_000);

    // Conflict check (server-side guard; UI also filters)
    const { count: conflictCount } = await supabase
      .from('crm_scheduler_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('agent_user_id', agent.user_id)
      .in('status', ['confirmed', 'rescheduled'])
      .lt('start_at', endDate.toISOString())
      .gt('end_at', startDate.toISOString());
    if ((conflictCount ?? 0) > 0) {
      return new Response(JSON.stringify({ error: 'slot_taken' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Match-or-create contact
    const email = invitee.email ? String(invitee.email).toLowerCase().trim() : null;
    const phone = invitee.phone ? String(invitee.phone).trim() : null;
    const { first: firstName, last: lastName } = splitName(invitee.name);

    let contactId: string | null = null;
    if (email) {
      const { data: byEmail } = await supabase
        .from('crm_contacts')
        .select('id')
        .eq('email', email)
        .limit(1).maybeSingle();
      if (byEmail) contactId = byEmail.id;
    }
    if (!contactId && phone) {
      const { data: byPhone } = await supabase
        .from('crm_contacts')
        .select('id')
        .eq('phone', phone)
        .limit(1).maybeSingle();
      if (byPhone) contactId = byPhone.id;
    }
    if (!contactId) {
      const { data: created, error: createErr } = await supabase
        .from('crm_contacts')
        .insert({
          first_name: firstName,
          last_name: lastName || '(unknown)',
          email,
          phone,
          source: 'Scheduler',
          campaign_source: `scheduler:${evt.slug}`,
          assigned_to: agent.display_name || agent.email,
          status: 'New Lead',
        })
        .select('id').single();
      if (createErr) throw createErr;
      contactId = created.id;
    }

    // Create booking
    const { data: booking, error: bookErr } = await supabase
      .from('crm_scheduler_bookings')
      .insert({
        agent_user_id: agent.user_id,
        event_type_id: evt.id,
        contact_id: contactId,
        invitee_first_name: firstName,
        invitee_last_name: lastName || '(unknown)',
        invitee_email: email,
        invitee_phone: phone,
        invitee_timezone: timezone || agent.timezone || 'America/Vancouver',
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        duration_min: evt.duration_min,
        status: 'confirmed',
        location_type: evt.location_type,
        location_value: evt.location_value,
        notes_for_agent: invitee.notes || null,
        payment_required: !!evt.requires_payment,
        payment_status: evt.requires_payment ? 'pending' : 'none',
        payment_amount_cents: evt.price_cents || 0,
        payment_currency: evt.currency || 'CAD',
        utm: utm || {},
        referrer: referrer || null,
      })
      .select('*').single();
    if (bookErr) throw bookErr;

    // Persist answers
    if (Array.isArray(answers) && answers.length) {
      const rows = answers
        .filter((a: any) => a?.key && a?.text)
        .map((a: any) => ({
          booking_id: booking.id,
          question_key: String(a.key),
          question_text: String(a.text),
          answer: a.answer != null ? String(a.answer) : null,
        }));
      if (rows.length) await supabase.from('crm_scheduler_booking_questions').insert(rows);
    }

    // Activity event (Realtime → assigned agent toast)
    await supabase.from('crm_activity_events').insert({
      contact_id: contactId,
      agent_user_id: agent.user_id,
      event_type: 'scheduler_booking',
      summary: `Booked ${evt.title} on ${startDate.toLocaleString('en-US', { timeZone: agent.timezone || 'America/Vancouver' })}`,
      payload: { booking_id: booking.id, event_slug: evt.slug, start_at: startDate.toISOString() },
    }).then(() => {}, () => {}); // best-effort

    // Showing record for project events
    if (evt.creates_showing && evt.project_slug) {
      await supabase.from('crm_showings').insert({
        contact_id: contactId,
        project: evt.project_slug,
        scheduled_at: startDate.toISOString(),
        assigned_agent: agent.display_name || agent.email,
        status: 'scheduled',
        notes: `Auto-created from scheduler booking ${booking.id}`,
      }).then(() => {}, () => {});
    }

    return new Response(JSON.stringify({
      booking_id: booking.id,
      confirmation: {
        agent_name: agent.display_name,
        event_title: evt.title,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        timezone: agent.timezone,
        location_type: evt.location_type,
        location_value: evt.location_value,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('book error', e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
