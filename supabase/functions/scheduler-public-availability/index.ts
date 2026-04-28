// Public endpoint: returns available slots for an agent + event_type within a date range.
// Computes slots from weekly availability, subtracts overrides, existing bookings,
// and (best-effort) Google Calendar busy ranges from the agent's primary calendar.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { fetchGoogleBusy } from '../_shared/google-calendar-busy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface Slot { start: string; end: string; }

function pad(n: number) { return String(n).padStart(2, '0'); }

// Build a UTC ISO string from agent-tz local date + time-of-day.
// We use Intl-based offset detection so we don't pull a tz library.
function localToUtc(dateStr: string, hhmm: string, tz: string): Date {
  // dateStr = YYYY-MM-DD, hhmm = HH:MM:SS
  // Strategy: compute the offset that the agent's tz had at that local time, apply it.
  // Approximate: build a Date as if it were UTC, then adjust by the tz offset at that instant.
  const naive = new Date(`${dateStr}T${hhmm}Z`); // treat as UTC
  const tzOffsetMin = getTzOffsetMin(naive, tz);
  return new Date(naive.getTime() - tzOffsetMin * 60_000);
}

function getTzOffsetMin(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(at).reduce((acc: Record<string, string>, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value; return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return (asUTC - at.getTime()) / 60_000;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const teamSlug = (url.searchParams.get('team') || '').trim().toLowerCase();
    const eventSlug = (url.searchParams.get('event') || '').trim().toLowerCase();
    const fromStr = url.searchParams.get('from'); // YYYY-MM-DD (in agent tz)
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
    const duration = evt.duration_min as number;
    const bufBefore = (evt.buffer_before_min ?? 0) as number;
    const bufAfter = (evt.buffer_after_min ?? 0) as number;
    const minNotice = (evt.min_notice_min ?? 240) as number;
    const maxAdvance = (evt.max_advance_days ?? 60) as number;

    // Date window
    const fromDate = new Date(`${fromStr}T00:00:00Z`);
    const toDate = new Date(`${toStr}T23:59:59Z`);
    const now = new Date();
    const earliestUtc = new Date(now.getTime() + minNotice * 60_000);
    const latestUtc = new Date(now.getTime() + maxAdvance * 86_400_000);

    // Fetch availability windows + overrides + existing bookings
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
        .in('status', ['confirmed', 'rescheduled'])
        .gte('start_at', fromDate.toISOString())
        .lte('start_at', toDate.toISOString()),
    ]);

    const overrideByDate = new Map<string, any>();
    (overrides || []).forEach((o: any) => overrideByDate.set(o.date, o));

    const busyRanges: [number, number][] = (bookings || []).map((b: any) => [
      new Date(b.start_at).getTime() - bufBefore * 60_000,
      new Date(b.end_at).getTime() + bufAfter * 60_000,
    ]);

    // Best-effort: subtract Google Calendar busy ranges for this agent.
    // Silently skipped if agent hasn't connected Google Calendar.
    try {
      const gcalBusy = await fetchGoogleBusy(
        supabase,
        agent.user_id,
        fromDate.toISOString(),
        toDate.toISOString(),
      );
      for (const r of gcalBusy) {
        busyRanges.push([r.startMs - bufBefore * 60_000, r.endMs + bufAfter * 60_000]);
      }
    } catch (e) {
      console.warn('gcal busy fetch failed (non-fatal)', e);
    }

    const slots: Slot[] = [];
    const stepMs = duration * 60_000;

    for (let d = new Date(fromDate); d <= toDate; d = new Date(d.getTime() + 86_400_000)) {
      const dateStr = d.toISOString().slice(0, 10);
      // day_of_week in agent local tz
      const localDay = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      ).getUTCDay(); // 0..6

      const ovr = overrideByDate.get(dateStr);
      let dayWindows: { start_time: string; end_time: string }[] = [];

      if (ovr) {
        if (ovr.is_unavailable) continue;
        if (ovr.start_time && ovr.end_time) {
          dayWindows = [{ start_time: ovr.start_time, end_time: ovr.end_time }];
        }
      } else {
        dayWindows = (windows || []).filter((w: any) => w.day_of_week === localDay);
      }

      for (const w of dayWindows) {
        const winStart = localToUtc(dateStr, w.start_time, tz);
        const winEnd = localToUtc(dateStr, w.end_time, tz);
        for (let t = winStart.getTime(); t + stepMs <= winEnd.getTime(); t += stepMs) {
          if (t < earliestUtc.getTime() || t > latestUtc.getTime()) continue;
          const slotStart = t;
          const slotEnd = t + stepMs;
          // collision with busy?
          const overlaps = busyRanges.some(([bs, be]) => slotStart < be && slotEnd > bs);
          if (overlaps) continue;
          slots.push({
            start: new Date(slotStart).toISOString(),
            end: new Date(slotEnd).toISOString(),
          });
        }
      }
    }

    return new Response(JSON.stringify({
      timezone: tz,
      duration_min: duration,
      slots,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('availability error', e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
