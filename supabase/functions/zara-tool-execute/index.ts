// Zara tool executor — single endpoint that dispatches all 19 tools using
// the service role. Called by zara-chat between Anthropic streaming turns.
// All writes are logged into zara_actions_log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const svc = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type Ctx = {
  user_id: string;
  conversation_id?: string;
  zara_enabled: boolean;
  test_phones: string[];
};

async function logAction(
  ctx: Ctx,
  tool: string,
  args: unknown,
  result: unknown,
  contact_id?: string | null,
) {
  try {
    const sb = svc();
    await sb.from("zara_actions_log").insert({
      user_id: ctx.user_id,
      conversation_id: ctx.conversation_id ?? null,
      contact_id: contact_id ?? null,
      action: "tool_call",
      tool_name: tool,
      payload: args as any,
      result_summary: summarize(result),
    });
  } catch (_) { /* non-fatal */ }
}

function summarize(r: unknown): string {
  try {
    const s = typeof r === "string" ? r : JSON.stringify(r);
    return s.length > 240 ? s.slice(0, 240) + "…" : s;
  } catch {
    return "";
  }
}

function ok(data: unknown) { return { ok: true, ...((typeof data === 'object' && data) ? data as Record<string, unknown> : { data }) }; }
function fail(msg: string) { return { ok: false, error: msg }; }

// ── Tool implementations ───────────────────────────────────────────────

async function get_lead_context(args: any, _ctx: Ctx) {
  const sb = svc();
  let row: any = null;
  if (args.contact_id) {
    const { data } = await sb.from("crm_contacts").select("*").eq("id", args.contact_id).maybeSingle();
    row = data;
  } else if (args.name_or_email) {
    const q = String(args.name_or_email);
    const { data } = await sb.from("crm_contacts").select("*")
      .or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(1).maybeSingle();
    row = data;
  }
  if (!row) return fail("Lead not found");
  const { data: acts } = await sb.from("crm_activity_events")
    .select("event_type,description,occurred_at").eq("contact_id", row.id)
    .order("occurred_at", { ascending: false }).limit(10);
  let projects: any[] = [];
  const hasProjectInterest = row.project || row.projects?.length || (row.tags ?? []).some((t: string) => t?.startsWith?.("project:"));
  if (hasProjectInterest) {
    let q2 = sb.from("crm_projects").select("name,slug,city,status").limit(5);
    if (row.city_pref || row.city) q2 = q2.ilike("city", `%${row.city_pref ?? row.city}%`);
    const { data } = await q2;
    projects = data ?? [];
  }
  return ok({ contact: row, recent_activity: acts ?? [], relevant_projects: projects });
}

async function search_leads(args: any) {
  const sb = svc();
  let q = sb.from("crm_contacts").select("id,first_name,last_name,email,phone,status,tags,city,last_touch_at").limit(Math.min(args.limit ?? 25, 50));
  if (args.query) {
    const s = String(args.query);
    q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
  }
  if (args.status) q = q.eq("status", args.status);
  if (args.tag) q = q.contains("tags", [args.tag]);
  const { data, error } = await q;
  if (error) return fail(error.message);
  return ok({ results: data, count: data?.length ?? 0 });
}

// Pending updates live in memory per process (short-lived). Conversation_id keys them.
const pendingUpdates = new Map<string, { contact_id: string; patch: Record<string, unknown> }>();

async function update_lead(args: any, _ctx: Ctx) {
  if (!args.contact_id || !args.patch) return fail("contact_id and patch required");
  const id = crypto.randomUUID();
  pendingUpdates.set(id, { contact_id: args.contact_id, patch: args.patch });
  // expire in 10 min
  setTimeout(() => pendingUpdates.delete(id), 600_000);
  return ok({
    pending_id: id,
    contact_id: args.contact_id,
    patch: args.patch,
    requires_confirmation: true,
    message: "Awaiting user confirmation. Show the patch and ask to confirm; then call confirm_update_lead with the pending_id.",
  });
}

async function confirm_update_lead(args: any, ctx: Ctx) {
  const p = pendingUpdates.get(args.pending_id);
  if (!p) return fail("pending update expired or unknown");
  const sb = svc();
  const { error } = await sb.from("crm_contacts").update(p.patch).eq("id", p.contact_id);
  if (error) return fail(error.message);
  pendingUpdates.delete(args.pending_id);
  await logAction(ctx, "update_lead", p.patch, "applied", p.contact_id);
  return ok({ contact_id: p.contact_id, applied: p.patch });
}

async function draft_email(args: any, ctx: Ctx) {
  if (!args.contact_id) return fail("contact_id required");
  const sb = svc();
  // Per-contact zara_enabled gate
  const { data: c } = await sb.from("crm_contacts").select("zara_enabled,status,language,first_name,last_name").eq("id", args.contact_id).maybeSingle();
  if (c && (c as any).zara_enabled === false) return fail("Zara is disabled for this contact — drafts blocked.");
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    contact_id: args.contact_id,
    channel: "email",
    draft_subject: args.subject ?? null,
    draft_text: args.body,
    inbound_text: args.purpose ?? "(agent-initiated via Zara cockpit)",
    inbound_at: now,
    intent: args.purpose ?? null,
    status: "pending",
  };
  if ((ctx as any).consulted_sources) payload.consulted_sources = (ctx as any).consulted_sources;
  const { data, error } = await sb.from("zara_suggested_replies").insert(payload).select("id").single();
  if (error) return fail(error.message);

  // Tier 6 — auto-suggest a relevant template (best-effort, never blocks).
  let suggestion: { id: string; name: string; subject?: string } | null = null;
  try {
    const { data: tpls } = await sb.from("crm_email_templates")
      .select("id, name, subject, category, is_active")
      .eq("is_active", true).limit(50);
    const pool = (tpls ?? []) as any[];
    const status = String((c as any)?.status ?? "").toLowerCase();
    const lang = String((c as any)?.language ?? "en").toLowerCase();
    const ranked = pool.map((t) => {
      let score = 0;
      const hay = `${t.name ?? ""} ${t.category ?? ""}`.toLowerCase();
      if (status && hay.includes(status)) score += 2;
      if (lang && lang !== "en" && hay.includes(lang)) score += 3;
      if (args.purpose && hay.includes(String(args.purpose).toLowerCase().slice(0, 12))) score += 2;
      return { t, score };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
    if (ranked[0]) suggestion = { id: ranked[0].t.id, name: ranked[0].t.name, subject: ranked[0].t.subject };
  } catch (_) { /* ignore */ }

  return ok({
    draft_id: data.id,
    preview: String(args.body).slice(0, 200),
    template_suggestion: suggestion,
    note: suggestion ? `Consider using template: ${suggestion.name}` : undefined,
  });
}

async function draft_sms(args: any, ctx: Ctx) {
  return draftMessage(args, ctx, "sms");
}

async function draft_whatsapp(args: any, ctx: Ctx) {
  return draftMessage(args, ctx, "whatsapp");
}

async function draftMessage(args: any, ctx: Ctx, channel: "sms" | "whatsapp") {
  if (!args.contact_id) return fail("contact_id required");
  const sb = svc();
  const { data: c } = await sb.from("crm_contacts").select("zara_enabled").eq("id", args.contact_id).maybeSingle();
  if (c && c.zara_enabled === false) return fail("Zara is disabled for this contact — drafts blocked.");
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    contact_id: args.contact_id,
    channel,
    draft_text: args.body,
    inbound_text: "(agent-initiated via Zara cockpit)",
    inbound_at: now,
    status: "pending",
  };
  if ((ctx as any).consulted_sources) payload.consulted_sources = (ctx as any).consulted_sources;
  const { data, error } = await sb.from("zara_suggested_replies").insert(payload).select("id").single();
  if (error) return fail(error.message);
  return ok({ draft_id: data.id, preview: String(args.body).slice(0, 160), channel });
}

async function create_template(args: any, ctx: Ctx) {
  if (!args?.title || !args?.channel || !args?.body) return fail("title, channel, body required");
  const sb = svc();
  const slug = String(args.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `tpl-${Date.now()}`;
  const tags: string[] = Array.isArray(args.tags) ? args.tags : [];
  let row: any = null;
  if (args.channel === "email") {
    const { data, error } = await sb.from("crm_email_templates").insert({
      name: args.title,
      subject: args.subject ?? args.title,
      body_html: args.body,
      slug,
      category: "general",
      source: "zara",
      merge_tags: tags,
    }).select("id, slug").single();
    if (error) return fail(error.message);
    row = data;
  } else if (args.channel === "sms") {
    const { data, error } = await sb.from("crm_sms_templates").insert({
      name: args.title, body: args.body, channel: "sms", category: "general", merge_tags: tags,
    }).select("id").single();
    if (error) return fail(error.message);
    row = { ...data, slug };
  } else if (args.channel === "whatsapp") {
    const { data, error } = await sb.from("crm_whatsapp_templates").insert({
      name: args.title, body_text: args.body, category: "utility", status: "approved", language: "en",
    }).select("id").single();
    if (error) return fail(error.message);
    row = { ...data, slug };
  } else {
    return fail("channel must be email | sms | whatsapp");
  }
  await logAction(ctx, "create_template", args, "created");
  return ok({ template_id: row.id, slug: row.slug, channel: args.channel });
}

async function update_template(args: any, ctx: Ctx) {
  if (!args?.template_id || !args?.fields_to_update) return fail("template_id and fields_to_update required");
  const sb = svc();
  const f = args.fields_to_update as Record<string, unknown>;
  const channel = args.channel ?? "email";
  const tableName = channel === "sms" ? "crm_sms_templates" : channel === "whatsapp" ? "crm_whatsapp_templates" : "crm_email_templates";
  const patch: Record<string, unknown> = {};
  if (typeof f.title === "string") patch[channel === "whatsapp" || channel === "sms" ? "name" : "name"] = f.title;
  if (typeof f.subject === "string" && channel === "email") patch.subject = f.subject;
  if (typeof f.body === "string") {
    if (channel === "email") patch.body_html = f.body;
    else if (channel === "sms") patch.body = f.body;
    else patch.body_text = f.body;
  }
  if (Array.isArray(f.tags) && channel !== "whatsapp") patch.merge_tags = f.tags;
  const { error } = await sb.from(tableName as any).update(patch).eq("id", args.template_id);
  if (error) return fail(error.message);
  await logAction(ctx, "update_template", args, "updated");
  return ok({ template_id: args.template_id, updated_fields: Object.keys(patch) });
}

async function add_lead_note(args: any, ctx: Ctx) {
  const sb = svc();
  const { data: cur } = await sb.from("crm_contacts").select("notes").eq("id", args.contact_id).maybeSingle();
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const next = `${cur?.notes ?? ""}\n[${stamp} · zara] ${args.note}`.trim();
  const { error } = await sb.from("crm_contacts").update({ notes: next }).eq("id", args.contact_id);
  if (error) return fail(error.message);
  await logAction(ctx, "add_lead_note", { note: args.note }, "ok", args.contact_id);
  return ok({ contact_id: args.contact_id });
}

async function add_lead_tag(args: any, ctx: Ctx) {
  const sb = svc();
  const { data: cur } = await sb.from("crm_contacts").select("tags").eq("id", args.contact_id).maybeSingle();
  const tags = Array.from(new Set([...(cur?.tags ?? []), args.tag]));
  const { error } = await sb.from("crm_contacts").update({ tags }).eq("id", args.contact_id);
  if (error) return fail(error.message);
  await logAction(ctx, "add_lead_tag", { tag: args.tag }, "ok", args.contact_id);
  return ok({ tags });
}

async function set_lead_status(args: any, ctx: Ctx) {
  const sb = svc();
  const { error } = await sb.from("crm_contacts").update({ status: args.status }).eq("id", args.contact_id);
  if (error) return fail(error.message);
  await logAction(ctx, "set_lead_status", { status: args.status }, "ok", args.contact_id);
  return ok({ contact_id: args.contact_id, status: args.status });
}

async function schedule_follow_up(args: any, _ctx: Ctx) {
  const sb = svc();
  const { data, error } = await sb.from("crm_tasks").insert({
    contact_id: args.contact_id,
    due_date: args.due_at,
    title: (args.note ?? "Zara follow-up").slice(0, 120),
    description: args.note ?? null,
    task_type: "follow_up",
    status: "pending",
  }).select("id").single();
  if (error) return fail(error.message);
  return ok({ task_id: data.id });
}

async function list_pending_drafts(args: any) {
  const sb = svc();
  const { data, error } = await sb.from("zara_suggested_replies")
    .select("id,contact_id,channel,draft_subject,draft_text,intent,created_at")
    .eq("status", "pending").order("created_at", { ascending: false })
    .limit(Math.min(args.limit ?? 10, 50));
  if (error) return fail(error.message);
  return ok({ drafts: data, count: data?.length ?? 0 });
}

async function approve_draft(args: any, ctx: Ctx) {
  const sb = svc();
  const { error } = await sb.from("zara_suggested_replies")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: ctx.user_id, approval_method: "zara_cockpit" })
    .eq("id", args.draft_id);
  if (error) return fail(error.message);
  return ok({ draft_id: args.draft_id, status: "approved" });
}

async function send_briefing_summary(_args: any, ctx: Ctx) {
  const sb = svc();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [hot, drafts, due, recent] = await Promise.all([
    sb.from("crm_contacts").select("id", { count: "exact", head: true }).contains("tags", ["hot"]),
    sb.from("zara_suggested_replies").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("crm_tasks").select("id", { count: "exact", head: true })
      .lte("due_date", new Date().toISOString()).eq("status", "pending"),
    sb.from("crm_activity_events").select("id", { count: "exact", head: true }).gte("occurred_at", since),
  ]);
  return ok({
    hot_leads: hot.count ?? 0,
    pending_drafts: drafts.count ?? 0,
    follow_ups_due: due.count ?? 0,
    activity_24h: recent.count ?? 0,
    user_id: ctx.user_id,
  });
}

async function list_projects(args: any) {
  const sb = svc();
  let q = sb.from("crm_projects").select("name,slug,city,status").limit(Math.min(args.limit ?? 25, 100));
  if (args.city) q = q.ilike("city", `%${args.city}%`);
  const { data, error } = await q;
  if (error) return fail(error.message);
  return ok({ projects: data });
}

async function project_details(args: any) {
  const sb = svc();
  let q = sb.from("crm_projects").select("*");
  if (args.slug) q = q.eq("slug", args.slug);
  else if (args.id) q = q.eq("id", args.id);
  else return fail("slug or id required");
  const { data, error } = await q.maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("project not found");
  return ok({ project: data });
}

async function recommend_projects_for_lead(args: any) {
  const sb = svc();
  const { data: lead } = await sb.from("crm_contacts").select("city,city_pref,budget_max,bedrooms_preferred,tags").eq("id", args.contact_id).maybeSingle();
  if (!lead) return fail("lead not found");
  let q = sb.from("crm_projects").select("name,slug,city,status").limit(5);
  const cityHint = lead.city_pref ?? lead.city;
  if (cityHint) q = q.ilike("city", `%${cityHint}%`);
  const { data } = await q;
  return ok({ recommendations: data ?? [], based_on: { city: cityHint, budget_max: lead.budget_max, bedrooms: lead.bedrooms_preferred } });
}

async function web_research(args: any) {
  const sb = svc();
  const cacheKey = String(args.query ?? "").toLowerCase().trim();
  if (!cacheKey) return fail("query required");
  const { data: cached } = await sb.from("zara_research_cache").select("result,cached_at")
    .eq("query", cacheKey).maybeSingle();
  if (cached && Date.now() - new Date(cached.cached_at).getTime() < 24 * 3600 * 1000) {
    return ok({ result: cached.result, cached: true });
  }
  const result = { summary: `Web research not yet wired for "${args.query}". Returning empty placeholder.`, sources: [] };
  await sb.from("zara_research_cache").upsert({ query: cacheKey, result, cached_at: new Date().toISOString() });
  return ok({ result, cached: false });
}

async function log_training_feedback(args: any, ctx: Ctx) {
  const sb = svc();
  const decision = args.rating === "up" ? "good" : args.rating === "down" ? "bad" : args.rating;
  const { error } = await sb.from("zara_training_feedback").insert({
    created_by: ctx.user_id, message_id: args.message_id, decision, notes: args.note ?? null,
  });
  if (error) return fail(error.message);
  return ok({ recorded: true });
}

async function show_engagement_score(args: any) {
  const sb = svc();
  const { data: c } = await sb.from("crm_contacts").select("engagement_score,lead_tier").eq("id", args.contact_id).maybeSingle();
  const { data: events } = await sb.from("crm_activity_events").select("event_type,occurred_at")
    .eq("contact_id", args.contact_id).order("occurred_at", { ascending: false }).limit(5);
  const score = c?.engagement_score ?? 0;
  const tier = c?.lead_tier ?? (score >= 70 ? "hot" : score >= 40 ? "warm" : "cold");
  return ok({ score, tier, recent_events: events ?? [] });
}

// ── RAG tools (Zara Brain) ─────────────────────────────────────────────

async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const r = await fetch(`${FUNCTIONS_BASE}/zara-embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ texts: [text] }),
    });
    const j = await r.json();
    if (!r.ok) return null;
    return (j.embeddings?.[0] as number[]) ?? null;
  } catch { return null; }
}

async function search_knowledge(args: any) {
  if (!args?.query) return fail("query required");
  const emb = await embedQuery(String(args.query));
  if (!emb) return fail("embedding unavailable (check OPENAI_API_KEY)");
  const sb = svc();
  const top_k = Math.min(Math.max(Number(args.top_k ?? 5), 1), 10);
  const { data, error } = await sb.rpc("zara_match_knowledge_chunks", {
    query_embedding: emb as any, match_threshold: 0.4, match_count: top_k * 2,
  });
  if (error) return fail(error.message);
  let rows = data ?? [];
  if (args.type) {
    rows = rows.filter((r: any) => r?.metadata?.source_type === args.type);
  }
  rows = rows.slice(0, top_k);
  // Bump retrieval counters
  const docIds = Array.from(new Set(rows.map((r: any) => r.document_id))).filter(Boolean);
  if (docIds.length) await sb.rpc("zara_bump_retrieval_counts", { doc_ids: docIds as any });
  return ok({ results: rows, count: rows.length });
}

async function get_winning_pattern(args: any) {
  if (!args?.scenario) return fail("scenario required");
  const emb = await embedQuery(String(args.scenario));
  if (!emb) return fail("embedding unavailable (check OPENAI_API_KEY)");
  const sb = svc();
  const { data, error } = await sb.rpc("zara_match_winning_conversations", {
    query_embedding: emb as any, match_threshold: 0.45, match_count: 3,
  });
  if (error) return fail(error.message);
  return ok({ patterns: data ?? [], count: (data ?? []).length });
}

async function get_project_deep_dive(args: any) {
  const sb = svc();
  let q = sb.from("presale_projects")
    .select("id, slug, name, city, uzair_pitch, common_objections, honest_caveats, who_this_fits, who_this_doesnt_fit, mortgage_broker_note, deep_dive_updated_at");
  if (args?.project_slug) q = q.eq("slug", args.project_slug);
  else if (args?.project_id) q = q.eq("id", args.project_id);
  else return fail("project_slug or project_id required");
  const { data, error } = await q.maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("project not found");
  return ok({ project: data });
}

async function get_market_context(args: any) {
  const sb = svc();
  const weeksBack = Math.min(Math.max(Number(args?.weeks_back ?? 4), 1), 52);
  const since = new Date(Date.now() - weeksBack * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  let q = sb.from("market_intel").select("week_starting, area, building_type, metric, value, source, notes")
    .gte("week_starting", since).order("week_starting", { ascending: false }).limit(40);
  if (args?.area) q = q.ilike("area", `%${args.area}%`);
  if (args?.building_type) q = q.ilike("building_type", `%${args.building_type}%`);
  const { data, error } = await q;
  if (error) return fail(error.message);
  return ok({ rows: data ?? [], count: (data ?? []).length, weeks_back: weeksBack });
}

// ── Dispatch ───────────────────────────────────────────────────────────

const REGISTRY: Record<string, (args: any, ctx: Ctx) => Promise<unknown>> = {
  get_lead_context, search_leads, update_lead, confirm_update_lead,
  draft_email, draft_sms, draft_whatsapp, add_lead_note, add_lead_tag, set_lead_status,
  schedule_follow_up, list_pending_drafts, approve_draft, send_briefing_summary,
  list_projects, project_details, recommend_projects_for_lead, web_research,
  log_training_feedback, show_engagement_score,
  create_template, update_template,
  // RAG
  search_knowledge, get_winning_pattern, get_project_deep_dive, get_market_context,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { tool, args, ctx } = body as { tool: string; args: any; ctx: Ctx };
    const fn = REGISTRY[tool];
    if (!fn) return new Response(JSON.stringify({ ok: false, error: `Unknown tool: ${tool}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const result = await fn(args ?? {}, ctx);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
