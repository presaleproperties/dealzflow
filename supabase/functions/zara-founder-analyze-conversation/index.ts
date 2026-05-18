// zara-founder-analyze-conversation — admin-only. Analyzes an uploaded real conversation
// and stores progression, trust moments, reply triggers, momentum + extracted lessons.
// POST { conversationId }
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

const SYSTEM = `You analyze real presale-real-estate conversations between an agent (Uzair / Presale Properties Group) and a lead. You distill what worked.

Return STRICT JSON ONLY:
{
  "progression": "1-3 sentence narrative of emotional progression",
  "trust_moments": ["specific quote or moment that built trust"],
  "reply_triggers": ["what specifically caused the lead to reply or re-engage"],
  "momentum_moves": ["agent moves that created momentum toward appointment"],
  "appointment_trigger": "the moment / wording that actually got the appointment, or null",
  "lessons": [
    { "module_slug": "objection_handling|communication_dna|buyer_psychology|relationship_strategy|escalation_timing|sales_philosophy|investor_philosophy|project_evaluation|real_conversation_learning|founder_memory_retrieval",
      "summary": "short takeaway",
      "detail": "1-2 sentences",
      "tags": ["pricing","investor"]
    }
  ],
  "tags": ["sms","investor","booked_appointment"],
  "emotional_state": "overwhelmed|skeptical|engaged|analytical|nervous|appointment_ready|ghost|null"
}`;

async function callAI(prompt: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });
  const text = await r.text();
  if (r.status === 429) throw new Error("rate_limited");
  if (r.status === 402) throw new Error("credits_exhausted");
  if (!r.ok) throw new Error(`AI ${r.status}: ${text.slice(0, 400)}`);
  const parsed = JSON.parse(text);
  const content = parsed?.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(content); } catch { return {}; }
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

    const { conversationId } = await req.json().catch(() => ({}));
    if (!conversationId) return json({ error: "conversationId_required" }, 400);

    const { data: conv, error: cErr } = await svc.from("zara_founder_conversations")
      .select("id,title,channel,transcript,outcome,lead_persona,tags,notes").eq("id", conversationId).maybeSingle();
    if (cErr || !conv) return json({ error: "conversation_not_found" }, 404);

    const prompt = `Channel: ${conv.channel}
Outcome: ${conv.outcome ?? "unknown"}
Lead persona: ${conv.lead_persona ?? "unknown"}
Existing tags: ${(conv.tags ?? []).join(", ") || "none"}
Notes: ${conv.notes ?? "none"}

Transcript:
"""
${String(conv.transcript).slice(0, 18000)}
"""`;

    const analysis = await callAI(prompt);

    await svc.from("zara_founder_conversations").update({
      analyzed_at: new Date().toISOString(),
      analysis,
      emotional_state: analysis?.emotional_state ?? null,
      tags: Array.from(new Set([...(conv.tags ?? []), ...((analysis?.tags ?? []) as string[])])).slice(0, 24),
    }).eq("id", conversationId);

    // Persist extracted lessons
    const lessons: any[] = Array.isArray(analysis?.lessons) ? analysis.lessons : [];
    if (lessons.length) {
      const moduleMap = Object.fromEntries(
        (await svc.from("zara_founder_modules").select("slug,id")).data?.map((m: any) => [m.slug, m.id]) ?? []
      );
      const rows = lessons.map((l) => ({
        module_id: moduleMap[l?.module_slug] ?? null,
        summary: String(l?.summary ?? "").slice(0, 500),
        detail: l?.detail ? String(l.detail).slice(0, 2000) : null,
        tags: Array.isArray(l?.tags) ? l.tags.map(String).slice(0, 12) : [],
        source_kind: "conversation",
        source_id: conversationId,
        created_by: user.id,
      })).filter((r) => r.summary);
      if (rows.length) await svc.from("zara_founder_lessons").insert(rows);
    }

    return json({ ok: true, analysis });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg === "rate_limited") return json({ error: "rate_limited" }, 429);
    if (msg === "credits_exhausted") return json({ error: "credits_exhausted" }, 402);
    return json({ error: "analyze_failed", detail: msg }, 500);
  }
});
