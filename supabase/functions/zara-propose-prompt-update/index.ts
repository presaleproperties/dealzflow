// zara-propose-prompt-update — reviews recent training feedback and proposes
// a system-prompt addendum. Inserts into zara_prompt_updates with status='pending'.
// Never auto-applies — admin must approve via the Training Chat UI.
//
// POST {} — looks back at the last 14 days of feedback + style rules
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const sinceIso = new Date(Date.now() - 14 * 86400_000).toISOString();

    const [rulesRes, winRes, badRes, msgRes] = await Promise.all([
      svc.from("zara_style_rules").select("kind, rule").eq("active", true).gte("created_at", sinceIso).limit(60),
      svc.from("zara_winning_responses").select("scenario_kind, response_text, why_it_works").gte("created_at", sinceIso).limit(20),
      svc.from("zara_bad_responses").select("scenario_kind, response_text, reason").gte("created_at", sinceIso).limit(20),
      svc.from("zara_training_messages")
        .select("scenario_kind, feedback_kind, feedback_note, content")
        .not("feedback_kind", "is", null)
        .gte("created_at", sinceIso)
        .limit(60),
    ]);

    const summaryInput = {
      style_rules: rulesRes.data ?? [],
      winning: winRes.data ?? [],
      bad: badRes.data ?? [],
      feedback_events: msgRes.data ?? [],
    };

    const systemPrompt = `You are a prompt engineer for Zara, a real-estate relationship manager AI. Given recent training feedback from Uzair, propose a SHORT addendum (max ~250 words) to append to Zara's system prompt that captures the new tone/strategy/escalation patterns Uzair has been teaching her.

Rules:
- Only suggest changes the evidence clearly supports.
- Keep Uzair's voice — premium, conversational, low-pressure, never "AI assistant" or "digital concierge".
- Bullet-point friendly.
- Do NOT rewrite the whole prompt — write only the new addendum lines.

Return STRICT JSON:
{ "proposal": "string (addendum text)", "rationale": "1-2 sentences explaining what changed and why", "evidence_count": number }`;

    const userPrompt = `Recent training evidence (14 days):\n${JSON.stringify(summaryInput, null, 2).slice(0, 12000)}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    const text = await r.text();
    if (!r.ok) return json({ error: "ai_failed", detail: text.slice(0, 400) }, 502);
    const parsed = JSON.parse(text);
    const obj = JSON.parse(parsed?.choices?.[0]?.message?.content ?? "{}");

    const proposal: string = String(obj?.proposal ?? "").trim();
    const rationale: string = String(obj?.rationale ?? "").trim();
    if (!proposal) return json({ error: "no_proposal_generated" }, 422);

    const { data: row, error: insErr } = await svc
      .from("zara_prompt_updates")
      .insert({
        kind: "addendum",
        proposal,
        rationale,
        status: "pending",
        evidence: summaryInput as any,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (insErr) return json({ error: "insert_failed", detail: insErr.message }, 500);

    return json({ ok: true, id: row.id, proposal, rationale });
  } catch (e: any) {
    return json({ error: "propose_failed", detail: String(e?.message ?? e) }, 500);
  }
});
