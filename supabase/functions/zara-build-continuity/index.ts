// zara-build-continuity — Relationship Memory Continuity layer.
//
// Mines a contact's history (events, activity, showings, current memory)
// and uses AI to extract enriched buyer context PLUS short, natural
// "continuity openers" Zara can drop into future conversations.
//
// POST { contact_id }  (admin or any agent who can see the contact)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SYSTEM_PROMPT = `You are building Zara's RELATIONSHIP MEMORY for a real-estate lead.

CRITICAL PRIORITY ORDER (apply in this order, never reversed):
  1. MANUAL AGENT NOTES + note_intelligence rollup — highest-quality evidence. These are observations from the founder/agent who actually spoke to this buyer. Trust them over everything else.
  2. Appointments, showings, calls — direct relationship events.
  3. Website behavior + activity events — supporting context only.
  4. Tags and automation flags — weakest signal.

If a manual note says "buyer is nervous about rates" and a website tag says "hot", the buyer is nervous — period. Tone, next step, and stage MUST reflect the human-observed reality, not the automation.

Zara is the relationship manager on Uzair's team at The Presale Properties Group. The point of this memory is to make future conversations feel like ONE ongoing relationship — never like a cold sales blast.

Your job: from the lead's history below, produce a compact JSON memory that captures:

- buyer goals (investor vs end-user — only if clearly evident)
- emotional continuity (what they care about, what's holding them back)
- preferred cities / projects / property type
- school + commute concerns (only if mentioned)
- family situation (only if mentioned)
- budget range + timing concerns
- emotional objections / hesitation (soft fears, not just price)
- projects they've viewed, compared, downloaded floor plans for
- appointment history (booked / showed / missed / completed)

THEN write 2-4 "continuity openers" — short natural sentences Zara can use to reference prior context. They MUST feel:
- natural, helpful, human, contextual
- never creepy, never quoting back creepy detail, never surveillance-y
- like a thoughtful agent who remembers, not a system reading a file

Good examples:
- "Last time you were leaning toward Langley because of commute and schools."
- "You were comparing a few Surrey projects before."
- "Still mainly focused on investment opportunities?"
- "I know timing felt tight in spring — has that shifted?"

Bad examples (NEVER produce):
- "Our records show you opened our email 7 times."
- "You downloaded the X floorplan on March 14 at 3:42 PM."
- Anything that sounds like tracking telemetry.

Also pick ONE relationship_stage: discovery | considering | comparing | decision | post-appointment | dormant.

Return STRICT JSON:
{
  "facts_delta": {
    "investor_vs_enduser": "investor" | "end_user" | "mixed" | null,
    "preferred_cities": string[],
    "preferred_property_type": string | null,
    "school_preferences": string | null,
    "commute_concerns": string | null,
    "timing_concerns": string | null,
    "emotional_objections": string[],
    "emotional_hesitation": string | null,
    "projects_compared": string[],
    "viewed_projects": string[],
    "downloaded_floorplans": string[],
    "appointment_history": [{"kind":"booked|showed|missed|completed","when":"YYYY-MM-DD","project":"..."}]
  },
  "continuity_openers": string[],
  "relationship_stage": "discovery|considering|comparing|decision|post-appointment|dormant",
  "last_topics": string[]
}

Only include fields you have real evidence for. Empty arrays / nulls are fine. Do NOT invent.`;

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

function uniq<T>(xs: T[]): T[] { return Array.from(new Set(xs.filter(Boolean))); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const ctx = await getUser(req);
    if (!ctx?.user) return json({ error: "unauthorized" }, 401);
    const userClient = ctx.client;

    const body = await req.json().catch(() => ({}));
    const contactId: string | undefined = body?.contact_id;
    if (!contactId) return json({ error: "missing_contact_id" }, 400);

    // RLS check via user client — caller must be able to see the contact
    const { data: contact, error: cErr } = await userClient
      .from("crm_contacts")
      .select("id, first_name, last_name, tags, language, contact_type, budget_min, budget_max, project_interest, city, country, notes")
      .eq("id", contactId)
      .maybeSingle();
    if (cErr || !contact) return json({ error: "contact_not_found_or_forbidden" }, 404);

    // Mine history via service role
    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const [memRes, engRes, actRes, showRes] = await Promise.all([
      svc.from("zara_lead_memory").select("*").eq("contact_id", contactId).maybeSingle(),
      svc.from("crm_engagement_events")
        .select("event_type, source, direction, occurred_at, metadata")
        .eq("contact_id", contactId)
        .order("occurred_at", { ascending: false })
        .limit(80),
      svc.from("crm_activity_events")
        .select("type, project_slug, occurred_at, metadata")
        .eq("contact_id", contactId)
        .order("occurred_at", { ascending: false })
        .limit(80),
      svc.from("crm_showings")
        .select("id, status, scheduled_at, project_name, notes")
        .eq("contact_id", contactId)
        .order("scheduled_at", { ascending: false })
        .limit(20)
        .then(r => r, () => ({ data: [] as any[] })),
    ]);

    const existingMemory = memRes.data;
    const events = engRes.data ?? [];
    const activity = actRes.data ?? [];
    const showings = (showRes as any).data ?? [];

    // Pre-compute structured signals so the LLM has clean evidence
    const viewed = uniq(activity.filter(a => /view|page|return_visit/i.test(a.type) && a.project_slug).map(a => a.project_slug as string));
    const downloaded = uniq(activity.filter(a => /floorplan|download/i.test(a.type)).map(a => a.project_slug as string).filter(Boolean));
    const appointmentEvents = showings.map((s: any) => ({
      kind: s.status, when: s.scheduled_at?.slice(0, 10), project: s.project_name,
    }));

    const compact = {
      contact: {
        name: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "(unknown)",
        tags: contact.tags ?? [],
        language: contact.language,
        contact_type: contact.contact_type,
        budget: [contact.budget_min, contact.budget_max],
        project_interest: contact.project_interest,
        city: contact.city,
        notes: (contact.notes || "").slice(0, 1500),
      },
      existing_facts: existingMemory?.facts ?? {},
      existing_summary: existingMemory?.summary ?? null,
      derived: {
        viewed_projects: viewed,
        downloaded_floorplans: downloaded,
        appointment_history: appointmentEvents,
      },
      recent_events: events.slice(0, 40).map(e => ({
        t: e.event_type, src: e.source, dir: e.direction,
        when: e.occurred_at?.slice(0, 10),
        meta: typeof e.metadata === "object" ? JSON.stringify(e.metadata).slice(0, 200) : null,
      })),
      recent_activity: activity.slice(0, 40).map(a => ({
        t: a.type, project: a.project_slug,
        when: a.occurred_at?.slice(0, 10),
        meta: typeof a.metadata === "object" ? JSON.stringify(a.metadata).slice(0, 200) : null,
      })),
    };

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(compact).slice(0, 14000) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    const txt = await r.text();
    if (!r.ok) return json({ error: "ai_failed", detail: txt.slice(0, 400) }, 502);

    let parsed: any = {};
    try {
      const j = JSON.parse(txt);
      parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    } catch { parsed = {}; }

    const factsDelta = parsed?.facts_delta ?? {};
    const openers: string[] = Array.isArray(parsed?.continuity_openers) ? parsed.continuity_openers.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 6) : [];
    const stage: string | null = typeof parsed?.relationship_stage === "string" ? parsed.relationship_stage : null;
    const lastTopics: string[] = Array.isArray(parsed?.last_topics) ? parsed.last_topics.filter((s: any) => typeof s === "string") : [];

    // Merge with existing facts: prefer new non-empty values, preserve old ones otherwise.
    const oldFacts = (existingMemory?.facts ?? {}) as Record<string, any>;
    const mergedFacts: Record<string, any> = { ...oldFacts };
    for (const [k, v] of Object.entries(factsDelta)) {
      if (v == null) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === "string" && !v.trim()) continue;
      if (Array.isArray(v) && Array.isArray(oldFacts[k])) {
        mergedFacts[k] = uniq([...(oldFacts[k] as any[]), ...v]);
      } else {
        mergedFacts[k] = v;
      }
    }
    // Also ensure derived structured arrays are present
    if (viewed.length)     mergedFacts.viewed_projects     = uniq([...(mergedFacts.viewed_projects ?? []), ...viewed]);
    if (downloaded.length) mergedFacts.downloaded_floorplans = uniq([...(mergedFacts.downloaded_floorplans ?? []), ...downloaded]);
    if (appointmentEvents.length) mergedFacts.appointment_history = appointmentEvents;

    const upsertRow: any = {
      contact_id: contactId,
      facts: mergedFacts,
      continuity_openers: openers,
      last_topics: lastTopics,
      continuity_refreshed_at: new Date().toISOString(),
      refreshed_at: existingMemory?.refreshed_at ?? new Date().toISOString(),
      summary: existingMemory?.summary ?? `Continuity built for ${compact.contact.name}.`,
      refresh_reason: existingMemory?.refresh_reason ?? "continuity",
    };
    if (stage) upsertRow.relationship_stage = stage;

    const { error: upErr } = await svc.from("zara_lead_memory").upsert(upsertRow, { onConflict: "contact_id" });
    if (upErr) return json({ error: "upsert_failed", detail: upErr.message }, 500);

    return json({
      ok: true,
      contact_id: contactId,
      relationship_stage: stage,
      continuity_openers: openers,
      facts_added: Object.keys(factsDelta || {}).filter(k => factsDelta[k] != null && !(Array.isArray(factsDelta[k]) && factsDelta[k].length === 0)),
    });
  } catch (e: any) {
    return json({ error: "build_continuity_failed", detail: String(e?.message ?? e) }, 500);
  }
});
