// Pure, side-effect-free helpers for scheduler slot generation.
// Imported by scheduler-public-availability/index.ts AND its Deno test suite.

export interface Slot { start: string; end: string; }

export interface AvailabilityWindow {
  day_of_week: number; // 0..6 (Sun..Sat)
  start_time: string;  // 'HH:MM:SS'
  end_time: string;    // 'HH:MM:SS' — may be '24:00:00' or earlier-than-start to wrap past midnight
}

export interface AvailabilityOverride {
  date: string;        // 'YYYY-MM-DD'
  is_unavailable: boolean;
  start_time: string | null;
  end_time: string | null;
}

export interface BusyRange { startMs: number; endMs: number; }

export interface SlotGeneratorInput {
  fromDate: Date;
  toDate: Date;
  now: Date;
  tz: string;
  duration_min: number;
  buffer_before_min?: number;
  buffer_after_min?: number;
  min_notice_min?: number;
  max_advance_days?: number;
  windows: AvailabilityWindow[];
  overrides: AvailabilityOverride[];
  bookings: { start_at: string; end_at: string }[];
  external_busy?: BusyRange[];
}

/**
 * Returns the offset (minutes) that timezone `tz` had at the given instant.
 * Positive when ahead of UTC (e.g. +60 for CET), negative when behind (e.g. -480 for PST).
 */
export function getTzOffsetMin(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(at).reduce((acc: Record<string, string>, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour),
    Number(parts.minute), Number(parts.second),
  );
  return (asUTC - at.getTime()) / 60_000;
}

/**
 * Convert a local wall-clock date+time in the agent's tz to a UTC Date.
 * Handles DST correctly by computing the offset that tz had at that wall time.
 * `hhmm` accepts 'HH:MM' or 'HH:MM:SS', plus the special '24:00' / '24:00:00' meaning end-of-day.
 */
export function localToUtc(dateStr: string, hhmm: string, tz: string): Date {
  let normalized = hhmm.length === 5 ? `${hhmm}:00` : hhmm;
  let dayShift = 0;
  if (normalized.startsWith('24:')) {
    normalized = `00${normalized.slice(2)}`;
    dayShift = 86_400_000;
  }
  const naive = new Date(`${dateStr}T${normalized}Z`); // treat as UTC
  const tzOffsetMin = getTzOffsetMin(naive, tz);
  return new Date(naive.getTime() - tzOffsetMin * 60_000 + dayShift);
}

/**
 * Generate bookable slots given availability + busy ranges. Pure, deterministic.
 * Honors:
 *   - per-day weekly windows OR a same-day override (override wins)
 *   - is_unavailable override → that date yields zero slots
 *   - min_notice_min (earliest slot ≥ now + minNotice)
 *   - max_advance_days (latest slot ≤ now + maxAdvance)
 *   - existing bookings + external (e.g. Google Calendar) busy ranges, both inflated by buffers
 *   - windows whose end_time ≤ start_time (e.g. 22:00 → 02:00) are treated as wrapping past midnight
 */
export function generateSlots(input: SlotGeneratorInput): Slot[] {
  const {
    fromDate, toDate, now, tz, duration_min,
    buffer_before_min = 0, buffer_after_min = 0,
    min_notice_min = 240, max_advance_days = 60,
    windows, overrides, bookings, external_busy = [],
  } = input;

  const stepMs = duration_min * 60_000;
  const earliestUtc = now.getTime() + min_notice_min * 60_000;
  const latestUtc = now.getTime() + max_advance_days * 86_400_000;

  const overrideByDate = new Map<string, AvailabilityOverride>();
  overrides.forEach((o) => overrideByDate.set(o.date, o));

  const busy: [number, number][] = [
    ...bookings.map((b) => [
      new Date(b.start_at).getTime() - buffer_before_min * 60_000,
      new Date(b.end_at).getTime() + buffer_after_min * 60_000,
    ] as [number, number]),
    ...external_busy.map((r) => [
      r.startMs - buffer_before_min * 60_000,
      r.endMs + buffer_after_min * 60_000,
    ] as [number, number]),
  ];

  const out: Slot[] = [];
  const seen = new Set<number>();

  for (let d = new Date(Date.UTC(
    fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate(),
  )); d.getTime() <= toDate.getTime(); d = new Date(d.getTime() + 86_400_000)) {
    const dateStr = d.toISOString().slice(0, 10);
    const localDay = d.getUTCDay();

    let dayWindows: { start_time: string; end_time: string }[] = [];
    const ovr = overrideByDate.get(dateStr);
    if (ovr) {
      if (ovr.is_unavailable) continue;
      if (ovr.start_time && ovr.end_time) {
        dayWindows = [{ start_time: ovr.start_time, end_time: ovr.end_time }];
      }
    } else {
      dayWindows = windows.filter((w) => w.day_of_week === localDay);
    }

    for (const w of dayWindows) {
      const winStart = localToUtc(dateStr, w.start_time, tz);
      let winEnd = localToUtc(dateStr, w.end_time, tz);
      // Wrap past midnight: e.g. 22:00 → 02:00 means end is next-day 02:00.
      if (winEnd.getTime() <= winStart.getTime()) {
        winEnd = new Date(winEnd.getTime() + 86_400_000);
      }
      for (let t = winStart.getTime(); t + stepMs <= winEnd.getTime(); t += stepMs) {
        if (seen.has(t)) continue;
        if (t < earliestUtc || t > latestUtc) continue;
        const slotEnd = t + stepMs;
        const overlaps = busy.some(([bs, be]) => t < be && slotEnd > bs);
        if (overlaps) continue;
        seen.add(t);
        out.push({
          start: new Date(t).toISOString(),
          end: new Date(slotEnd).toISOString(),
        });
      }
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}
