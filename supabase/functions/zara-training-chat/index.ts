// zara-training-chat — internal admin-only training chat endpoint for "Train Zara".
// POST { sessionId?: string, message: string, scenarioKind?: string, contactId?: string, title?: string }
// Behavior:
//   1. Verify caller is admin via has_role(auth.uid(),'admin')
//   2. Create or reuse a zara_training_sessions row
//   3. Persist user message, build context (active planner v2 prompt + training addendum + recent messages)
//   4. Call Lovable AI Gateway
//   5. Persist assistant message, return { sessionId, assistantMessageId, content, askUzair }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-pro";
const HISTORY_LIMIT = 30;

const TRAINING_ADDENDUM = `
---
TRAINING MODE (internal — never shown to leads)
You are in a private training session with Uzair (or an approved admin from The Presale Properties Group). This is NOT a lead conversation. Your job here is to LEARN Uzair's tone, sales logic, objection handling, follow-up style, booking strategy, and communication preferences.

How you behave in training mode:
- Speak naturally and conversationally with Uzair. You can ask him questions, propose drafts, and request feedback.
- When given a SCENARIO (e.g. "investor lead", "pricing objection"), generate a realistic lead message in that scenario, then ASK Uzair things like:
  • "How would you reply to this lead?"
  • "Would you push for a call here?"
  • "Should this be handled by me or escalated to you?"
  • "Which response sounds more like your style — A or B?"
  • "What should I avoid saying here?"
- When you draft a sample reply, keep it short and clearly mark it as a draft for review.
- If you are uncertain about pricing, investment claims, legal/mortgage topics, or how to handle a high-value lead, set ask_uzair=true and ask a clear, specific question.
- Always stay in the relationship-manager identity (Zara from Uzair's team — never "AI assistant" or "digital concierge").

Return STRICT JSON ONLY:
{ "reply": "your response in plain text or markdown", "ask_uzair": boolean, "ask_uzair_question": "string|null", "scenario_lead_message": "string|null (the simulated lead message when starting a scenario)", "suggested_next_step": "string|null" }
`.trim();

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

async function loadActivePrompt(svc: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await svc
    .from("zara_system_prompts")
    .select("prompt_text")
    .eq("name", "planner")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.prompt_text as string | undefined) ?? "You are Zara from The Presale Properties Group.";
}

async function loadActiveStyleRules(svc: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await svc
    .from("zara_style_rules")
    .select("kind, rule")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!data?.length) return "";
  const lines = data.map((r: any) => `- [${r.kind}] ${r.rule}`).join("\n");
  return `\n---\nLEARNED STYLE RULES (from training feedback — apply these):\n${lines}`;
}

async function callLovableAI(system: string, messages: Array<{ role: string; content: string }>) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, ...messages],
      response_format: { type: "json_object" },
      temperature: 0.6,
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`AI ${r.status}: ${text.slice(0, 400)}`);
  const parsed = JSON.parse(text);
  const content = parsed?.choices?.[0]?.message?.content ?? "{}";
  let obj: any = {};
  try { obj = JSON.parse(content); } catch { obj = { reply: String(content) }; }
  return obj;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    // Admin check
    const { data: adminCheck } = await svc.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!adminCheck) return json({ error: "admin_required" }, 403);

    const body = await req.json().catch(() => ({}));
    const userText: string = String(body?.message ?? "").trim();
    const scenarioKind: string | null = body?.scenarioKind ?? null;
    const contactId: string | null = body?.contactId ?? null;
    const titleHint: string | null = body?.title ?? null;
    let sessionId: string | null = body?.sessionId ?? null;

    if (!userText && !scenarioKind) return json({ error: "message_or_scenario_required" }, 400);

    // 1. Create session if needed
    if (!sessionId) {
      const initialTitle = titleHint || (scenarioKind ? `Scenario: ${scenarioKind}` : (userText.slice(0, 60) || "Training session"));
      const { data: s, error: sErr } = await svc
        .from("zara_training_sessions")
        .insert({
          owner_user_id: user.id,
          title: initialTitle,
          scenario_kind: scenarioKind,
          contact_id: contactId,
        })
        .select("id")
        .single();
      if (sErr) return json({ error: "session_create_failed", detail: sErr.message }, 500);
      sessionId = s.id as string;
    }

    // 2. Persist user message (skip if user is starting with just a scenario)
    if (userText) {
      await svc.from("zara_training_messages").insert({
        session_id: sessionId,
        role: "user",
        content: userText,
        scenario_kind: scenarioKind,
      });
    }

    // 3. Load history
    const { data: history = [] } = await svc
      .from("zara_training_messages")
      .select("role, content, created_at")
      .eq("session_id", sessionId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(HISTORY_LIMIT);

    const messagesForAI: Array<{ role: string; content: string }> = (history as any[]).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // If brand-new session with only a scenario (no user text yet), seed a user turn
    if (messagesForAI.length === 0 && scenarioKind && !userText) {
      const seed = `Scenario: ${scenarioKind}. Generate a realistic lead message for this scenario, then ask me how I'd handle it.`;
      messagesForAI.push({ role: "user", content: seed });
      await svc.from("zara_training_messages").insert({
        session_id: sessionId,
        role: "user",
        content: seed,
        scenario_kind: scenarioKind,
        meta: { auto_seed: true },
      });
    }

    // 4. Build system prompt
    const basePrompt = await loadActivePrompt(svc);
    const styleRules = await loadActiveStyleRules(svc);
    const systemPrompt = `${basePrompt}\n${TRAINING_ADDENDUM}${styleRules}`;

    // 5. Call AI
    const ai = await callLovableAI(systemPrompt, messagesForAI);
    const reply: string = String(ai?.reply ?? "").trim() || "(no reply)";
    const askUzair: boolean = Boolean(ai?.ask_uzair);
    const askUzairQuestion: string | null = ai?.ask_uzair_question ?? null;
    const scenarioLeadMessage: string | null = ai?.scenario_lead_message ?? null;
    const suggestedNextStep: string | null = ai?.suggested_next_step ?? null;

    // 6. Persist assistant message
    const { data: assistantRow, error: aErr } = await svc
      .from("zara_training_messages")
      .insert({
        session_id: sessionId,
        role: "assistant",
        content: reply,
        scenario_kind: scenarioKind,
        ask_uzair: askUzair,
        meta: {
          ask_uzair_question: askUzairQuestion,
          scenario_lead_message: scenarioLeadMessage,
          suggested_next_step: suggestedNextStep,
          model: MODEL,
        },
      })
      .select("id")
      .single();
    if (aErr) return json({ error: "assistant_persist_failed", detail: aErr.message }, 500);

    // 7. If askUzair, also queue a prompt_updates row of kind='ask_uzair' for review
    if (askUzair && askUzairQuestion) {
      await svc.from("zara_prompt_updates").insert({
        kind: "ask_uzair",
        proposal: askUzairQuestion,
        rationale: "Zara flagged uncertainty during training and is asking Uzair to clarify.",
        source_session_id: sessionId,
        source_message_id: assistantRow.id,
        created_by: user.id,
      });
    }

    return json({
      sessionId,
      assistantMessageId: assistantRow.id,
      content: reply,
      askUzair,
      askUzairQuestion,
      scenarioLeadMessage,
      suggestedNextStep,
    });
  } catch (e: any) {
    return json({ error: "training_chat_failed", detail: String(e?.message ?? e) }, 500);
  }
});
