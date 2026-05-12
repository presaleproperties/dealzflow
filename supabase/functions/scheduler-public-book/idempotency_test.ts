// Idempotency proof for crm_scheduler_bookings_stripe_session_uq.
// Spawns two concurrent INSERTs through psql carrying the SAME stripe_session_id
// (different start times, so the slot constraint can't accidentally pass) and
// asserts exactly one succeeds while the other fails with Postgres SQLSTATE 23505
// (unique_violation). This is the on-disk guarantee that makes
// scheduler-confirm-paid → scheduler-public-book idempotent: calling verify-payment
// twice for the same Stripe checkout session produces exactly one booking.
//
// Requires PG* env vars (set automatically in the Lovable sandbox).
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const AGENT_USER_ID = "77754636-c2c5-4207-874d-a205954d9507";
const EVENT_TYPE_ID = "d3297727-191a-4d58-81c3-0f932476f8a7";
const SESSION_ID = `cs_test_idem_${crypto.randomUUID().slice(0, 12)}`;

function attemptInsert(startAt: string, endAt: string) {
  const sql = `
    INSERT INTO public.crm_scheduler_bookings (
      agent_user_id, event_type_id, invitee_first_name, invitee_last_name,
      invitee_email, invitee_timezone, start_at, end_at, duration_min, status,
      location_type, stripe_session_id, payment_required, payment_status
    ) VALUES (
      '${AGENT_USER_ID}', '${EVENT_TYPE_ID}', 'Idem', 'Test',
      'idem-${crypto.randomUUID()}@example.com', 'America/Vancouver',
      '${startAt}', '${endAt}', 30, 'confirmed',
      'phone', '${SESSION_ID}', true, 'paid'
    );
  `;
  const cmd = new Deno.Command("psql", {
    args: ["-v", "ON_ERROR_STOP=1", "-c", sql],
    stdout: "piped",
    stderr: "piped",
  });
  return cmd.output().then(({ code, stderr }) => {
    const stderrStr = new TextDecoder().decode(stderr);
    let sqlstate: string | null = null;
    if (stderrStr.includes("duplicate key value violates unique constraint")) sqlstate = "23505";
    const constraintMatch = stderrStr.match(/unique constraint "([^"]+)"/);
    return { ok: code === 0, sqlstate, constraint: constraintMatch?.[1] ?? null, stderr: stderrStr };
  });
}

Deno.test({
  name: "idempotency: two concurrent verify-payment calls (same Stripe session) → exactly 1 booking + 1 23505 on stripe_session_uq",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // Pre-clean any leftover row from a previous run (idempotent).
    await new Deno.Command("psql", {
      args: ["-c", `DELETE FROM public.crm_scheduler_bookings WHERE stripe_session_id = '${SESSION_ID}';`],
    }).output();

    // Use *different* slots on purpose so the slot-uq cannot fire — the only
    // possible duplicate-key failure is the stripe_session_uq.
    const [a, b] = await Promise.all([
      attemptInsert("2099-02-01T10:00:00Z", "2099-02-01T10:30:00Z"),
      attemptInsert("2099-02-01T11:00:00Z", "2099-02-01T11:30:00Z"),
    ]);
    const wins = [a, b].filter((r) => r.ok).length;
    const losses = [a, b].filter((r) => !r.ok).length;

    assertEquals(wins, 1, `expected exactly 1 booking, got ${wins}. a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
    assertEquals(losses, 1, `expected exactly 1 idempotency rejection, got ${losses}`);
    const loser = a.ok ? b : a;
    assertEquals(loser.sqlstate, "23505", `losing insert should be unique_violation, got: ${loser.stderr}`);
    assert(
      (loser.constraint ?? "").includes("stripe_session"),
      `losing insert must hit the stripe_session_uq constraint, got: ${loser.constraint}`,
    );

    // Confirm only one booking exists for this session id.
    const countCmd = await new Deno.Command("psql", {
      args: ["-tA", "-c", `SELECT count(*) FROM public.crm_scheduler_bookings WHERE stripe_session_id = '${SESSION_ID}';`],
      stdout: "piped",
    }).output();
    const countStr = new TextDecoder().decode(countCmd.stdout).trim();
    assertEquals(countStr, "1", `expected exactly 1 booking row for session, got ${countStr}`);

    // Cleanup
    await new Deno.Command("psql", {
      args: ["-c", `DELETE FROM public.crm_scheduler_bookings WHERE stripe_session_id = '${SESSION_ID}';`],
    }).output();
  },
});
