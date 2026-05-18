// zara-analyze-note — Extract relationship intelligence from a single
// manual agent note (call summary, meeting recap, observation, etc.)
// and roll it forward into the contact's zara_lead_memory.
//
// Manual notes are the HIGHEST-priority intelligence source. Website
// behavior, automation tags, and inferred scoring are all secondary.
//
// POST { note_id }                  → analyze that note
// POST { contact_id, backfill: true } → analyze recent un-analyzed notes
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_KEY  = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL        = "google/gemini-2.5-flash";

const SKIP_TYPES = new Set([
  "import_archive", "system", "ai_summary", "website_behavior",
]);

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SYSTEM_PROMPT = `You are Zara's Lead Intelligence Engine for a real-estate relationship manager.

You are reading a MANUAL AGENT NOTE — a call summary, meeting recap, or human observation written by Uzair (or another agent on his team) about a real buyer. These notes are the HIGHEST-quality intelligence source we have. They outweigh website behavior, tags, and automation. Treat every detail with care.

From the note, extract relationship intelligence as STRICT JSON. Only fill fields where the note gives real evidence. Do not invent. Empty arrays / nulls are fine.

{
  "summary": string,                  // 1-2 sentence human summary of WHO this buyer is right now
  "emotional_state": string | null,   // e.g. "cautious", "excited", "anxious about rates", "frustrated", "warming up"
  "trust_level": 1|2|3|4|5|null,      // 1 cold/transactional → 5 high-trust relationship
  "buying_readiness": 1|2|3|4|5|null, // 1 just looking → 5 ready to write
  "investor_vs_enduser": "investor"|"end_user"|"mixed"|null,
  "commitment_level": "low"|"medium"|"high"|null,
  "objections": string[],             // soft fears, not just price ("market may drop", "wife not sure")
  "motivations": string[],            // why they're buying ("growing family", "rental income", "schools")
  "financial_concerns": string[],     // payment sensitivity, financing, downpayment, rates
  "family_context": string | null,    // spouse / kids / parents — only if mentioned
  "timing_signals": string[],         // "wants to move before Sept", "no rush", "watching market"
  "preferred_areas": string[],        // cities or neighborhoods mentioned
  "escalation_signals": string[],     // urgency cues — "ready to write tonight", "lost a unit last week"
  "key_quote": string | null,         // the single most telling thing the buyer said (paraphrase ok)
  "recommended_style": string | null, // 1 sentence: how Zara should talk to them next ("calm + reassuring, avoid urgency")
  "recommended_next_step": string | null, // 1 sentence: what Zara should do next ("send Langley comp + ask about commute")
  "priority_delta": -2|-1|0|1|2       // should priority on this lead move down (-) or up (+) based on this note?
}

RULES
- If the note is system noise, import metadata, or has no relationship signal, return {"summary":null} and leave other fields empty.
- Never invent emotional state. If the note is purely factual ("called, left vm"), reflect that ("no emotional signal yet").
- recommended_style must respect the lead: if they're nervous about rates → calming; if they're hot → confident + clear next step.
- key_quote: paraphrase, never invent. If nothing quotable, null.
- Output JSON only. No prose.`;

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await anon.auth.getUser();
  return { user: data.user ?? null, client: anon };
}

async function analyzeOne(svc: any, note: { id: string; contact_id: string; content: string; note_type: string }) {
  if (SKIP_TYPES.has(note.note_type)) return { skipped: true, reason: "type_skipped" };
  const text = (note.content || "").trim();
  if (text.length < 12) return { skipped: true, reason: "too_short" };

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `NOTE (type: ${note.note_type}):\n${text.slice(0, 6000)}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  const txt = await r.text();
  if (!r.ok) {
    console.error("ai_failed", r.status, txt.slice(0, 300));
    return { skipped: true, reason: "ai_failed" };
  }
  let parsed: any = {};
  try { parsed = JSON.parse(JSON.parse(txt)?.choices?.[0]?.message?.content ?? "{}"); } catch {}

  const row = {
    note_id: note.id,
    contact_id: note.contact_id,
    summary: parsed.summary ?? null,
    emotional_state: parsed.emotional_state ?? null,
    trust_level: typeof parsed.trust_level === "number" ? parsed.trust_level : null,
    buying_readiness: typeof parsed.buying_readiness === "number" ? parsed.buying_readiness : null,
    investor_vs_enduser: parsed.investor_vs_enduser ?? null,
    commitment_level: parsed.commitment_level ?? null,
    objections: Array.isArray(parsed.objections) ? parsed.objections.slice(0, 12) : [],
    motivations: Array.isArray(parsed.motivations) ? parsed.motivations.slice(0, 12) : [],
    financial_concerns: Array.isArray(parsed.financial_concerns) ? parsed.financial_concerns.slice(0, 12) : [],
    family_context: parsed.family_context ?? null,
    timing_signals: Array.isArray(parsed.timing_signals) ? parsed.timing_signals.slice(0, 12) : [],
    preferred_areas: Array.isArray(parsed.preferred_areas) ? parsed.preferred_areas.slice(0, 12) : [],
    escalation_signals: Array.isArray(parsed.escalation_signals) ? parsed.escalation_signals.slice(0, 12) : [],
    key_quote: parsed.key_quote ?? null,
    recommended_style: parsed.recommended_style ?? null,
    recommended_next_step: parsed.recommended_next_step ?? null,
    priority_delta: typeof parsed.priority_delta === "number" ? Math.max(-2, Math.min(2, parsed.priority_delta)) : 0,
    raw: parsed,
    model: MODEL,
    analyzed_at: new Date().toISOString(),
  };
  const { error: upErr } = await svc.from("zara_note_intelligence").upsert(row, { onConflict: "note_id" });
  if (upErr) return { skipped: true, reason: "upsert_failed", detail: upErr.message };
  return { ok: true };
}

async function rollupContact(svc: any, contactId: string) {
  // Aggregate the 10 most-recent note-intel rows into a single lead-level
  // intelligence summary on zara_lead_memory.
  const { data: rows } = await svc
    .from("zara_note_intelligence")
    .select("*")
    .eq("contact_id", contactId)
    .order("analyzed_at", { ascending: false })
    .limit(10);
  if (!rows?.length) return;

  // Latest non-null wins; arrays union; numeric -> latest weighted avg.
  const merge = <T,>(getter: (r: any) => T | null | undefined): T | null => {
    for (const r of rows) {
      const v = getter(r);
      if (v != null && (typeof v !== "string" || v.trim())) return v as T;
    }
    return null;
  };
  const uniqArr = (key: string): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      for (const v of (r[key] ?? [])) {
        const s = String(v || "").trim();
        if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); }
      }
    }
    return out.slice(0, 16);
  };

  const objections     = uniqArr("objections");
  const motivations    = uniqArr("motivations");
  const financial      = uniqArr("financial_concerns");
  const timing         = uniqArr("timing_signals");
  const areas          = uniqArr("preferred_areas");
  const escalation     = uniqArr("escalation_signals");

  const trust = (() => {
    const vals = rows.map(r => r.trust_level).filter((x: any) => typeof x === "number");
    if (!vals.length) return null;
    // newer notes weighted more
    let num = 0, den = 0;
    vals.forEach((v: number, i: number) => { const w = vals.length - i; num += v * w; den += w; });
    return Math.round(num / den);
  })();
  const ready = (() => {
    const vals = rows.map(r => r.buying_readiness).filter((x: any) => typeof x === "number");
    if (!vals.length) return null;
    let num = 0, den = 0;
    vals.forEach((v: number, i: number) => { const w = vals.length - i; num += v * w; den += w; });
    return Math.round(num / den);
  })();
  const priority = rows.reduce((acc: number, r: any) => acc + (r.priority_delta || 0), 0);

  const latest = rows[0];
  const recentSummaries = rows.slice(0, 5).map(r => r.summary).filter(Boolean);
  const summary = recentSummaries.length
    ? recentSummaries.join(" ")
    : latest.summary;

  // Fold into facts JSONB so existing UI surfaces (RemembersCard etc.) pick it up.
  const { data: existing } = await svc
    .from("zara_lead_memory").select("facts, summary").eq("contact_id", contactId).maybeSingle();
  const oldFacts = (existing?.facts ?? {}) as Record<string, any>;

  const mergedFacts: Record<string, any> = { ...oldFacts };
  const setIf = (key: string, v: any) => { if (v != null && v !== "" && !(Array.isArray(v) && v.length === 0)) mergedFacts[key] = v; };

  setIf("emotional_state",      merge(r => r.emotional_state));
  setIf("trust_level",          trust);
  setIf("buying_readiness",     ready);
  setIf("commitment_level",     merge(r => r.commitment_level));
  setIf("investor_vs_enduser",  merge(r => r.investor_vs_enduser));
  setIf("family_situation",     merge(r => r.family_context));
  setIf("motivations",          motivations);
  setIf("emotional_objections", objections);
  setIf("financial_concerns",   financial);
  setIf("timing_concerns",      timing.join(" · ") || null);
  setIf("preferred_cities",     areas);
  setIf("escalation_signals",   escalation);
  const quotes = rows.map(r => r.key_quote).filter(Boolean).slice(0, 5);
  if (quotes.length) mergedFacts.key_quotes = Array.from(new Set([...(mergedFacts.key_quotes ?? []), ...quotes])).slice(0, 8);

  await svc.from("zara_lead_memory").upsert({
    contact_id: contactId,
    facts: mergedFacts,
    summary: existing?.summary || summary || `Intelligence rollup for ${contactId}.`,
    intelligence_summary: summary,
    recommended_style: merge(r => r.recommended_style),
    recommended_next_step: merge(r => r.recommended_next_step),
    intelligence_priority: priority,
    intelligence_refreshed_at: new Date().toISOString(),
    refreshed_at: new Date().toISOString(),
    refresh_reason: "note_intelligence",
  }, { onConflict: "contact_id" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const ctx = await getUser(req);
    if (!ctx?.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    // Mode A: analyze a single note
    if (body.note_id) {
      const { data: note, error } = await svc.from("crm_notes")
        .select("id, contact_id, content, note_type")
        .eq("id", body.note_id).maybeSingle();
      if (error || !note) return json({ error: "note_not_found" }, 404);
      // RLS: ensure caller can see the contact
      const { data: visible } = await ctx.client.from("crm_contacts").select("id").eq("id", note.contact_id).maybeSingle();
      if (!visible) return json({ error: "forbidden" }, 403);

      const res = await analyzeOne(svc, note as any);
      if (!res?.skipped) await rollupContact(svc, note.contact_id);
      return json({ ok: true, ...res, contact_id: note.contact_id });
    }

    // Mode B: backfill recent notes for a contact
    if (body.contact_id) {
      const contactId = String(body.contact_id);
      const { data: visible } = await ctx.client.from("crm_contacts").select("id").eq("id", contactId).maybeSingle();
      if (!visible) return json({ error: "forbidden" }, 403);

      const { data: notes } = await svc.from("crm_notes")
        .select("id, contact_id, content, note_type")
        .eq("contact_id", contactId)
        .not("note_type", "in", `(${[...SKIP_TYPES].map(t => `"${t}"`).join(",")})`)
        .order("created_at", { ascending: false })
        .limit(15);
      const list = notes ?? [];

      // Skip notes already analyzed
      const { data: existing } = await svc.from("zara_note_intelligence")
        .select("note_id").in("note_id", list.map(n => n.id));
      const have = new Set((existing ?? []).map((r: any) => r.note_id));
      const todo = list.filter(n => !have.has(n.id));

      let analyzed = 0;
      for (const n of todo) {
        const r = await analyzeOne(svc, n as any);
        if (r?.ok) analyzed++;
      }
      if (analyzed > 0 || body.force_rollup) await rollupContact(svc, contactId);
      return json({ ok: true, analyzed, total_scanned: list.length });
    }

    return json({ error: "missing_note_id_or_contact_id" }, 400);
  } catch (e: any) {
    return json({ error: "analyze_failed", detail: String(e?.message ?? e) }, 500);
  }
});
