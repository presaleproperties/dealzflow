// Deno tests for assigned_to coercion / resolution.
// Run via supabase--test_edge_functions (no network required).
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { coerceUuid, resolveAssignedToUuid } from './zara-guardrails.ts';

const VALID_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

Deno.test('coerceUuid passes through a valid UUID (lowercased)', () => {
  assertEquals(coerceUuid(VALID_UUID), VALID_UUID);
  assertEquals(coerceUuid(VALID_UUID.toUpperCase()), VALID_UUID);
});

Deno.test('coerceUuid rejects display names and junk', () => {
  for (const bad of ['Zara Malik', '', '   ', 'not-a-uuid', null, undefined, 42, {}]) {
    assertEquals(coerceUuid(bad as unknown), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

// Minimal admin-client stub: records the .or() filter and returns canned rows.
function makeAdmin(row: { user_id: string | null } | null, error: Error | null = null) {
  const calls: string[] = [];
  const admin = {
    from(_t: string) {
      return {
        select() { return this; },
        or(filter: string) { calls.push(filter); return this; },
        limit() { return this; },
        async maybeSingle() { return { data: row, error }; },
      };
    },
  };
  return { admin, calls };
}

Deno.test('resolveAssignedToUuid: valid UUID input → pass-through, no DB call', async () => {
  const { admin, calls } = makeAdmin(null);
  const out = await resolveAssignedToUuid(admin, VALID_UUID);
  assertEquals(out, VALID_UUID);
  assertEquals(calls.length, 0);
});

Deno.test('resolveAssignedToUuid: display name resolves via crm_team lookup', async () => {
  const { admin, calls } = makeAdmin({ user_id: VALID_UUID });
  const out = await resolveAssignedToUuid(admin, 'Zara Malik');
  assertEquals(out, VALID_UUID);
  assertEquals(calls.length, 1);
  assertEquals(
    calls[0],
    'display_name.eq.Zara Malik,email.eq.zara malik',
  );
});

Deno.test('resolveAssignedToUuid: unknown display name → null (no throw)', async () => {
  const { admin } = makeAdmin(null);
  assertEquals(await resolveAssignedToUuid(admin, 'Nobody Here'), null);
});

Deno.test('resolveAssignedToUuid: DB error → null (swallowed)', async () => {
  const { admin } = makeAdmin(null, new Error('boom'));
  assertEquals(await resolveAssignedToUuid(admin, 'Zara Malik'), null);
});

Deno.test('resolveAssignedToUuid: garbage stored in user_id → null', async () => {
  const { admin } = makeAdmin({ user_id: 'not-a-uuid' });
  assertEquals(await resolveAssignedToUuid(admin, 'Zara Malik'), null);
});

Deno.test('resolveAssignedToUuid: nullish inputs → null', async () => {
  const { admin } = makeAdmin(null);
  assertEquals(await resolveAssignedToUuid(admin, null), null);
  assertEquals(await resolveAssignedToUuid(admin, undefined), null);
  assertEquals(await resolveAssignedToUuid(admin, '   '), null);
});
