// Zara tool executor — single endpoint that dispatches all 19 tools using
// the service role. Called by zara-chat between Anthropic streaming turns.
// All writes are logged into zara_actions_log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { presaleBridge } from "../_shared/presale-bridge.ts";

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
  const { data: c } = await sb.from("crm_contacts").select("zara_enabled,status,language,first_name,last_name").eq("id", args.contact_id).maybeSingle();
  if (c && (c as any).zara_enabled === false) return fail("Zara is disabled for this contact — drafts blocked.");

  // Render the draft as fully-branded HTML using a matched template scaffold
  // + the actor agent's signature. SMS/WhatsApp drafts stay plain text.
  const { renderBrandedEmail } = await import("../_shared/zara-email-render.ts");
  const rendered = await renderBrandedEmail(sb as any, {
    userId: ctx.user_id,
    contactId: args.contact_id,
    intent: args.purpose ?? null,
    bodyText: String(args.body ?? ""),
    subject: args.subject ?? null,
    cta_text: args.cta_text ?? null,
    cta_url: args.cta_url ?? null,
  });

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    contact_id: args.contact_id,
    channel: "email",
    draft_subject: rendered.subject ?? args.subject ?? null,
    draft_text: rendered.text,
    draft_html: rendered.html,
    template_id_used: rendered.template_id_used && /^[0-9a-f-]{36}$/i.test(rendered.template_id_used) ? rendered.template_id_used : null,
    inbound_text: args.purpose ?? "(agent-initiated via Zara cockpit)",
    inbound_at: now,
    intent: args.purpose ?? null,
    status: "pending",
  };
  if ((ctx as any).consulted_sources) payload.consulted_sources = (ctx as any).consulted_sources;
  const { data, error } = await sb.from("zara_suggested_replies").insert(payload).select("id").single();
  if (error) return fail(error.message);

  return ok({
    draft_id: data.id,
    preview: rendered.text.slice(0, 200),
    template_id_used: rendered.template_id_used && /^[0-9a-f-]{36}$/i.test(rendered.template_id_used) ? rendered.template_id_used : null,
    has_html: true,
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
  const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 500);
  const offset = Math.max(Number(args.offset ?? 0), 0);
  const qStr = typeof args.q === "string" ? args.q.trim() : "";
  let q = sb
    .from("crm_projects")
    .select("name,slug,city,status,property_type,price_from,price_to,completion_date,incentives,assignment_rules,last_viewed_at", { count: "exact" })
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);
  if (args.city) q = q.ilike("city", `%${args.city}%`);
  if (args.status) q = q.eq("status", args.status);
  if (qStr) {
    const esc = qStr.replace(/[%,()]/g, " ");
    q = q.or(`name.ilike.%${esc}%,slug.ilike.%${esc}%`);
  }
  const { data, error, count } = await q;
  if (error) return fail(error.message);

  // Bridge fallback — Presale Properties is source of truth. If the caller
  // searched by name and we have <3 local hits, fan out to the bridge so
  // newly-launched projects (not yet synced) still surface.
  let bridge_hits: any[] = [];
  if (qStr && (data?.length ?? 0) < 3) {
    try {
      
      const raw = await presaleBridge.searchProjects(qStr);
      const arr: any[] = Array.isArray(raw) ? raw : (raw as any)?.projects ?? [];
      const localSlugs = new Set((data ?? []).map((p: any) => p.slug));
      bridge_hits = arr
        .filter((p) => p?.slug && !localSlugs.has(p.slug))
        .slice(0, 10)
        .map((p) => ({
          name: p.name ?? p.title ?? p.slug,
          slug: p.slug,
          city: p.city ?? p.location ?? null,
          status: p.status ?? "bridge",
          source: "presale-bridge",
        }));
    } catch (e) {
      console.warn("[list_projects] bridge fallback failed", (e as Error).message);
    }
  }

  return ok({
    projects: [...(data ?? []), ...bridge_hits],
    total: count ?? null,
    offset,
    limit,
    has_more: count != null ? offset + (data?.length ?? 0) < count : false,
    bridge_fallback_used: bridge_hits.length > 0,
  });
}

async function project_details(args: any) {
  const sb = svc();
  let q = sb.from("crm_projects").select("*");
  if (args.slug) q = q.eq("slug", args.slug);
  else if (args.id) q = q.eq("id", args.id);
  else return fail("slug or id required");
  const { data, error } = await q.maybeSingle();
  if (error) return fail(error.message);
  if (data) return ok({ project: data });
  // Bridge fallback by slug — Presale is source of truth.
  if (args.slug) {
    try {
      
      const bp = await presaleBridge.getProject(args.slug);
      if (bp && (bp as any).slug) return ok({ project: bp, source: "presale-bridge" });
    } catch (e) {
      console.warn("[project_details] bridge fallback failed", (e as Error).message);
    }
  }
  return fail("project not found");
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

// ── Phase 4 tools ──────────────────────────────────────────────────────

async function resolveAgentCalendly(sb: ReturnType<typeof svc>, contactId: string): Promise<{ url: string | null; agent_name: string | null; agent_id: string | null }> {
  const { data: contact } = await sb.from("crm_contacts").select("assigned_to").eq("id", contactId).maybeSingle();
  const assigned = (contact as any)?.assigned_to ?? null;
  if (!assigned) return { url: null, agent_name: null, agent_id: null };
  // assigned_to may be a uuid OR a display_name — try both
  let teamRow: any = null;
  if (/^[0-9a-f-]{36}$/i.test(assigned)) {
    const { data } = await sb.from("crm_team").select("id,display_name,presale_snapshot").eq("user_id", assigned).maybeSingle();
    teamRow = data;
  }
  if (!teamRow) {
    const { data } = await sb.from("crm_team").select("id,display_name,presale_snapshot").ilike("display_name", assigned).maybeSingle();
    teamRow = data;
  }
  const snap = (teamRow?.presale_snapshot ?? {}) as Record<string, any>;
  const url = snap.calendly_url || snap.calendlyUrl || snap.booking_url || snap.calendar_url || null;
  return { url, agent_name: teamRow?.display_name ?? null, agent_id: teamRow?.id ?? null };
}

async function book_calendly(args: any, ctx: Ctx) {
  if (!args?.contact_id) return fail("contact_id required");
  const sb = svc();
  const { url, agent_name } = await resolveAgentCalendly(sb, args.contact_id);
  if (!url) return fail("No Calendly/booking URL found for the assigned agent. Have them add one in Settings → Identity.");
  let draft_id: string | null = null;
  if (args.draft_channel) {
    const blurb = args.message?.trim() || `Easiest way to lock a time — pick a slot that works for you:`;
    const body = `${blurb}\n\n${url}`;
    if (args.draft_channel === "email") {
      const r = await draft_email({ contact_id: args.contact_id, subject: "Quick chat?", body, cta_text: "Book a time", cta_url: url, purpose: "booking" }, ctx) as any;
      draft_id = r?.draft_id ?? null;
    } else {
      const r = await draftMessage({ contact_id: args.contact_id, body }, ctx, args.draft_channel) as any;
      draft_id = r?.draft_id ?? null;
    }
  }
  await logAction(ctx, "book_calendly", { channel: args.draft_channel }, "ok", args.contact_id);
  return ok({ booking_url: url, agent_name, draft_id });
}

async function resolveProject(sb: ReturnType<typeof svc>, args: any): Promise<{ presale: any; crm: any } | null> {
  let presale: any = null, crm: any = null;
  if (args.project_slug) {
    presale = (await sb.from("presale_projects").select("*").eq("slug", args.project_slug).maybeSingle()).data;
    crm = (await sb.from("crm_projects").select("*").or(`slug.eq.${args.project_slug},presale_slug.eq.${args.project_slug}`).maybeSingle()).data;
  } else if (args.project_id) {
    presale = (await sb.from("presale_projects").select("*").eq("id", args.project_id).maybeSingle()).data;
    crm = (await sb.from("crm_projects").select("*").eq("id", args.project_id).maybeSingle()).data;
  } else if (args.project_name) {
    presale = (await sb.from("presale_projects").select("*").ilike("name", `%${args.project_name}%`).limit(1).maybeSingle()).data;
    crm = (await sb.from("crm_projects").select("*").ilike("name", `%${args.project_name}%`).limit(1).maybeSingle()).data;
  } else return null;
  return { presale, crm };
}

async function get_pricing(args: any, _ctx: Ctx) {
  const sb = svc();
  const r = await resolveProject(sb, args);
  if (!r || (!r.presale && !r.crm)) return fail("project not found (pass project_slug, project_id, or project_name)");
  const p = r.presale; const c = r.crm;
  return ok({
    project_name: p?.name ?? c?.name,
    slug: p?.slug ?? c?.slug,
    price_range_low: p?.price_range_low ?? c?.price_from ?? null,
    price_range_high: p?.price_range_high ?? c?.price_to ?? null,
    starting_psf: p?.starting_psf ?? null,
    deposit_structure: p?.deposit_structure ?? null,
    incentives: (p?.incentives ?? c?.incentives ?? []) as any[],
    assignment_rules: p?.assignment_rules ?? c?.assignment_rules ?? null,
    pricing_url: c?.pricing_url ?? null,
    pricing_filename: c?.pricing_filename ?? null,
    status: p?.status ?? c?.status ?? null,
    caveats: p?.honest_caveats ?? null,
    last_synced_at: p?.last_synced_at ?? null,
  });
}

async function attach_floorplan(args: any, ctx: Ctx) {
  const sb = svc();
  const r = await resolveProject(sb, args);
  if (!r || (!r.presale && !r.crm)) return fail("project not found");
  const c = r.crm; const p = r.presale;
  const floor_url = c?.floor_plans_url ?? null;
  const floor_filename = c?.floor_plans_filename ?? null;
  const brochure_url = c?.brochure_url ?? p?.brochure_url ?? null;
  if (!floor_url && !brochure_url) return fail("No floor plan or brochure on file for this project");
  let draft_id: string | null = null;
  if (args.draft && args.contact_id) {
    const name = p?.name ?? c?.name ?? "the project";
    const body = `Floor plans for ${name} are attached below:\n\n${floor_url ?? brochure_url}`;
    const d = await draft_email({ contact_id: args.contact_id, subject: `${name} — floor plans`, body, cta_text: "View floor plans", cta_url: floor_url ?? brochure_url, purpose: "project_info" }, ctx) as any;
    draft_id = d?.draft_id ?? null;
  }
  await logAction(ctx, "attach_floorplan", { project: p?.slug ?? c?.slug, draft: !!args.draft }, "ok", args.contact_id ?? null);
  return ok({ project_name: p?.name ?? c?.name, floor_plans_url: floor_url, floor_plans_filename: floor_filename, brochure_url, draft_id });
}

async function send_brochure(args: any, ctx: Ctx) {
  const sb = svc();
  const r = await resolveProject(sb, args);
  if (!r || (!r.presale && !r.crm)) return fail("project not found (pass project_slug, project_id, or project_name)");
  const c = r.crm; const p = r.presale;
  const brochure_url =
    c?.brochure_url ??
    p?.brochure_url ??
    p?.pitch_deck_url ??
    p?.first_brochure_url ??
    null;
  const brochure_filename = c?.brochure_filename ?? null;
  if (!brochure_url) return fail("No brochure on file for this project yet");
  await logAction(ctx, "send_brochure", { project: p?.slug ?? c?.slug }, "ok", args.contact_id ?? null);
  return ok({
    project_name: p?.name ?? c?.name,
    slug: p?.slug ?? c?.slug,
    brochure_url,
    brochure_filename,
    source: c?.brochure_url ? "manual" : "presale",
  });
}

async function schedule_follow_up_smart(args: any, ctx: Ctx) {
  if (!args?.contact_id) return fail("contact_id required");
  const sb = svc();
  let cadence: string = args.cadence ?? "auto";
  let dueAt = args.due_at as string | undefined;
  if (!dueAt) {
    if (cadence === "auto") {
      const { data: c } = await sb.from("crm_contacts").select("engagement_score,lead_tier").eq("id", args.contact_id).maybeSingle();
      const tier = (c as any)?.lead_tier ?? (((c as any)?.engagement_score ?? 0) >= 70 ? "hot" : ((c as any)?.engagement_score ?? 0) >= 40 ? "warm" : "cold");
      cadence = tier;
    }
    const days = cadence === "hot" ? 1 : cadence === "warm" ? 3 : 7;
    dueAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
  }
  const { data, error } = await sb.from("crm_tasks").insert({
    contact_id: args.contact_id,
    due_date: dueAt,
    title: (args.note ?? `Zara smart follow-up (${cadence})`).slice(0, 120),
    description: args.note ?? null,
    task_type: "follow_up",
    status: "pending",
  }).select("id").single();
  if (error) return fail(error.message);
  await logAction(ctx, "schedule_follow_up_smart", { cadence, due_at: dueAt }, "ok", args.contact_id);
  return ok({ task_id: data.id, due_at: dueAt, cadence });
}

async function enrich_lead(args: any, _ctx: Ctx) {
  if (!args?.contact_id) return fail("contact_id required");
  const sb = svc();
  const [contactRes, idsRes, actsRes, memRes, callsRes] = await Promise.all([
    sb.from("crm_contacts").select("*").eq("id", args.contact_id).maybeSingle(),
    sb.from("crm_contact_identities").select("kind,value,is_primary,created_at").eq("contact_id", args.contact_id),
    sb.from("crm_activity_events").select("event_type,description,occurred_at").eq("contact_id", args.contact_id).order("occurred_at", { ascending: false }).limit(15),
    sb.from("zara_lead_memory").select("facts,updated_at").eq("contact_id", args.contact_id).maybeSingle(),
    sb.from("crm_call_log")
      .select("direction,status,started_at,duration_sec,notes,recording_url")
      .eq("contact_id", args.contact_id)
      .order("started_at", { ascending: false })
      .limit(5),
  ]);
  if (!contactRes.data) return fail("lead not found");
  const c: any = contactRes.data;
  const score = c.engagement_score ?? 0;
  const tier = c.lead_tier ?? (score >= 70 ? "hot" : score >= 40 ? "warm" : "cold");
  return ok({
    contact: {
      id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "(unknown)",
      email: c.email, phone: c.phone, status: c.status, language: c.language, tags: c.tags,
      city: c.city, city_pref: c.city_pref, budget_max: c.budget_max, bedrooms_preferred: c.bedrooms_preferred,
      assigned_to: c.assigned_to, last_touch_at: c.last_touch_at, created_at: c.created_at,
    },
    identities: idsRes.data ?? [],
    engagement: { score, tier },
    recent_activity: actsRes.data ?? [],
    recent_calls: (callsRes.data ?? []).map((r: any) => ({
      direction: r.direction, status: r.status, started_at: r.started_at,
      duration_sec: r.duration_sec, has_recording: !!r.recording_url,
      notes: r.notes ? String(r.notes).slice(0, 240) : null,
    })),
    memory_facts: (memRes.data as any)?.facts ?? null,
    memory_updated_at: (memRes.data as any)?.updated_at ?? null,
  });
}

// ── Public-site tools ─────────────────────────────────────────────────

async function capture_lead(args: any, ctx: any) {
  const email = args?.email ? String(args.email).trim().toLowerCase() : null;
  const phone = args?.phone ? String(args.phone).trim() : null;
  if (!email && !phone) return fail("email or phone required");

  const payload: any = {
    lead: {
      email: email ?? `${args?.presale_user_id ?? "anon"}@no-email.presaleproperties.com`,
      first_name: args?.first_name ?? null,
      last_name: args?.last_name ?? null,
      phone,
      presale_user_id: args?.presale_user_id ?? null,
      source: "PresaleProperties.com",
      project: args?.project_slug ?? null,
      projects: args?.project_slug ? [args.project_slug] : [],
      intent: args?.intent ?? null,
      timeframe: args?.timeframe ?? null,
      budget_max: args?.budget_max ?? null,
      bedrooms_preferred: args?.bedrooms_preferred ?? null,
      language: args?.language ?? null,
      tags: ["presale-website", "zara-public-chat", ...(args?.intent ? [`intent:${args.intent}`] : [])],
      marketing_consent: true,
      signup_completed_at: new Date().toISOString(),
    },
    forms: [{
      form_type: "zara_public_chat",
      form_name: "Zara website chat capture",
      property_id: args?.project_slug ?? null,
      payload: { message: args?.message ?? null, conversation_id: ctx?.conversation_id ?? null },
      submitted_at: new Date().toISOString(),
    }],
  };

  const res = await fetch(`${FUNCTIONS_BASE}/bridge-ingest-lead`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify(payload),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return fail(`capture failed: ${out?.error ?? res.status}`);
  const contact_id: string | null = out?.contact_id ?? out?.id ?? null;

  // Auto-create a CRM follow-up task so the assigned agent has a next step
  let follow_up_task_id: string | null = null;
  let follow_up_due_at: string | null = null;
  if (contact_id) {
    try {
      const sb = svc();
      const intent = String(args?.intent ?? "").toLowerCase();
      const timeframe = String(args?.timeframe ?? "").toLowerCase();
      // Hot → 2h, ready/0-3mo → 24h, default → 48h
      const isHot = intent.includes("buy") || intent.includes("hot") || /0-?3|asap|now|immediate/.test(timeframe);
      const isWarm = /3-?6|soon|this year/.test(timeframe);
      const hours = isHot ? 2 : isWarm ? 24 : 48;
      const dueAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      const titleBits = [
        "Zara website lead",
        args?.project_slug ? `· ${args.project_slug}` : "",
        intent ? `· ${intent}` : "",
      ].filter(Boolean).join(" ");
      const desc = [
        args?.message ? `Visitor said: ${args.message}` : null,
        args?.project_slug ? `Project: ${args.project_slug}` : null,
        intent ? `Intent: ${intent}` : null,
        timeframe ? `Timeframe: ${timeframe}` : null,
        args?.budget_max ? `Budget max: ${args.budget_max}` : null,
        args?.bedrooms_preferred ? `Beds: ${args.bedrooms_preferred}` : null,
      ].filter(Boolean).join("\n");

      const { data: task, error: tErr } = await sb.from("crm_tasks").insert({
        contact_id,
        due_date: dueAt,
        title: titleBits.slice(0, 120),
        description: desc || "Follow up on website chat capture",
        task_type: "follow_up",
        status: "pending",
      }).select("id").single();
      if (!tErr && task) {
        follow_up_task_id = (task as any).id;
        follow_up_due_at = dueAt;
      } else if (tErr) {
        console.warn("capture_lead follow-up insert failed:", tErr.message);
      }

      // Timeline entry + assigned-agent notification
      const { data: contactRow } = await sb.from("crm_contacts").select("assigned_to").eq("id", contact_id).maybeSingle();
      const assigned_to: string | null = (contactRow as any)?.assigned_to ?? null;

      await sb.from("crm_activity_events").insert({
        contact_id,
        event_type: "zara_capture",
        description: `Zara captured lead via website chat${args?.project_slug ? ` (${args.project_slug})` : ""}. Follow-up due ${follow_up_due_at ?? "soon"}.`,
        occurred_at: new Date().toISOString(),
        metadata: {
          source: "zara-public-chat",
          conversation_id: ctx?.conversation_id ?? null,
          intent, timeframe,
          project_slug: args?.project_slug ?? null,
          follow_up_task_id, follow_up_due_at,
        },
      });

      try {
        await sb.rpc("crm_send_notification", {
          _assigned_to: assigned_to ?? "",
          _title: `New website lead — ${args?.first_name ?? email ?? phone ?? "visitor"}`,
          _body: (args?.message ?? `Captured by Zara${args?.project_slug ? ` · ${args.project_slug}` : ""}`).slice(0, 200),
          _category: "zara_capture",
          _payload: { contact_id, follow_up_task_id, follow_up_due_at, project_slug: args?.project_slug ?? null, intent, timeframe },
          _dedupe_key: `zara_capture:${contact_id}:${ctx?.conversation_id ?? "anon"}`,
        } as any);
      } catch (e) {
        console.warn("capture_lead notification failed:", (e as Error).message);
      }
    } catch (e) {
      console.warn("capture_lead post-processing error:", (e as Error).message);
    }
  }

  return ok({
    contact_id,
    created: out?.created ?? false,
    matched: out?.matched ?? false,
    follow_up_task_id,
    follow_up_due_at,
  });
}

async function get_unit_availability(args: any, _ctx: any) {
  const sb = svc();
  let q = sb.from("presale_projects").select("id,slug,name,status,unit_types,unit_count,completion_year,completion_quarter,city,price_range_low,price_range_high,starting_psf").limit(1);
  if (args?.project_id) q = q.eq("id", args.project_id);
  else if (args?.project_slug) q = q.eq("slug", args.project_slug);
  else return fail("project_slug or project_id required");
  const { data, error } = await q.maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("project not found");
  const human_status: Record<string, string> = {
    pre_launch: "Pre-launch — VIP list now",
    selling: "Actively selling",
    sold_out: "Sold out",
    completed: "Completed",
  };
  return ok({ ...data, status_label: human_status[data.status] ?? data.status });
}

async function escalate_to_human(args: any, ctx: any) {
  const sb = svc();
  const reason = String(args?.reason ?? "").slice(0, 500);
  const snippet = String(args?.transcript_snippet ?? "").slice(0, 800);
  const urgency = (args?.urgency ?? "medium") as "low" | "medium" | "high";

  // Resolve assigned agent (if a contact exists)
  let assigned_to: string | null = null;
  let contact_id: string | null = args?.contact_id ?? ctx?.public_contact_id ?? null;
  if (contact_id) {
    const { data } = await sb.from("crm_contacts").select("assigned_to").eq("id", contact_id).maybeSingle();
    assigned_to = (data as any)?.assigned_to ?? null;
    // Log an activity event so the timeline shows it
    await sb.from("crm_activity_events").insert({
      contact_id, event_type: "zara_escalation",
      description: `Zara escalation (${urgency}): ${reason}\n\n${snippet}`,
      occurred_at: new Date().toISOString(),
      metadata: { source: "zara-public-chat", urgency, conversation_id: ctx?.conversation_id ?? null },
    });
  }

  // Route notification to assigned agent (or owner+admins if unassigned)
  try {
    await sb.rpc("crm_send_notification", {
      _assigned_to: assigned_to ?? "",
      _title: `Zara escalation — ${urgency}`,
      _body: reason.slice(0, 200),
      _category: "zara_escalation",
      _payload: { contact_id, reason, snippet, urgency, conversation_id: ctx?.conversation_id ?? null },
      _dedupe_key: `zara_escalation:${ctx?.conversation_id ?? "anon"}:${Date.now()}`,
    } as any);
  } catch (e) {
    console.warn("escalate notification failed", (e as Error).message);
  }
  return ok({ notified: true, assigned_to, contact_id, urgency });
}

async function get_floor_plans(args: any, _ctx: any) {
  const sb = svc();
  const slug = String(args?.project_slug ?? "").trim();
  if (!slug) return fail("project_slug required");

  const max = Math.min(Math.max(Number(args?.max ?? 12), 1), 50);
  const ttl = Math.min(Math.max(Number(args?.ttl_seconds ?? 300), 60), 3600);

  let q = sb.from("crm_project_floorplans")
    .select("id,name,storage_path,bedrooms,bathrooms,sqft,price_from,sort_order")
    .eq("project_slug", slug)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("bedrooms", { ascending: true, nullsFirst: false })
    .limit(max);
  if (args?.bedrooms != null) q = q.eq("bedrooms", Number(args.bedrooms));

  const { data, error } = await q;
  if (error) return fail(error.message);
  if (!data?.length) return ok({ project_slug: slug, count: 0, floor_plans: [], note: "No private floor plans on file for this project." });

  const plans: any[] = [];
  for (const row of data) {
    const { data: signed, error: sErr } = await sb.storage
      .from("presale-floorplans")
      .createSignedUrl(row.storage_path, ttl);
    if (sErr || !signed?.signedUrl) {
      console.warn("get_floor_plans sign failed:", row.storage_path, sErr?.message);
      continue;
    }
    plans.push({
      id: row.id,
      name: row.name,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      sqft: row.sqft,
      price_from: row.price_from,
      url: signed.signedUrl,
      expires_in: ttl,
      filename: row.storage_path.split("/").pop(),
    });
  }

  return ok({ project_slug: slug, count: plans.length, ttl_seconds: ttl, floor_plans: plans });
}

// ── Website Intelligence Layer ─────────────────────────────────────────

// Classify a raw activity-events row (or nested behavior_batch view) into a
// human-readable behaviour category Zara can reason about.
function classifyEvent(type: string, meta: any): string {
  const t = String(type || "").toLowerCase();
  const path = String(meta?.page_path ?? meta?.path ?? meta?.url ?? "").toLowerCase();
  const label = String(meta?.event_label ?? meta?.label ?? "").toLowerCase();
  if (t.includes("form_abandon") || label.includes("abandon")) return "booking_abandon";
  if (t.includes("form_start") || t === "form" || t.includes("booking_start")) return "booking_start";
  if (t.includes("contact_form") || t.includes("vip_registration")) return "form_submission";
  if (t.includes("return_visit")) return "repeat_visit";
  if (t.includes("email_open")) return "email_open";
  if (t.includes("email_click")) return "email_click";
  if (t.includes("email_sent") || t.includes("email.sent") || t.includes("auto_response")) return "email_sent";
  if (t.includes("sms_inbound")) return "sms_inbound";
  if (t.includes("sms_outbound")) return "sms_outbound";
  if (path.includes("/floorplan") || label.includes("floorplan") || label.includes("floor plan")) return "floor_plan_download";
  if (path.includes("/pricing") || label.includes("pricing")) return "pricing_request";
  if (path.includes("/brochure") || path.includes("/deck") || label.includes("brochure") || label.includes("deck")) return "brochure_download";
  if (path.includes("/assignment") || label.includes("assignment")) return "assignment_page_view";
  if (path.includes("/calculator") || label.includes("calculator") || label.includes("mortgage")) return "calculator_usage";
  if (path.includes("/compare") || label.includes("compare")) return "comparison_view";
  if (path.includes("/guide") || path.includes("/buyer") || path.includes("/process")) return "buyer_guide_view";
  if (path.includes("/blog") || path.includes("/news")) return "blog_view";
  if (path.includes("/projects/") || meta?.project_slug) return "project_view";
  if (path.includes("/cities/") || path.includes("/neighborhood")) return "city_page_view";
  if (label.includes("cta") || meta?.cta) return "cta_click";
  if (t === "page_view" || t.includes("visitor.presence")) return "page_view";
  return t || "unknown";
}

async function get_lead_website_behavior(args: any, _ctx: Ctx) {
  const sb = svc();
  const since = Math.min(Math.max(Number(args.since_days ?? 90), 1), 365);
  const sinceIso = new Date(Date.now() - since * 24 * 3600 * 1000).toISOString();

  // Resolve contact
  let contactId: string | null = args.contact_id ?? null;
  let email: string | null = args.email ? String(args.email).toLowerCase().trim() : null;
  let phone: string | null = args.phone ? String(args.phone).trim() : null;
  if (contactId && (!email || !phone)) {
    const { data: c } = await sb.from("crm_contacts").select("email,phone").eq("id", contactId).maybeSingle();
    email = email ?? (c as any)?.email ?? null;
    phone = phone ?? (c as any)?.phone ?? null;
  }
  if (!contactId && !email && !phone) return fail("contact_id, email, or phone required");

  // Pull events — by contact_id OR email OR phone
  let q = sb.from("crm_activity_events")
    .select("id,type,project_slug,metadata,occurred_at")
    .gte("occurred_at", sinceIso)
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (contactId) q = q.eq("contact_id", contactId);
  else if (email) q = q.eq("lead_email", email);
  else if (phone) q = q.eq("lead_phone", phone);

  const { data, error } = await q;
  if (error) return fail(error.message);

  // Flatten: each row becomes 1+ classified events. behavior_batch unpacks nested views/sessions/forms.
  type FlatEv = { kind: string; project_slug: string | null; page_path: string | null; occurred_at: string; raw_type: string };
  const flat: FlatEv[] = [];
  for (const row of (data ?? [])) {
    const meta: any = row.metadata ?? {};
    const baseTime = row.occurred_at;
    if (row.type === "behavior_batch") {
      const b = meta?.behavior ?? {};
      for (const v of (b.views ?? [])) {
        flat.push({
          kind: classifyEvent("page_view", { ...meta, ...(v as any) }),
          project_slug: (v as any)?.project_slug ?? row.project_slug ?? null,
          page_path: (v as any)?.page_path ?? (v as any)?.path ?? meta?.page_path ?? null,
          occurred_at: (v as any)?.viewed_at ?? baseTime,
          raw_type: "page_view",
        });
      }
      for (const f of (b.forms ?? [])) {
        const kind = (f as any)?.abandoned ? "booking_abandon" : "booking_start";
        flat.push({
          kind,
          project_slug: (f as any)?.project_slug ?? row.project_slug ?? null,
          page_path: (f as any)?.page_path ?? null,
          occurred_at: (f as any)?.occurred_at ?? baseTime,
          raw_type: "form",
        });
      }
      for (const s of (b.sessions ?? [])) {
        flat.push({
          kind: "session",
          project_slug: row.project_slug ?? null,
          page_path: (s as any)?.landing_page ?? null,
          occurred_at: (s as any)?.started_at ?? baseTime,
          raw_type: "session",
        });
      }
    } else {
      flat.push({
        kind: classifyEvent(row.type, meta),
        project_slug: row.project_slug ?? meta?.project_slug ?? null,
        page_path: meta?.page_path ?? meta?.path ?? null,
        occurred_at: baseTime,
        raw_type: row.type,
      });
    }
  }

  // Optional type filter
  let filtered = flat;
  if (Array.isArray(args.types) && args.types.length) {
    const allow = new Set(args.types.map((t: any) => String(t).toLowerCase()));
    filtered = flat.filter((e) => allow.has(e.kind));
  }

  // Aggregate counts
  const counts: Record<string, number> = {};
  const projectViews: Record<string, { count: number; last_viewed_at: string }> = {};
  for (const e of filtered) {
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    if (e.project_slug && (e.kind === "project_view" || e.kind === "floor_plan_download" || e.kind === "page_view")) {
      const cur = projectViews[e.project_slug];
      if (!cur || cur.last_viewed_at < e.occurred_at) {
        projectViews[e.project_slug] = { count: (cur?.count ?? 0) + 1, last_viewed_at: e.occurred_at };
      } else {
        cur.count += 1;
      }
    }
  }

  // Sessions in last 30d (repeat_visits)
  const sessions30d = filtered.filter((e) => e.kind === "session" && e.occurred_at > new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()).length;

  // Bridge fallback if local is empty
  let bridge: any = null;
  if (!filtered.length && (email || phone)) {
    try {
      bridge = await presaleBridge.getLeadBehavior({ email: email ?? undefined, phone: phone ?? undefined });
    } catch (e) {
      console.warn("[get_lead_website_behavior] bridge fallback failed", (e as Error).message);
    }
  }

  return ok({
    contact_id: contactId,
    since_days: since,
    counts,
    project_views: Object.entries(projectViews).map(([slug, v]) => ({ project_slug: slug, count: v.count, last_viewed_at: v.last_viewed_at }))
      .sort((a, b) => b.count - a.count).slice(0, 20),
    sessions_last_30d: sessions30d,
    recent_timeline: filtered.slice(0, 20),
    bridge_fallback: bridge,
    has_data: filtered.length > 0 || !!bridge,
  });
}

async function search_website_content(args: any) {
  const sb = svc();
  const q = String(args.query ?? "").trim();
  if (!q) return fail("query required");
  const topK = Math.min(Math.max(Number(args.top_k ?? 5), 1), 10);
  const embedding = await embedQuery(q);
  const allowed = Array.isArray(args.types) && args.types.length
    ? args.types
    : ["buyer_guide", "assignment_page", "city_page", "calculator", "comparison", "blog_post", "process_page"];

  // Try vector search via existing RPC if available; fall back to ilike on title/excerpt.
  if (embedding) {
    try {
      const { data, error } = await sb.rpc("match_zara_knowledge", {
        query_embedding: embedding as any,
        match_count: topK * 3,
        filter_types: allowed,
      });
      if (!error && data) {
        return ok({ results: (data as any[]).slice(0, topK) });
      }
    } catch (_) { /* fall through */ }
  }
  const { data } = await sb.from("zara_knowledge_documents")
    .select("id,title,type,source_url,last_crawled_at")
    .in("type", allowed)
    .or(`title.ilike.%${q}%`)
    .limit(topK);
  return ok({ results: data ?? [], note: embedding ? "fallback_text_search" : "no_embedding_model" });
}

async function lookup_topic(args: any, ctx: Ctx) {
  const sb = svc();
  const topic = String(args.topic ?? "").trim();
  const slug = args.project_slug ?? null;
  if (!topic) return fail("topic required");

  // Dispatch to the right structured tool
  let resolved: any = null;
  try {
    switch (topic) {
      case "pricing":
      case "deposit_structure":
      case "incentives": {
        const p = await get_pricing(args, ctx);
        resolved = (p as any)?.ok ? p : null;
        break;
      }
      case "availability":
      case "unit_count":
      case "unit_types": {
        const p = await get_unit_availability(args, ctx);
        resolved = (p as any)?.ok ? p : null;
        break;
      }
      case "completion_date":
      case "assignment_rules":
      case "brochure": {
        const p = await project_details(args);
        resolved = (p as any)?.ok ? p : null;
        break;
      }
      case "floor_plans": {
        const p = await get_floor_plans({ project_slug: slug }, ctx);
        resolved = (p as any)?.ok ? p : null;
        break;
      }
      default:
        return fail(`unsupported topic: ${topic}`);
    }
  } catch (e) {
    console.warn("[lookup_topic] dispatch failed", (e as Error).message);
  }

  // Decide whether resolved data is "verified" — must have a non-null value for the topic.
  const verified = (() => {
    if (!resolved) return false;
    switch (topic) {
      case "pricing": return resolved.price_range_low != null || resolved.price_range_high != null || !!resolved.pricing_url;
      case "deposit_structure": return !!resolved.deposit_structure;
      case "incentives": return Array.isArray(resolved.incentives) && resolved.incentives.length > 0;
      case "availability": return !!resolved.status;
      case "unit_count": return resolved.unit_count != null;
      case "unit_types": return Array.isArray(resolved.unit_types) && resolved.unit_types.length > 0;
      case "completion_date": return !!resolved?.project?.completion_date || !!resolved.completion_year;
      case "assignment_rules": return !!resolved?.project?.assignment_rules;
      case "brochure": return !!resolved?.project?.brochure_url;
      case "floor_plans": return (resolved.count ?? 0) > 0;
      default: return false;
    }
  })();

  if (!verified) {
    // Log the miss so admins can prioritise data hygiene
    try {
      await sb.from("zara_lookup_misses").insert({
        topic,
        project_slug: slug,
        contact_id: args.contact_id ?? null,
        details: { args, resolved_summary: summarize(resolved) },
      });
    } catch (_) { /* non-fatal */ }
    return ok({
      status: "unavailable",
      topic,
      project_slug: slug,
      reason: "no verified data on file",
      action_for_agent: `Pull the latest ${topic.replace(/_/g, " ")} from the developer and rerun this draft, or escalate to Uzair.`,
    });
  }

  return ok({ status: "verified", topic, project_slug: slug, data: resolved });
}

// ── Dispatch ───────────────────────────────────────────────────────────

const REGISTRY: Record<string, (args: any, ctx: Ctx) => Promise<unknown>> = {
  get_lead_context, search_leads, update_lead, confirm_update_lead,
  draft_email, draft_sms, draft_whatsapp, add_lead_note, add_lead_tag, set_lead_status,
  schedule_follow_up, list_pending_drafts, approve_draft, send_briefing_summary,
  list_projects, project_details, recommend_projects_for_lead, web_research,
  log_training_feedback, show_engagement_score,
  // RAG
  search_knowledge, get_winning_pattern, get_project_deep_dive, get_market_context,
  // Phase 4
  book_calendly, get_pricing, attach_floorplan, schedule_follow_up_smart, enrich_lead,
  // Public-site
  capture_lead, get_unit_availability, escalate_to_human, get_floor_plans, send_brochure,
  // Website Intelligence Layer
  get_lead_website_behavior, search_website_content, lookup_topic,
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { tool, args, ctx } = body as { tool: string; args: any; ctx: Ctx };
    const fn = REGISTRY[tool];
    if (!fn) return new Response(JSON.stringify({ ok: false, error: `Unknown tool: ${tool}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const result = await fn(args ?? {}, ctx);
    // Read-only tools don't self-log; log them here so the analytics dashboard
    // and audit trail capture every tool dispatch (write tools log inline).
    const READ_ONLY = new Set([
      "get_lead_context", "search_leads", "list_pending_drafts", "list_projects",
      "project_details", "recommend_projects_for_lead", "web_research",
      "show_engagement_score", "search_knowledge", "get_winning_pattern",
      "get_project_deep_dive", "get_market_context", "get_pricing", "enrich_lead",
      "send_briefing_summary", "get_unit_availability", "get_floor_plans",
      "get_lead_website_behavior", "search_website_content", "lookup_topic",
    ]);
    if (READ_ONLY.has(tool)) {
      await logAction(ctx, tool, args ?? {}, result, args?.contact_id ?? null);
    }
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
