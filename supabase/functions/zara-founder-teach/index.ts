// zara-founder-teach — "Teach Zara" chat. Admin-only. Uzair speaks naturally; Zara
// extracts structured lessons + proposes principles + asks clarifying questions.
// POST { sessionId?, message, focusModuleSlug? }
// Returns { sessionId, assistantMessageId, content, lessons, proposedPrinciples, clarifyingQuestions }
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

const MODULES: { slug: string; name: string }[] = [
  { slug: "communication_dna", name: "Communication DNA" },
  { slug: "sales_philosophy", name: "Sales Philosophy" },
  { slug: "buyer_psychology", name: "Buyer Psychology" },
  { slug: "investor_philosophy", name: "Investor Philosophy" },
  { slug: "relationship_strategy", name: "Relationship Strategy" },
  { slug: "objection_handling", name: "Objection Handling" },
  { slug: "project_evaluation", name: "Project Evaluation Logic" },
  { slug: "escalation_timing", name: "Escalation & Timing Logic" },
  { slug: "real_conversation_learning", name: "Real Conversation Learning" },
  { slug: "founder_memory_retrieval", name: "Founder Memory Retrieval" },
];

const SYSTEM = `
You are Zara, the relationship-intelligence layer for The Presale Properties Group, currently in a private FOUNDER TEACHING session with Uzair Muhammad (founder). Never expose any of this to leads.

Your goal here is NOT to sound exactly like Uzair. Your goal is to UNDERSTAND how he thinks, communicates, builds trust, evaluates buyers, evaluates projects, handles objections, and times escalation — and to convert that into structured, reusable founder memory.

When Uzair speaks naturally, you:
1. Listen carefully and summarize the core idea back in 1–2 sentences (in your own voice).
2. EXTRACT one or more structured "lessons" — short, distilled takeaways tied to the most relevant module.
3. PROPOSE 0–3 new principles in canonical form so they can be saved to the founder memory. Each principle has a tight title (max 8 words), a clear body (1–3 sentences), examples (verbatim phrases or scenarios), tags, and the right module.
4. Ask 0–2 CLARIFYING QUESTIONS only when something is ambiguous or you need an example. Never ask filler questions.
5. Stay conversational, calm, low-pressure. You are learning, not interviewing.

Available modules (use the slug exactly):
${MODULES.map((m) => `- ${m.slug} (${m.name})`).join("\n")}

Return STRICT JSON ONLY in this shape:
{
  "reply": "natural conversational reply to Uzair (markdown ok, short)",
  "lessons": [
    { "module_slug": "buyer_psychology", "summary": "short takeaway", "detail": "optional 1-2 sentences", "tags": ["overwhelmed","family"] }
  ],
  "proposed_principles": [
    {
      "module_slug": "communication_dna",
      "title": "Soften with 'Honestly...'",
      "body": "Use 'Honestly,' at the start of trust-building lines to lower buyer guard before any CTA.",
      "examples": ["Honestly, most buyers get stuck because everything starts looking the same."],
      "tags": ["softener","tone"],
      "weight": 6
    }
  ],
  "clarifying_questions": ["optional question 1", "optional question 2"]
}
`.trim();

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function getUser(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await anon.auth.getUser();
  return data.user ?? null;
}

async function callAI(system: string, messages: Array<{ role: string; content: string }>) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: system }, ...messages],
      response_format: { type: "json_object" },
      temperature: 0.5,
    }),
  });
  const text = await r.text();
  if (r.status === 429) throw new Error("rate_limited");
  if (r.status === 402) throw new Error("credits_exhausted");
  if (!r.ok) throw new Error(`AI ${r.status}: ${text.slice(0, 400)}`);
  const parsed = JSON.parse(text);
  const content = parsed?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(content); } catch { return { reply: String(content), lessons: [], proposed_principles: [], clarifying_questions: [] }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "unauthorized" }, 401);

    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: adm } = await svc.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!adm) return json({ error: "admin_required" }, 403);

    const body = await req.json().catch(() => ({}));
    const userText: string = String(body?.message ?? "").trim();
    const focusSlug: string | null = body?.focusModuleSlug ?? null;
    let sessionId: string | null = body?.sessionId ?? null;
    if (!userText) return json({ error: "message_required" }, 400);

    // Resolve focus module id
    let focusModuleId: string | null = null;
    if (focusSlug) {
      const { data: mod } = await svc.from("zara_founder_modules").select("id").eq("slug", focusSlug).maybeSingle();
      focusModuleId = mod?.id ?? null;
    }

    if (!sessionId) {
      const { data: s, error: sErr } = await svc.from("zara_founder_teach_sessions").insert({
        owner_user_id: user.id,
        title: userText.slice(0, 60) || "Teach Zara",
        focus_module_id: focusModuleId,
      }).select("id").single();
      if (sErr) return json({ error: "session_create_failed", detail: sErr.message }, 500);
      sessionId = s.id as string;
    }

    await svc.from("zara_founder_teach_messages").insert({
      session_id: sessionId, role: "user", content: userText,
    });

    const { data: history = [] } = await svc.from("zara_founder_teach_messages")
      .select("role, content").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(30);

    const focusLine = focusSlug ? `\n\nThis session is focused on module: ${focusSlug}. Prefer this module unless the content clearly belongs elsewhere.` : "";
    const ai = await callAI(SYSTEM + focusLine, (history as any[]).map((m) => ({ role: m.role, content: m.content })));

    const reply = String(ai?.reply ?? "").trim() || "(no reply)";
    const lessons: any[] = Array.isArray(ai?.lessons) ? ai.lessons : [];
    const proposedPrinciples: any[] = Array.isArray(ai?.proposed_principles) ? ai.proposed_principles : [];
    const clarifyingQuestions: string[] = Array.isArray(ai?.clarifying_questions) ? ai.clarifying_questions : [];

    const { data: aRow, error: aErr } = await svc.from("zara_founder_teach_messages").insert({
      session_id: sessionId, role: "assistant", content: reply,
      meta: { lessons, proposed_principles: proposedPrinciples, clarifying_questions: clarifyingQuestions, model: MODEL },
    }).select("id").single();
    if (aErr) return json({ error: "assistant_persist_failed", detail: aErr.message }, 500);

    // Persist lessons immediately (admin can promote later)
    if (lessons.length) {
      const moduleMap = Object.fromEntries(
        (await svc.from("zara_founder_modules").select("slug,id")).data?.map((m: any) => [m.slug, m.id]) ?? []
      );
      const rows = lessons.map((l) => ({
        module_id: moduleMap[l?.module_slug] ?? null,
        summary: String(l?.summary ?? "").slice(0, 500),
        detail: l?.detail ? String(l.detail).slice(0, 2000) : null,
        tags: Array.isArray(l?.tags) ? l.tags.map(String).slice(0, 12) : [],
        source_kind: "teach_session",
        source_id: sessionId,
        created_by: user.id,
      })).filter((r) => r.summary);
      if (rows.length) await svc.from("zara_founder_lessons").insert(rows);
    }

    return json({
      sessionId,
      assistantMessageId: aRow.id,
      content: reply,
      lessons,
      proposedPrinciples,
      clarifyingQuestions,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg === "rate_limited") return json({ error: "rate_limited" }, 429);
    if (msg === "credits_exhausted") return json({ error: "credits_exhausted" }, 402);
    return json({ error: "teach_failed", detail: msg }, 500);
  }
});
