// Race-condition proof for crm_scheduler_bookings_active_slot_uq.
// Spawns two concurrent INSERTs through psql for the SAME (agent_user_id, start_at)
// and asserts exactly one succeeds while the other fails with Postgres SQLSTATE 23505
// (unique_violation). This is the on-disk guarantee that powers the 409 slot_taken
// response in scheduler-public-book.
//
// Requires PG* env vars (set automatically in the Lovable sandbox).
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const AGENT_USER_ID = "77754636-c2c5-4207-874d-a205954d9507";
const EVENT_TYPE_ID = "d3297727-191a-4d58-81c3-0f932476f8a7";
// Far-future timestamp unique to this test run — avoids polluting real bookings.
const _suffix = `${String(new Date().getUTCMinutes()).padStart(2, "0")}${String(new Date().getUTCSeconds()).padStart(2, "0")}`.slice(-2);
const START_AT = `2099-01-01T12:${_suffix}:00Z`;
const END_AT = `2099-01-01T13:${_suffix}:00Z`;

async function attemptInsert(): Promise<{ ok: boolean; sqlstate: string | null; stderr: string }> {
  const sql = `
    INSERT INTO public.crm_scheduler_bookings (
      agent_user_id, event_type_id, invitee_first_name, invitee_last_name,
      invitee_email, invitee_timezone, start_at, end_at, duration_min, status, location_type
    ) VALUES (
      '${AGENT_USER_ID}', '${EVENT_TYPE_ID}', 'Race', 'Test',
      'race-${crypto.randomUUID()}@example.com', 'America/Vancouver',
      '${START_AT}', '${END_AT}', 30, 'confirmed', 'phone'
    );
  `;
  const cmd = new Deno.Command("psql", {
    args: ["-v", "ON_ERROR_STOP=1", "-c", sql],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = await cmd.output();
  const stderrStr = new TextDecoder().decode(stderr);
  // Postgres prints e.g. `ERROR:  duplicate key value violates unique constraint "..."`
  // The SQLSTATE shows when verbose is enabled; otherwise we infer from the message.
  let sqlstate: string | null = null;
  if (stderrStr.includes("duplicate key value violates unique constraint")) sqlstate = "23505";
  return { ok: code === 0, sqlstate, stderr: stderrStr };
}

Deno.test({
  name: "race: two concurrent bookings for the same slot → exactly 1 success + 1 23505",
  // The pooler can be slow on cold start; give us breathing room.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // Pre-clean any leftover row from a previous run (idempotent).
    await new Deno.Command("psql", {
      args: [
        "-c",
        `DELETE FROM public.crm_scheduler_bookings WHERE agent_user_id = '${AGENT_USER_ID}' AND start_at = '${START_AT}';`,
      ],
    }).output();

    const [a, b] = await Promise.all([attemptInsert(), attemptInsert()]);
    const wins = [a, b].filter((r) => r.ok).length;
    const losses = [a, b].filter((r) => !r.ok).length;

    assertEquals(wins, 1, `expected exactly 1 success, got ${wins}. a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
    assertEquals(losses, 1, `expected exactly 1 failure, got ${losses}`);
    const loser = a.ok ? b : a;
    assertEquals(loser.sqlstate, "23505", `losing insert should fail with unique_violation, got: ${loser.stderr}`);

    // Cleanup
    await new Deno.Command("psql", {
      args: [
        "-c",
        `DELETE FROM public.crm_scheduler_bookings WHERE agent_user_id = '${AGENT_USER_ID}' AND start_at = '${START_AT}';`,
      ],
    }).output();

    assert(true);
  },
});
