// zara-training-feedback — record per-message training feedback for "Train Zara".
// POST { messageId: string, kind: FeedbackKind, note?: string,
//        saveAs?: 'winning'|'bad', responseTextOverride?: string, scenarioOverride?: string }
//
// Feedback kinds:
//   'sounds_like_uzair' | 'too_robotic' | 'too_pushy' | 'too_long' | 'too_soft'
//   | 'too_generic' | 'wrong_strategy' | 'needs_uzair' | 'save_as_winning' | 'save_as_bad'
//
// Side effects:
//   - Updates the assistant message with feedback_kind/feedback_note
//   - Logs to zara_training_feedback (existing table)
//   - If saveAs='winning' → inserts into zara_winning_responses
//   - If saveAs='bad'     → inserts into zara_bad_responses
//   - For 'too_robotic'/'too_pushy'/'too_long'/'too_soft'/'too_generic'/'wrong_strategy'
//     → inserts a draft tone rule into zara_style_rules (kind='tone') for admin review
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FEEDBACK_KINDS = new Set([
  "sounds_like_uzair", "too_robotic", "too_pushy", "too_long", "too_soft",
  "too_generic", "wrong_strategy", "needs_uzair", "save_as_winning", "save_as_bad",
]);

const TONE_RULES_FROM_FEEDBACK: Record<string, { kind: string; rule: string }> = {
  too_robotic:    { kind: "tone", rule: "Avoid robotic / templated phrasing. Sound warmer, more natural, like a real person on Uzair's team." },
  too_pushy:      { kind: "tone", rule: "Reduce pressure. No hard close, no urgency language, no double-CTAs." },
  too_long:       { kind: "tone", rule: "Keep messages shorter — usually 1–2 sentences for SMS/WA, 2–4 short lines for email." },
  too_soft:       { kind: "tone", rule: "Be a touch more direct — one clear micro-CTA per message instead of leaving it open." },
  too_generic:    { kind: "tone", rule: "Be more specific — reference the lead's actual project / area / question instead of generic phrasing." },
  wrong_strategy: { kind: "sales_logic", rule: "Strategy was wrong here — revisit the scenario playbook before drafting similar replies." },
  needs_uzair:    { kind: "escalation", rule: "This scenario should be escalated to Uzair, not handled solo by Zara." },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await anon.auth.getUser();
  return data.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: adminCheck } = await svc.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!adminCheck) return json({ error: "admin_required" }, 403);

    const body = await req.json().catch(() => ({}));
    const messageId: string = String(body?.messageId ?? "");
    const kind: string = String(body?.kind ?? "");
    const note: string | null = body?.note ?? null;
    const saveAs: string | null = body?.saveAs ?? null;
    const responseOverride: string | null = body?.responseTextOverride ?? null;
    const scenarioOverride: string | null = body?.scenarioOverride ?? null;

    if (!messageId) return json({ error: "messageId_required" }, 400);
    if (!FEEDBACK_KINDS.has(kind)) return json({ error: "invalid_kind" }, 400);

    // Load the assistant message
    const { data: msg, error: mErr } = await svc
      .from("zara_training_messages")
      .select("id, session_id, role, content, scenario_kind")
      .eq("id", messageId)
      .maybeSingle();
    if (mErr || !msg) return json({ error: "message_not_found" }, 404);
    if (msg.role !== "assistant") return json({ error: "only_assistant_messages_can_be_rated" }, 400);

    const scenarioKind = scenarioOverride ?? msg.scenario_kind ?? null;
    const responseText = responseOverride ?? msg.content;

    // 1. Mark the message
    await svc
      .from("zara_training_messages")
      .update({ feedback_kind: kind, feedback_note: note })
      .eq("id", messageId);

    // 2. Log to zara_training_feedback (existing table — best-effort)
    await svc.from("zara_training_feedback").insert({
      message_id: messageId,
      feedback_type: kind,
      note,
      created_by: user.id,
    } as any).then(() => null, () => null);

    // 3. Winning / bad library
    if (saveAs === "winning" || kind === "save_as_winning") {
      await svc.from("zara_winning_responses").insert({
        scenario_kind: scenarioKind,
        lead_situation: scenarioKind ? `Scenario: ${scenarioKind}` : "Training session response",
        response_text: responseText,
        why_it_works: note,
        source_message_id: messageId,
        created_by: user.id,
      });
    }
    if (saveAs === "bad" || kind === "save_as_bad") {
      await svc.from("zara_bad_responses").insert({
        scenario_kind: scenarioKind,
        response_text: responseText,
        reason: note ?? kind,
        source_message_id: messageId,
        created_by: user.id,
      });
    }

    // 4. Tone-rule seeding for negative feedback
    const ruleSeed = TONE_RULES_FROM_FEEDBACK[kind];
    if (ruleSeed) {
      await svc.from("zara_style_rules").insert({
        kind: ruleSeed.kind,
        rule: note ? `${ruleSeed.rule} — Uzair: "${note}"` : ruleSeed.rule,
        rationale: `Auto-seeded from feedback '${kind}'.`,
        source_message_id: messageId,
        active: true,
        created_by: user.id,
      });
    }

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: "feedback_failed", detail: String(e?.message ?? e) }, 500);
  }
});
