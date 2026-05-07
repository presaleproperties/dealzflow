// Generate an AI summary for a lead and upsert it as a pinned ai_summary note.
// Body: { contact_id: string, force?: boolean }
// Or:   { bulk: true, limit?: number, only_stale?: boolean } — iterate stale leads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function fmtMoney(n: number | null) {
  if (!n) return null;
  return "$" + Math.round(n / 1000) + "K";
}

async function buildContext(supa: any, contactId: string) {
  const { data: c } = await supa.from("crm_contacts").select("*").eq("id", contactId).maybeSingle();
  if (!c) throw new Error("contact not found");

  const { data: notes } = await supa
    .from("crm_notes")
    .select("content, note_type, event_at, created_at")
    .eq("contact_id", contactId)
    .neq("note_type", "ai_summary")
    .neq("note_type", "import_archive")
    .order("event_at", { ascending: false, nullsFirst: false })
    .limit(40);

  const { data: emails } = await supa
    .from("crm_email_log")
    .select("subject, direction, sent_at")
    .eq("contact_id", contactId)
    .order("sent_at", { ascending: false })
    .limit(15);

  const { data: showings } = await supa
    .from("crm_showings")
    .select("project, unit, showing_date, status")
    .eq("contact_id", contactId)
    .order("showing_date", { ascending: false })
    .limit(5);

  return { c, notes: notes || [], emails: emails || [], showings: showings || [] };
}

function makePrompt(ctx: any) {
  const { c, notes, emails, showings } = ctx;
  const facts = {
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    source: c.source,
    lead_type: c.lead_type || (c.lead_types || []).join(", "),
    project: c.project || (c.projects || []).join(", "),
    status: c.status,
    assigned_to: c.assigned_to,
    city: c.city || c.city_pref,
    language: c.language,
    property_type_pref: c.property_type_pref,
    bedrooms: c.bedrooms_preferred,
    budget: c.budget_min || c.budget_max
      ? `${fmtMoney(c.budget_min) || "?"} – ${fmtMoney(c.budget_max) || "?"}`
      : null,
    tags: (c.tags || []).join(", "),
    created_at: c.created_at,
    last_touch_at: c.last_touch_at,
    last_touch_type: c.last_touch_type,
    lead_score: c.lead_score,
    email_count: emails.length,
    showings_count: showings.length,
    note_count: notes.length,
    recent_notes: notes.slice(0, 8).map((n: any) =>
      `[${n.note_type}] ${(n.content || "").slice(0, 200)}`
    ),
    recent_emails: emails.slice(0, 5).map((e: any) =>
      `${e.direction}: ${e.subject || "(no subject)"}`
    ),
  };

  return `You are summarizing a real estate lead for an agent's quick scan.

LEAD DATA (JSON):
${JSON.stringify(facts, null, 2)}

Write 2-4 short sentences an agent can read in 5 seconds. Cover only what matters:
- Lead type + source/project (e.g. "First-time buyer from Facebook Ad for Mountvue")
- What they want (budget, city, beds) — only if known
- Most recent meaningful signal (showing booked, replied, ghosting, hot interest)

Rules:
- Plain prose. No markdown headings, no bullets, no lists.
- Use **bold** at most ONCE for the single most important fact (usually the project or a hot signal). Often use no bold at all.
- Do NOT restate the assigned agent, pipeline status, or lead score — the UI already shows these.
- Do NOT pad with phrases like "She is a New Lead" or "Her last contact was".
- Skip unknown fields silently.
- If activity is thin, 1-2 sentences is fine.
- Dates: "Mar 12, 2024" style.
- Never invent details.`;
}

async function generateSummary(prompt: string): Promise<string> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You write crisp, factual lead profile summaries for real estate agents." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`AI gateway ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function upsertSummary(supa: any, contactId: string, summary: string) {
  // Delete old ai_summary notes for this contact
  await supa.from("crm_notes").delete().eq("contact_id", contactId).eq("note_type", "ai_summary");

  // Get an owner user_id to attach
  const { data: owner } = await supa
    .from("crm_team")
    .select("user_id")
    .eq("role", "owner")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const content = `📋 LEAD SUMMARY\n\n${summary}`;

  await supa.from("crm_notes").insert({
    contact_id: contactId,
    user_id: owner?.user_id || null,
    content,
    note_type: "ai_summary",
    is_pinned: true,
    event_at: new Date().toISOString(),
  });

  await supa
    .from("crm_contacts")
    .update({ ai_summary_updated_at: new Date().toISOString(), ai_summary_stale: false })
    .eq("id", contactId);
}

async function processOne(supa: any, contactId: string) {
  const ctx = await buildContext(supa, contactId);
  const prompt = makePrompt(ctx);
  const summary = await generateSummary(prompt);
  if (!summary) throw new Error("empty summary");
  await upsertSummary(supa, contactId, summary);
  return summary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supa = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));

    if (body.bulk) {
      const limit = Math.min(Number(body.limit) || 50, 200);
      const onlyStale = body.only_stale !== false;
      let query = supa.from("crm_contacts").select("id").limit(limit);
      if (onlyStale) query = query.eq("ai_summary_stale", true);
      const { data: contacts } = await query;
      let ok = 0, fail = 0;
      for (const row of contacts || []) {
        try {
          await processOne(supa, row.id);
          ok++;
          // small pacing to avoid rate limits
          await new Promise((r) => setTimeout(r, 250));
        } catch (e) {
          console.error("fail", row.id, e);
          fail++;
        }
      }
      return new Response(
        JSON.stringify({ processed: ok, failed: fail, total: contacts?.length || 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const contactId = body.contact_id;
    if (!contactId) {
      return new Response(JSON.stringify({ error: "contact_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const summary = await processOne(supa, contactId);
    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e?.message || "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
