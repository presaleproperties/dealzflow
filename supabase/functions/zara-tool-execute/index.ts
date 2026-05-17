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
  if (!ctx.zara_enabled) return fail("Zara is disabled for this contact — drafts blocked.");
  const sb = svc();
  const { data, error } = await sb.from("zara_suggested_replies").insert({
    contact_id: args.contact_id ?? null,
    channel: "email",
    subject: args.subject ?? null,
    body: args.body,
    purpose: args.purpose ?? null,
    status: "pending",
    created_by: "zara",
  }).select("id").single();
  if (error) return fail(error.message);
  return ok({ draft_id: data.id, preview: String(args.body).slice(0, 200) });
}

async function draft_sms(args: any, ctx: Ctx) {
  if (!ctx.zara_enabled) return fail("Zara is disabled — drafts blocked.");
  const sb = svc();
  const { data, error } = await sb.from("zara_suggested_replies").insert({
    contact_id: args.contact_id ?? null,
    channel: "sms",
    body: args.body,
    status: "pending",
    created_by: "zara",
  }).select("id").single();
  if (error) return fail(error.message);
  return ok({ draft_id: data.id, preview: String(args.body).slice(0, 160) });
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

async function schedule_follow_up(args: any, ctx: Ctx) {
  const sb = svc();
  const { data, error } = await sb.from("crm_tasks").insert({
    contact_id: args.contact_id,
    due_at: args.due_at,
    note: args.note ?? "Zara follow-up",
    assigned_to: ctx.user_id,
    created_by: ctx.user_id,
  }).select("id").single();
  if (error) return fail(error.message);
  return ok({ task_id: data.id });
}

async function list_pending_drafts(args: any) {
  const sb = svc();
  const { data, error } = await sb.from("zara_suggested_replies")
    .select("id,contact_id,channel,subject,body,purpose,created_at")
    .eq("status", "pending").order("created_at", { ascending: false })
    .limit(Math.min(args.limit ?? 10, 50));
  if (error) return fail(error.message);
  return ok({ drafts: data, count: data?.length ?? 0 });
}

async function approve_draft(args: any, ctx: Ctx) {
  const sb = svc();
  const { error } = await sb.from("zara_suggested_replies")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: ctx.user_id })
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
      .lte("due_at", new Date().toISOString()).eq("status", "open"),
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
  let q = sb.from("crm_projects").select("name,slug,city,status,key_specs").limit(Math.min(args.limit ?? 25, 100));
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
  const { data: lead } = await sb.from("crm_contacts").select("city,budget_max,bedrooms,tags").eq("id", args.contact_id).maybeSingle();
  if (!lead) return fail("lead not found");
  let q = sb.from("crm_projects").select("name,slug,city,status,key_specs").limit(5);
  if (lead.city) q = q.ilike("city", `%${lead.city}%`);
  const { data } = await q;
  return ok({ recommendations: data ?? [], based_on: { city: lead.city, budget_max: lead.budget_max, bedrooms: lead.bedrooms } });
}

async function web_research(args: any) {
  const sb = svc();
  const cacheKey = args.query.toLowerCase().trim();
  const { data: cached } = await sb.from("zara_research_cache").select("result,cached_at")
    .eq("query", cacheKey).maybeSingle();
  if (cached && Date.now() - new Date(cached.cached_at).getTime() < 24 * 3600 * 1000) {
    return ok({ result: cached.result, cached: true });
  }
  // Minimal stub — real impl would call a search provider. Cache the placeholder.
  const result = { summary: `Web research not yet wired for "${args.query}". Returning empty result.`, sources: [] };
  await sb.from("zara_research_cache").upsert({ query: cacheKey, result, cached_at: new Date().toISOString() });
  return ok({ result, cached: false });
}

async function log_training_feedback(args: any, ctx: Ctx) {
  const sb = svc();
  const { error } = await sb.from("zara_training_feedback").insert({
    user_id: ctx.user_id, message_id: args.message_id, rating: args.rating, note: args.note ?? null,
  });
  if (error) return fail(error.message);
  return ok({ recorded: true });
}

async function show_engagement_score(args: any) {
  const sb = svc();
  const { data: c } = await sb.from("crm_contacts").select("engagement_score,engagement_tier").eq("id", args.contact_id).maybeSingle();
  const { data: events } = await sb.from("crm_activity_events").select("event_type,occurred_at")
    .eq("contact_id", args.contact_id).order("occurred_at", { ascending: false }).limit(5);
  return ok({ score: c?.engagement_score ?? 0, tier: c?.engagement_tier ?? "cold", recent_events: events ?? [] });
}

// ── Dispatch ───────────────────────────────────────────────────────────

const REGISTRY: Record<string, (args: any, ctx: Ctx) => Promise<unknown>> = {
  get_lead_context, search_leads, update_lead, confirm_update_lead,
  draft_email, draft_sms, add_lead_note, add_lead_tag, set_lead_status,
  schedule_follow_up, list_pending_drafts, approve_draft, send_briefing_summary,
  list_projects, project_details, recommend_projects_for_lead, web_research,
  log_training_feedback, show_engagement_score,
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
