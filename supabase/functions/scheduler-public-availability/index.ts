// Public endpoint: returns available slots for an agent + event_type within a date range.
// Pure slot math lives in ../_shared/scheduler-slots.ts so it can be unit-tested.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { fetchGoogleBusy } from '../_shared/google-calendar-busy.ts';
import { generateSlots } from '../_shared/scheduler-slots.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const teamSlug = (url.searchParams.get('team') || '').trim().toLowerCase();
    const eventSlug = (url.searchParams.get('event') || '').trim().toLowerCase();
    const fromStr = url.searchParams.get('from'); // YYYY-MM-DD
    const toStr = url.searchParams.get('to');
    if (!teamSlug || !eventSlug || !fromStr || !toStr) {
      return new Response(JSON.stringify({ error: 'team, event, from, to required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: resolved, error: resErr } = await supabase.rpc('crm_scheduler_resolve_slug', {
      _team_slug: teamSlug, _event_slug: eventSlug,
    });
    if (resErr) throw resErr;
    if (!resolved) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agent = resolved.agent;
    const evt = resolved.event_type;
    const tz = agent.timezone || 'America/Vancouver';

    const fromDate = new Date(`${fromStr}T00:00:00Z`);
    const toDate = new Date(`${toStr}T23:59:59Z`);

    const [{ data: windows }, { data: overrides }, { data: bookings }] = await Promise.all([
      supabase.from('crm_scheduler_availability')
        .select('day_of_week, start_time, end_time, is_active')
        .eq('agent_user_id', agent.user_id).eq('is_active', true),
      supabase.from('crm_scheduler_availability_overrides')
        .select('date, is_unavailable, start_time, end_time')
        .eq('agent_user_id', agent.user_id)
        .gte('date', fromStr).lte('date', toStr),
      supabase.from('crm_scheduler_bookings')
        .select('start_at, end_at, status')
        .eq('agent_user_id', agent.user_id)
        .is('deleted_at', null)
        .in('status', ['confirmed', 'rescheduled'])
        .gte('start_at', fromDate.toISOString())
        .lte('start_at', toDate.toISOString()),
    ]);

    let externalBusy: { startMs: number; endMs: number }[] = [];
    try {
      externalBusy = await fetchGoogleBusy(
        supabase, agent.user_id, fromDate.toISOString(), toDate.toISOString(),
      );
    } catch (e) {
      console.warn('gcal busy fetch failed (non-fatal)', e);
    }

    const slots = generateSlots({
      fromDate, toDate, now: new Date(), tz,
      duration_min: evt.duration_min as number,
      buffer_before_min: evt.buffer_before_min ?? 0,
      buffer_after_min: evt.buffer_after_min ?? 0,
      min_notice_min: evt.min_notice_min ?? 240,
      max_advance_days: evt.max_advance_days ?? 60,
      windows: (windows || []) as any,
      overrides: (overrides || []) as any,
      bookings: (bookings || []) as any,
      external_busy: externalBusy,
    });

    return new Response(JSON.stringify({
      timezone: tz,
      duration_min: evt.duration_min,
      slots,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('availability error', e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
