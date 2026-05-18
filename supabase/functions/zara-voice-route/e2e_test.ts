// End-to-end test for the VoicePressButton pipeline.
//
// Flow exercised (each step logged with [voice-e2e/N] prefix):
//   1. transcribe  → zara-voice-route invoked with { text } bypass
//                    (we cannot generate real audio in CI; the route accepts
//                    text directly to skip the whisper step but exercises the
//                    same downstream wiring).
//   2. suggest     → voice-route fans out to zara-suggest-reply; we assert
//                    a draft row landed in zara_suggested_replies with a
//                    non-empty draft_text + intent.
//   3. edit        → simulate the agent tweaking the draft before send
//                    by mutating draft_text in-place (UI does the same).
//   4. send        → zara-execute-send with decidedVia='manual'. The test
//                    contact carries the `zara_test_contact` tag so the
//                    sandbox gate lets the send through; SMS will likely
//                    fail (no phone on the throwaway contact) but the
//                    function must respond with a structured body, not
//                    crash. We log either the sandbox-block, the success,
//                    or the structured failure.
//
// Requires: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_DB_URL.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const DB_URL = Deno.env.get("SUPABASE_DB_URL")!;

const TEST_TAG = "zara_test_contact";
const TEST_EMAIL = `voice-e2e-${crypto.randomUUID().slice(0, 8)}@example.test`;
const TEST_PHONE = `+15005550006`; // Twilio magic number — safe even if SMS attempted
const ASSIGNED_TO = "Uzair Muhammad";

const sql = postgres(DB_URL, { max: 1, prepare: false });

const log = (step: string, msg: string, extra?: unknown) => {
  const tail = extra === undefined ? "" : " " + JSON.stringify(extra).slice(0, 240);
  console.log(`[voice-e2e/${step}] ${msg}${tail}`);
};

async function createTestContact(): Promise<string> {
  const rows = await sql`
    INSERT INTO public.crm_contacts (
      first_name, last_name, email, phone, assigned_to, tags, zara_enabled,
      status, lead_type, budget_min, budget_max, language, project
    ) VALUES (
      'VoiceE2E', 'Tester', ${TEST_EMAIL}, ${TEST_PHONE}, ${ASSIGNED_TO},
      ARRAY[${TEST_TAG}]::text[], true,
      'New', 'buyer', 800000, 1200000,
      'English', 'Surrey presale'
    )
    RETURNING id::text AS id
  `;
  return rows[0].id as string;
}

async function callFn(path: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

Deno.test({
  name: "VoicePressButton E2E: transcribe → suggest → edit → send",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const contactId = await createTestContact();
    log("setup", `created throwaway contact`, { contactId, email: TEST_EMAIL });

    try {
      // ── 1. TRANSCRIBE (text bypass)
      const dictated =
        "Hey, follow up with this lead — ask if they're free for a " +
        "showing this weekend and confirm their budget around 1 million.";
      log("1.transcribe", `invoking zara-voice-route with text bypass`, {
        len: dictated.length,
      });
      const voice = await callFn("zara-voice-route", {
        contactId,
        text: dictated,
        channel: "sms",
      });
      log("1.transcribe", `voice-route responded`, {
        status: voice.status,
        keys: Object.keys(voice.body ?? {}),
      });
      assertEquals(voice.status, 200, `voice-route non-200: ${JSON.stringify(voice.body)}`);
      assert(voice.body?.transcript, `missing transcript in response`);
      assertEquals(voice.body.transcript, dictated, "transcript should echo text input");

      // ── 2. SUGGEST — voice-route fans out to suggest-reply
      const suggest = voice.body.suggest;
      log("2.suggest", `nested suggest-reply payload`, {
        ok: suggest?.ok,
        draftId: suggest?.draftId,
        intent: suggest?.intent,
      });
      assert(suggest?.ok === true, `suggest-reply failed: ${JSON.stringify(suggest)}`);
      const draftId: string = suggest.draftId;
      assert(draftId, "missing draftId");

      const draftRows = await sql`
        SELECT id::text AS id, draft_text, intent::text AS intent,
               status::text AS status, channel::text AS channel
        FROM public.zara_suggested_replies WHERE id = ${draftId}::uuid
      `;
      assertEquals(draftRows.length, 1, "draft row not found");
      const draft = draftRows[0] as any;
      log("2.suggest", `draft row materialized`, {
        intent: draft.intent,
        status: draft.status,
        channel: draft.channel,
        preview: String(draft.draft_text ?? "").slice(0, 80),
      });
      assert(draft.draft_text?.length > 0, "draft_text is empty");
      assertEquals(draft.status, "pending", `expected pending, got ${draft.status}`);

      // ── 3. EDIT — agent tweaks before sending. In the real UI the edit is
      // held in local state and shipped as `finalText` to execute-send (the
      // draft row itself is updated server-side). We mirror that here rather
      // than writing zara_suggested_replies directly (sandbox role can't UPDATE).
      const editedText = `${draft.draft_text}\n\n— Edited by agent during E2E test.`;
      log("3.edit", `held edit locally for execute-send`, {
        edit_chars_added: editedText.length - draft.draft_text.length,
      });

      // ── 4. SEND — finalize via zara-execute-send
      log("4.send", `invoking zara-execute-send`, { draftId, channel: draft.channel });
      const send = await callFn("zara-execute-send", {
        draftId,
        finalText: editedText,
        decidedBy: "voice-e2e",
        decidedVia: "manual",
      });
      log("4.send", `execute-send responded`, {
        status: send.status,
        body: send.body,
      });
      // Acceptable outcomes:
      //   • 200 ok:true                → really sent (live mode + reachable phone)
      //   • 200 blocked:true           → sandbox gate caught a non-test contact
      //   • 200 ok:false sendErr=...   → channel failed cleanly (e.g. SMS fake)
      //   • 409 draft_not_pending      → race; still a structured response
      assert(
        send.status === 200 || send.status === 409,
        `execute-send crashed (status=${send.status}): ${JSON.stringify(send.body)}`,
      );

      const finalRows = await sql`
        SELECT status::text AS status FROM public.zara_suggested_replies
        WHERE id = ${draftId}::uuid
      `;
      log("4.send", `final draft status`, { status: (finalRows[0] as any)?.status });

      log("done", "VoicePressButton pipeline reachable end-to-end ✓");
    } finally {
      try {
        await sql`DELETE FROM public.crm_contacts WHERE id = ${contactId}::uuid`;
        log("teardown", `deleted test contact`);
      } catch (e) {
        log("teardown", `cleanup skipped (sandbox lacks DELETE): ${(e as Error).message}`);
      }
      await sql.end({ timeout: 5 });
    }
  },
});
