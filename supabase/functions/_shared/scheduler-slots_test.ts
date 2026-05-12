// Deno test suite for the pure scheduler slot generator.
// Run via the supabase--test_edge_functions tool (no HTTP, no DB).
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  generateSlots,
  localToUtc,
  getTzOffsetMin,
  type AvailabilityWindow,
  type AvailabilityOverride,
} from "../_shared/scheduler-slots.ts";

const TZ = "America/Vancouver"; // -08:00 PST / -07:00 PDT

// Helpers ---------------------------------------------------------------
const allDayWindow = (dow: number): AvailabilityWindow => ({
  day_of_week: dow,
  start_time: "09:00:00",
  end_time: "17:00:00",
});

// A "now" so far in the past that min_notice / max_advance never clip results
// unless the test explicitly sets them.
const FAR_PAST_NOW = new Date("2000-01-01T00:00:00Z");

// 1. DST forward — Sun Mar 9 2025 02:00 PST → 03:00 PDT --------------------
Deno.test("DST forward: Mar 9 2025 — slots before 02:00 are PST, after are PDT", () => {
  // Friday Mar 7 (PST, -08:00): 09:00 local → 17:00 local
  const offsetMar7at9 = getTzOffsetMin(new Date("2025-03-07T17:00:00Z"), TZ);
  // Monday Mar 10 (PDT, -07:00): 09:00 local → 16:00 local
  const offsetMar10at9 = getTzOffsetMin(new Date("2025-03-10T16:00:00Z"), TZ);
  assertEquals(offsetMar7at9, -480, "PST should be -480");
  assertEquals(offsetMar10at9, -420, "PDT should be -420");

  // localToUtc respects the DST shift on the boundary day.
  const before = localToUtc("2025-03-09", "01:00:00", TZ); // PST window
  const after = localToUtc("2025-03-09", "09:00:00", TZ);  // PDT window
  assertEquals(before.toISOString(), "2025-03-09T09:00:00.000Z");
  assertEquals(after.toISOString(), "2025-03-09T16:00:00.000Z");
});

// 2. DST back — Sun Nov 2 2025 02:00 PDT → 01:00 PST -----------------------
Deno.test("DST back: Nov 2 2025 — 09:00 local renders one hour later in UTC than the day before", () => {
  const beforeFallback = localToUtc("2025-11-01", "09:00:00", TZ); // PDT
  const afterFallback = localToUtc("2025-11-02", "09:00:00", TZ);  // PST
  assertEquals(beforeFallback.toISOString(), "2025-11-01T16:00:00.000Z");
  assertEquals(afterFallback.toISOString(), "2025-11-02T17:00:00.000Z");
});

// 3. Window across midnight: 22:00 → 02:00 ---------------------------------
Deno.test("agent across midnight (22:00–02:00): generator yields both pre and post-midnight slots", () => {
  const windows: AvailabilityWindow[] = [{
    day_of_week: 5, // Friday in agent local tz
    start_time: "22:00:00",
    end_time: "02:00:00",
  }];
  // Friday Jun 6 2025 (PDT) 22:00 local = 2025-06-07T05:00Z
  const slots = generateSlots({
    fromDate: new Date("2025-06-06T00:00:00Z"),
    toDate: new Date("2025-06-07T23:59:59Z"),
    now: FAR_PAST_NOW,
    tz: TZ,
    duration_min: 60,
    windows,
    overrides: [],
    bookings: [],
    min_notice_min: 0,
    max_advance_days: 36500,
  });
  // Expect 4 one-hour slots starting at 22, 23, 00, 01 local.
  assertEquals(slots.length, 4);
  assertEquals(slots[0].start, "2025-06-07T05:00:00.000Z"); // Fri 22:00 PDT
  assertEquals(slots[3].start, "2025-06-07T08:00:00.000Z"); // Sat 01:00 PDT
});

// 4. buffer_before honored -------------------------------------------------
Deno.test("buffer_before_min: a 30-min buffer hides the slot that touches an existing booking", () => {
  const windows = [allDayWindow(3)]; // Wednesday
  // Wed Jun 11 2025 (PDT). 09:00 local = 16:00Z, slots: 09, 10, 11... up to 16
  const slots = generateSlots({
    fromDate: new Date("2025-06-11T00:00:00Z"),
    toDate: new Date("2025-06-11T23:59:59Z"),
    now: FAR_PAST_NOW,
    tz: TZ,
    duration_min: 60,
    buffer_before_min: 30,
    windows,
    overrides: [],
    // Existing booking 11:00-12:00 local (18:00-19:00Z)
    bookings: [{ start_at: "2025-06-11T18:00:00.000Z", end_at: "2025-06-11T19:00:00.000Z" }],
    min_notice_min: 0,
    max_advance_days: 36500,
  });
  const starts = slots.map((s) => s.start);
  // 10:00 slot (17:00Z–18:00Z) would touch the booking with the 30-min buffer
  // applied to the booking's start (17:30Z), so it's blocked.
  assert(!starts.includes("2025-06-11T17:00:00.000Z"), "10:00 slot should be buffered out");
  assert(!starts.includes("2025-06-11T18:00:00.000Z"), "11:00 slot is the booking itself");
  assert(starts.includes("2025-06-11T16:00:00.000Z"), "9:00 slot is far enough before");
  assert(starts.includes("2025-06-11T19:00:00.000Z"), "12:00 slot is exactly at booking end");
});

// 5. min_notice cutoff -----------------------------------------------------
Deno.test("min_notice_min cutoff: slots earlier than now+notice are excluded", () => {
  const windows = [allDayWindow(2)]; // Tuesday
  // Tue Jun 10 2025 (PDT). Now = 11:30 local Tuesday (18:30Z).
  // min_notice = 240 → earliest slot must be ≥ 22:30Z (15:30 local) → no slots fit duration.
  const slots = generateSlots({
    fromDate: new Date("2025-06-10T00:00:00Z"),
    toDate: new Date("2025-06-10T23:59:59Z"),
    now: new Date("2025-06-10T18:30:00Z"),
    tz: TZ,
    duration_min: 60,
    windows,
    overrides: [],
    bookings: [],
    min_notice_min: 240,
    max_advance_days: 36500,
  });
  for (const s of slots) {
    assert(new Date(s.start).getTime() >= new Date("2025-06-10T22:30:00Z").getTime());
  }
});

// 6. max_advance cutoff ----------------------------------------------------
Deno.test("max_advance_days cutoff: slots later than now+advance are excluded", () => {
  const windows: AvailabilityWindow[] = [
    { day_of_week: 1, start_time: "09:00:00", end_time: "17:00:00" }, // Mon
    { day_of_week: 2, start_time: "09:00:00", end_time: "17:00:00" }, // Tue
    { day_of_week: 3, start_time: "09:00:00", end_time: "17:00:00" }, // Wed
  ];
  const now = new Date("2025-06-09T16:00:00Z"); // Mon 09:00 local
  const slots = generateSlots({
    fromDate: new Date("2025-06-09T00:00:00Z"),
    toDate: new Date("2025-06-30T23:59:59Z"),
    now,
    tz: TZ,
    duration_min: 60,
    windows,
    overrides: [],
    bookings: [],
    min_notice_min: 0,
    max_advance_days: 1, // only 24h ahead
  });
  for (const s of slots) {
    const ahead = new Date(s.start).getTime() - now.getTime();
    assert(ahead <= 86_400_000, `slot ${s.start} is more than 24h out`);
  }
});

// 7. Override blocks the date entirely -------------------------------------
Deno.test("override is_unavailable=true returns zero slots for that date", () => {
  const windows = [allDayWindow(4)]; // Thursday
  const overrides: AvailabilityOverride[] = [{
    date: "2025-06-12",
    is_unavailable: true,
    start_time: null,
    end_time: null,
  }];
  const slots = generateSlots({
    fromDate: new Date("2025-06-12T00:00:00Z"),
    toDate: new Date("2025-06-12T23:59:59Z"),
    now: FAR_PAST_NOW,
    tz: TZ,
    duration_min: 60,
    windows,
    overrides,
    bookings: [],
    min_notice_min: 0,
    max_advance_days: 36500,
  });
  assertEquals(slots.length, 0);
});

// 8. Override with special hours overrides the weekly window --------------
Deno.test("override with start/end overrides the weekly window for that date", () => {
  const windows = [allDayWindow(5)]; // Friday — normally 09:00-17:00
  const overrides: AvailabilityOverride[] = [{
    date: "2025-06-13",
    is_unavailable: false,
    start_time: "13:00:00",
    end_time: "15:00:00", // only two 1-hour slots
  }];
  const slots = generateSlots({
    fromDate: new Date("2025-06-13T00:00:00Z"),
    toDate: new Date("2025-06-13T23:59:59Z"),
    now: FAR_PAST_NOW,
    tz: TZ,
    duration_min: 60,
    windows,
    overrides,
    bookings: [],
    min_notice_min: 0,
    max_advance_days: 36500,
  });
  assertEquals(slots.length, 2);
  // Fri Jun 13 PDT 13:00 = 20:00Z, 14:00 = 21:00Z
  assertEquals(slots[0].start, "2025-06-13T20:00:00.000Z");
  assertEquals(slots[1].start, "2025-06-13T21:00:00.000Z");
});
