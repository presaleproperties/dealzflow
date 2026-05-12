// Public endpoint: create a booking. Match-or-create contact, validate slot, persist.
// Best-effort: insert event into agent's Google Calendar; trigger confirmation
// + agent-notification emails. None of these block the booking.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { insertGoogleEvent } from '../_shared/google-calendar-busy.ts';

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
      stripe_session_id, stripe_payment_intent,
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

    // Stripe-session idempotency: if a booking already exists for this session,
    // return it instead of creating a duplicate. Two callers passing the same
    // session_id (e.g. confirm-paid invoked twice from the success page) MUST
    // see exactly one booking. The DB-level partial unique index
    //   crm_scheduler_bookings_stripe_session_uq (stripe_session_id) WHERE NOT NULL
    // is the authoritative guard; this read just lets us short-circuit cleanly.
    if (stripe_session_id) {
      const { data: existing } = await supabase
        .from('crm_scheduler_bookings')
        .select('*')
        .eq('stripe_session_id', String(stripe_session_id))
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({
          booking_id: existing.id,
          idempotent: true,
          confirmation: {
            event_title: null,
            start_at: existing.start_at,
            end_at: existing.end_at,
            timezone: existing.invitee_timezone,
            location_type: existing.location_type,
            location_value: existing.location_value,
          },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Soft pre-check (not race-proof on its own — DB partial unique index is the
    // authoritative guard; we still query so overlapping (not-exact-start) bookings
    // are caught and returned as 409).
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

    // Create booking. The partial unique index
    //   crm_scheduler_bookings_active_slot_uq (agent_user_id, start_at) WHERE status IN (confirmed, rescheduled)
    // gives atomic double-book prevention even under concurrent requests.
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
        payment_status: evt.requires_payment
          ? (stripe_session_id ? 'paid' : 'pending')
          : 'none',
        payment_amount_cents: evt.price_cents || 0,
        payment_currency: evt.currency || 'CAD',
        stripe_session_id: stripe_session_id || null,
        stripe_payment_intent: stripe_payment_intent || null,
        utm: utm || {},
        referrer: referrer || null,
      })
      .select('*').single();
    if (bookErr) {
      const code = (bookErr as { code?: string }).code;
      const msg = (bookErr as { message?: string }).message || '';
      // 23505 = unique_violation. Two unique constraints can fire here:
      //  - active_slot_uq (agent_user_id, start_at) → slot already taken
      //  - stripe_session_uq (stripe_session_id)    → idempotent retry
      if (code === '23505') {
        if (stripe_session_id && msg.includes('stripe_session')) {
          const { data: existing } = await supabase
            .from('crm_scheduler_bookings')
            .select('*')
            .eq('stripe_session_id', String(stripe_session_id))
            .maybeSingle();
          if (existing) {
            return new Response(JSON.stringify({
              booking_id: existing.id,
              idempotent: true,
              confirmation: {
                event_title: evt.title,
                start_at: existing.start_at,
                end_at: existing.end_at,
                timezone: existing.invitee_timezone,
                location_type: existing.location_type,
                location_value: existing.location_value,
              },
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
        return new Response(JSON.stringify({ error: 'slot_taken' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw bookErr;
    }

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
    try {
      await supabase.from('crm_activity_events').insert({
        type: 'scheduler_booking',
        contact_id: contactId,
        lead_email: email,
        lead_phone: phone,
        project_slug: evt.project_slug || null,
        agent_slug: agent.slug || null,
        metadata: {
          booking_id: booking.id,
          event_slug: evt.slug,
          event_title: evt.title,
          start_at: startDate.toISOString(),
          duration_min: evt.duration_min,
        },
        occurred_at: new Date().toISOString(),
      });
    } catch (e) { console.warn('activity insert failed', e); }

    // Showing record for project events
    if (evt.creates_showing) {
      try {
        const localDate = startDate.toISOString().slice(0, 10);
        const localTime = startDate.toISOString().slice(11, 19);
        await supabase.from('crm_showings').insert({
          contact_id: contactId,
          project: evt.project_slug || evt.title,
          showing_date: localDate,
          showing_time: localTime,
          assigned_agent: agent.display_name || agent.email,
          status: 'scheduled',
          notes: `Auto-created from scheduler booking ${booking.id}`,
        });
      } catch (e) { console.warn('showing insert failed', e); }
    }

    // Best-effort: insert into agent's Google Calendar primary calendar
    try {
      const gcal = await insertGoogleEvent(supabase, agent.user_id, {
        summary: `${evt.title} — ${firstName} ${lastName === '(unknown)' ? '' : lastName}`.trim(),
        description: [
          invitee.notes ? `Notes: ${invitee.notes}` : null,
          email ? `Email: ${email}` : null,
          phone ? `Phone: ${phone}` : null,
          `Booked via DealzFlow Scheduler`,
        ].filter(Boolean).join('\n'),
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        timezone: agent.timezone || 'America/Vancouver',
        attendees: email ? [{ email, displayName: `${firstName} ${lastName}`.trim() }] : undefined,
        location: evt.location_value || undefined,
      });
      if (gcal) {
        await supabase.from('crm_scheduler_bookings')
          .update({ google_event_id: gcal.eventId, google_calendar_id: gcal.calendarId })
          .eq('id', booking.id);
      }
    } catch (e) { console.warn('gcal insert failed (non-fatal)', e); }

    // Best-effort: push the booking out to external lead systems as a
    // "Scheduler" lead source. Each integration is fully isolated — a single
    // failure (timeout, 4xx, network) MUST NOT fail the booking.
    const outboundPayload = {
      source: 'DealzFlow Scheduler',
      booking_id: booking.id,
      event_slug: evt.slug,
      event_title: evt.title,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      timezone: agent.timezone || 'America/Vancouver',
      agent: {
        slug: agent.slug || null,
        display_name: agent.display_name || null,
        email: agent.email || null,
      },
      invitee: {
        first_name: firstName,
        last_name: lastName === '(unknown)' ? null : lastName,
        email,
        phone,
        notes: invitee.notes || null,
      },
      utm: utm || {},
      referrer: referrer || null,
    };

    const loftyUrl = Deno.env.get('LOFTY_OUTBOUND_WEBHOOK_URL');
    const loftySecret = Deno.env.get('LOFTY_OUTBOUND_WEBHOOK_SECRET');
    if (loftyUrl) {
      try {
        const r = await fetch(loftyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(loftySecret ? { 'x-webhook-secret': loftySecret } : {}),
          },
          body: JSON.stringify(outboundPayload),
        });
        if (!r.ok) {
          console.error('lofty outbound non-2xx', r.status, await r.text().catch(() => ''));
        }
      } catch (e) {
        console.error('lofty outbound failed (non-fatal)', e);
      }
    }

    try {
      const bridgeRes = await supabase.functions.invoke('bridge-ingest-lead', {
        body: outboundPayload,
      });
      if (bridgeRes.error) {
        console.error('bridge-ingest-lead failed (non-fatal)', bridgeRes.error);
      }
    } catch (e) {
      console.error('bridge-ingest-lead threw (non-fatal)', e);
    }

    // Best-effort: send confirmation + agent notification emails. Fire-and-forget.
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    for (const kind of ['invitee_confirmation', 'agent_notification'] as const) {
      fetch(`${SUPABASE_URL}/functions/v1/scheduler-send-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ kind, booking_id: booking.id }),
      }).catch((e) => console.warn(`email ${kind} dispatch failed`, e));
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
