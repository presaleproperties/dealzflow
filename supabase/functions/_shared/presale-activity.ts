// Canonical Presale → CRM activity processor.
// Both `push-activity-to-crm` (new envelope) and `receive-presale-activity`
// (legacy envelope) translate their inputs into a `NormalizedActivity` and
// call `processPresaleActivity()`. This is the SINGLE source of truth for:
//   • Idempotency (event_id / email_log_id / metadata.event_id)
//   • Identity stitch (presale_user_id → email → phone)
//   • Lead lifecycle auto-create (lead.created / contact_form / behavior_batch w/ completed form)
//   • Activity event insert
//   • Behavior batch fan-out (forms / views / sessions / engagement)
//   • Hot-lead computation (floorplan_download / deck revisit / 2+ opens / 7d burst)
//   • Notifications routed via crm_recipients_for_contact

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type SupabaseClient = ReturnType<typeof createClient>;

export interface NormalizedActivity {
  /** Canonical CRM activity type (already mapped). e.g. "email.opened", "floorplan_download" */
  type: string;
  /** Original wire event_type (kept in metadata for forensics) */
  raw_event_type?: string | null;
  email: string | null;
  phone: string | null;
  /** Presale visitor id (a.k.a. presale_user_id) */
  visitor_id: string | null;
  project_slug: string | null;
  agent_slug: string | null;
  occurred_at: string;
  /** Free-form metadata. May contain `behavior` for batch fan-out. */
  metadata: Record<string, any>;
  /** Display name hint for auto-create */
  name_hint?: string | null;
  /** Stable event id for idempotency (preferred over email_log_id) */
  event_id?: string | null;
  /** Presale outbound email_log_id — also used for idempotency */
  email_log_id?: string | null;
}

const INTERNAL_EMAILS = new Set([
  "info@presaleproperties.com",
  "admin@presaleproperties.com",
  "noreply@presaleproperties.com",
  "no-reply@presaleproperties.com",
]);

const LEAD_LIFECYCLE_EVENTS = new Set([
  "lead.created", "lead.approved", "contact_form",
]);
const HIGH_INTENT = new Set([
  "email_open", "email_opened", "email.opened",
  "deck_unlock", "link_click", "email_clicked", "email.clicked",
  "return_visit",
]);
const FALLBACK_AGENT = "Uzair Muhammad";

function cleanEmail(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null;
}
function cleanPhone(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function splitName(value: unknown): { first_name: string; last_name: string } {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { first_name: "New", last_name: "" };
  const parts = raw.split(/\s+/).filter(Boolean);
  return { first_name: parts[0] || "New", last_name: parts.slice(1).join(" ") };
}

async function pickAssignee(supabase: SupabaseClient, agentSlug?: string | null, leadEmail?: string | null, leadFirstName?: string | null): Promise<string> {
  if (agentSlug) {
    const wanted = agentSlug.trim().toLowerCase();
    const { data: team } = await supabase
      .from("crm_team")
      .select("display_name, slug, email, presale_email")
      .eq("is_active", true);
    const match = (team ?? []).find((t: any) => {
      const nameSlug = (t.display_name ?? "").toLowerCase().replace(/\s+/g, "-");
      const emailLocal = (t.email ?? "").split("@")[0]?.toLowerCase();
      const presaleLocal = (t.presale_email ?? "").split("@")[0]?.toLowerCase();
      return t.slug?.toLowerCase() === wanted || nameSlug === wanted || emailLocal === wanted || presaleLocal === wanted;
    });
    if (match?.display_name) return match.display_name;
  }
  if (leadEmail || leadFirstName) {
    const local = (leadEmail ?? "").split("@")[0]?.toLowerCase().replace(/\d+$/g, "") ?? "";
    const first = (leadFirstName ?? "").trim().toLowerCase();
    const { data: team } = await supabase
      .from("crm_team")
      .select("display_name, slug, email, presale_email")
      .eq("is_active", true);
    const match = (team ?? []).find((t: any) => {
      const displayFirst = (t.display_name ?? "").split(/\s+/)[0]?.toLowerCase();
      const emailLocal = (t.email ?? "").split("@")[0]?.toLowerCase();
      const presaleLocal = (t.presale_email ?? "").split("@")[0]?.toLowerCase();
      return displayFirst && first === displayFirst && (local === displayFirst || local === emailLocal || local === presaleLocal);
    });
    if (match?.display_name) return match.display_name;
  }
  const { data: owner } = await supabase
    .from("crm_team")
    .select("display_name")
    .eq("is_active", true)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (owner?.display_name) return owner.display_name;

  const { data: agents } = await supabase
    .from("crm_team")
    .select("display_name, role")
    .eq("is_active", true)
    .in("role", ["agent", "admin"]);
  const candidates = (agents ?? []).map((a: any) => a.display_name).filter(Boolean);
  if (!candidates.length) return FALLBACK_AGENT;
  const counts: Record<string, number> = {};
  for (const name of candidates) {
    const { count } = await supabase
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", name);
    counts[name] = count ?? 0;
  }
  candidates.sort((a: string, b: string) => (counts[a] ?? 0) - (counts[b] ?? 0));
  return candidates[0];
}

async function notifySyncFailure(
  supabase: SupabaseClient,
  reason: string,
  detail: string,
  link: string = "/crm",
) {
  try {
    const { data: admins } = await supabase
      .from("crm_team")
      .select("user_id")
      .eq("is_active", true)
      .in("role", ["owner", "admin"]);
    const userIds = (admins ?? []).map((r: any) => r.user_id).filter(Boolean);
    if (!userIds.length) return;
    const title = `⚠️ Presale sync issue: ${reason}`;
    const body = detail.slice(0, 500);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rows: any[] = [];
    for (const u of userIds) {
      const { data: existing } = await supabase
        .from("crm_notifications")
        .select("id")
        .eq("user_id", u)
        .eq("type", "presale_sync_error")
        .eq("title", title)
        .eq("body", body)
        .gte("created_at", since)
        .limit(1)
        .maybeSingle();
      if (!existing) rows.push({ user_id: u, title, body, type: "presale_sync_error", link_to: link, is_read: false });
    }
    if (rows.length) await supabase.from("crm_notifications").insert(rows);
  } catch (e) {
    console.error("[presale-activity] notifySyncFailure failed:", e);
  }
}

export interface ProcessResult {
  ok: true;
  deduped?: boolean;
  skipped?: string;
  activity_id?: string | null;
  contact_id?: string | null;
  matched?: boolean;
  high_intent?: boolean;
  notified?: boolean;
  expanded?: { forms: number; views: number; sessions: number; engagement: number };
  projects_appended?: string[];
}

export async function processPresaleActivity(
  supabase: SupabaseClient,
  ev: NormalizedActivity,
): Promise<ProcessResult | { error: string; status: number }> {
  if (!ev.type) return { error: "missing_type", status: 400 };
  if (!ev.email && !ev.phone && !ev.visitor_id) {
    return { error: "missing_lead_identifier", status: 400 };
  }
  if (ev.email && INTERNAL_EMAILS.has(ev.email)) {
    return { ok: true, skipped: "internal_email" };
  }

  const email = ev.email;
  const phone = ev.phone;
  const visitorId = ev.visitor_id;
  const occurredAt = ev.occurred_at;
  const meta: any = ev.metadata ?? {};

  // ── Idempotency ──────────────────────────────────────────────────────────
  if (ev.event_id || ev.email_log_id) {
    const filters = [
      ev.event_id ? `metadata->>event_id.eq.${ev.event_id}` : null,
      ev.email_log_id ? `metadata->>email_log_id.eq.${ev.email_log_id}` : null,
    ].filter(Boolean).join(",");
    if (filters) {
      const { data: dupe } = await supabase
        .from("crm_activity_events")
        .select("id, contact_id")
        .or(filters)
        .limit(1)
        .maybeSingle();
      if (dupe?.id) {
        return { ok: true, deduped: true, activity_id: dupe.id, contact_id: (dupe as any).contact_id ?? null, matched: !!(dupe as any).contact_id };
      }
    }
  }

  // ── Identity stitch: presale_user_id → email → phone ─────────────────────
  let contact: { id: string; first_name: string | null; last_name: string | null; assigned_to: string | null } | null = null;
  if (visitorId) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, first_name, last_name, assigned_to")
      .eq("presale_user_id", visitorId)
      .maybeSingle();
    if (data) contact = data as typeof contact;
  }
  if (!contact && email) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, first_name, last_name, assigned_to")
      .ilike("email", email)
      .maybeSingle();
    if (data) contact = data as typeof contact;
  }
  if (!contact && phone) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, first_name, last_name, assigned_to")
      .eq("phone", phone)
      .maybeSingle();
    if (data) contact = data as typeof contact;
  }

  // ── Auto-create lead if lifecycle event or behavior_batch w/ completed form ─
  const behaviorPre: any = meta?.behavior ?? null;
  const completedForm = behaviorPre && Array.isArray(behaviorPre.forms)
    ? behaviorPre.forms.find((f: any) => (f?.status ?? "").toLowerCase() === "completed")
    : null;
  const isBehaviorLeadCreate =
    !contact && ev.type === "behavior_batch" && !!completedForm && (!!email || !!phone);

  if (!contact && (LEAD_LIFECYCLE_EVENTS.has(ev.type) || isBehaviorLeadCreate) && (email || phone)) {
    const formPayload: any = completedForm?.payload ?? completedForm ?? {};
    const { first_name, last_name } = splitName(
      ev.name_hint ?? meta.name ?? meta.full_name ?? formPayload.name ?? formPayload.full_name ??
        [formPayload.first_name, formPayload.last_name].filter(Boolean).join(" "),
    );
    const assignee = await pickAssignee(supabase, ev.agent_slug ?? meta.agent_slug ?? null);
    const leadEmail = email ?? cleanEmail(meta.email) ?? cleanEmail(formPayload.email);
    const leadPhone = phone ?? cleanPhone(meta.phone) ?? cleanPhone(formPayload.phone);
    const leadSource = typeof meta.lead_source === "string" ? meta.lead_source : (completedForm?.form_type ?? null);
    // Junk-project filter (yes/no answers, "Working with agent" style labels)
    const JUNK_PROJECT_RE = [
      /^working with (an? )?agent$/i,
      /^(have|has) (an? )?agent$/i,
      /^(yes|no|n\/a|na|unknown|true|false)$/i,
      /^agent[_\s-]?status$/i,
    ];
    const projects = ([
      ev.project_slug, meta.project, meta.property_name, meta.project_name,
      completedForm?.property_name, formPayload.project, formPayload.property_name,
    ].filter(Boolean) as string[])
      .filter((p) => p.trim().length >= 2 && !JUNK_PROJECT_RE.some((re) => re.test(p)));
    const personaRaw = (meta.persona ?? formPayload.persona ?? "").toString().trim().toLowerCase();
    const personaType = ["buyer", "investor", "realtor", "developer"].includes(personaRaw) ? personaRaw : null;

    // Lead-source aliases → canonical form-type tag (avoid duplicate tags)
    const LEAD_SOURCE_ALIASES: Record<string, string> = {
      "project_floor_plan": "floor_plan_request",
      "project_floorplan": "floor_plan_request",
      "floorplan_request": "floor_plan_request",
      "vip_signup": "vip_registration",
    };
    const JUNK_TAG = new Set([
      "presaleproperties.com", "presale-properties.com",
      "yes", "no", "true", "false", "n/a", "na", "unknown",
    ]);
    const tagSet = new Set<string>(["presale-website"]);
    const addTag = (raw?: string | null) => {
      const t = String(raw ?? "").trim();
      if (!t) return;
      const low = t.toLowerCase();
      if (JUNK_TAG.has(low)) return;
      tagSet.add(LEAD_SOURCE_ALIASES[low] ?? t);
    };
    if (completedForm?.form_type) addTag(`form:${completedForm.form_type}`);
    const deckName = meta.pitch_deck_name ?? meta.deck_name ?? meta.deck?.name;
    if (deckName) addTag(`deck:${deckName}`);
    if (leadSource) addTag(leadSource);
    // Representation status — useful triage
    const agentStatus = String(meta.agent_status ?? "").toLowerCase();
    if (agentStatus === "no") addTag("unrepresented");
    else if (agentStatus === "yes") addTag("has-agent");
    if (personaType) addTag(personaType);
    if (meta.is_pre_approved === true) addTag("pre-approved");
    let isHotInit = ev.type === "floorplan_download"
      || (ev.type === "deck_visit" && (meta.visit_number ?? 0) >= 2);
    // Heavy browser = hot
    const sessionsArr: any[] = Array.isArray(meta?.behavior?.sessions) ? meta.behavior.sessions : [];
    if (sessionsArr.some((s) => (Number(s?.pages_viewed) || 0) >= 20)) {
      addTag("heavy-browser");
      isHotInit = true;
    }
    if (isHotInit) addTag("hot");

    const noteLines: string[] = [`[Presale form @ ${occurredAt}]`];
    if (completedForm?.form_type) noteLines.push(`Form: ${completedForm.form_type}`);
    if (meta.lead_source) noteLines.push(`Lead source: ${meta.lead_source}`);
    if (meta.persona) noteLines.push(`Persona: ${meta.persona}`);
    if (meta.agent_status) {
      const a = String(meta.agent_status).toLowerCase();
      noteLines.push(`Working with an agent: ${a === "no" ? "No (unrepresented)" : a === "yes" ? "Yes" : meta.agent_status}`);
    }
    if (meta.intent_tier) noteLines.push(`Intent tier: ${meta.intent_tier}`);
    if (meta.landing_page) noteLines.push(`Landing: ${meta.landing_page}`);
    if (meta.referrer) noteLines.push(`Referrer: ${meta.referrer}`);
    const utm = [meta.utm_source, meta.utm_medium, meta.utm_campaign].filter(Boolean).join(" / ");
    if (utm) noteLines.push(`UTM: ${utm}`);
    // Engagement signal
    const totalPages = sessionsArr.reduce((n: number, s: any) => n + (Number(s?.pages_viewed) || 0), 0);
    if (totalPages) noteLines.push(`Engagement: ${totalPages} page views across ${sessionsArr.length} session${sessionsArr.length === 1 ? "" : "s"}`);
    const viewedProjects = Array.from(new Set((meta?.behavior?.views ?? []).map((v: any) => v?.property_name).filter(Boolean)));
    if (viewedProjects.length) noteLines.push(`Viewed projects: ${viewedProjects.join(", ")}`);
    const messageText = formPayload.message ?? meta.message;
    if (typeof messageText === "string" && messageText.trim()) noteLines.push(`Message: ${messageText.trim()}`);
    const noteAppendix = noteLines.length > 1 ? noteLines.join("\n") : null;

    const { data: created, error: createErr } = await supabase
      .from("crm_contacts")
      .insert({
        first_name, last_name,
        email: leadEmail,
        phone: leadPhone,
        presale_user_id: visitorId,
        source: "PresaleProperties.com",
        contact_type: personaType,
        notes: noteAppendix,
        project: projects[0] ?? null,
        projects: Array.from(new Set(projects)),
        presale_metadata: meta,
        tags: Array.from(tagSet),
        status: "New Lead",
        lead_type: "Pre-Sale",
        lead_tier: isHotInit ? "hot" : null,
        assigned_to: assignee,
        sync_source: "presale",
        lofty_synced_at: occurredAt,
        last_activity_at: occurredAt,
        ai_summary_stale: true,
      })
      .select("id, first_name, last_name, assigned_to")
      .single();
    if (createErr) {
      await notifySyncFailure(supabase, "lead create failed", `${ev.type} for ${leadEmail ?? leadPhone}: ${createErr.message}`);
      return { error: createErr.message, status: 500 };
    }
    contact = created as typeof contact;
  } else if (!contact && ev.type !== "behavior_batch" && email) {
    // Light auto-create for one-off email/engagement events (push-activity-to-crm legacy behavior)
    const { first_name, last_name } = splitName(ev.name_hint);
    const assignee = await pickAssignee(supabase, ev.agent_slug ?? null);
    const tags = ["presale-website"];
    if (ev.raw_event_type === "vip_registration" || ev.type === "vip_registration") tags.push("vip");
    const { data: created, error: createErr } = await supabase
      .from("crm_contacts")
      .insert({
        first_name, last_name,
        email,
        phone,
        presale_user_id: visitorId,
        source: "PresaleProperties.com",
        status: "New Lead",
        lead_type: "Pre-Sale",
        tags,
        assigned_to: assignee,
        sync_source: "presale",
        last_activity_at: occurredAt,
        ai_summary_stale: true,
        notes: `[Presale ${ev.raw_event_type ?? ev.type} @ ${occurredAt}] auto-created from activity webhook`,
      })
      .select("id, first_name, last_name, assigned_to")
      .single();
    if (createErr) return { error: `contact_create_failed: ${createErr.message}`, status: 500 };
    contact = created as typeof contact;
  }

  // Backfill presale_user_id on stitched contact
  if (contact && visitorId) {
    await supabase
      .from("crm_contacts")
      .update({ presale_user_id: visitorId })
      .eq("id", contact.id)
      .is("presale_user_id", null);
  }

  // ── Insert activity (always, except dedupe behavior_batch) ──────────────
  const activityMeta: Record<string, any> = { ...meta };
  if (ev.raw_event_type) activityMeta.event_type = ev.raw_event_type;
  if (ev.event_id) activityMeta.event_id = ev.event_id;
  if (ev.email_log_id) activityMeta.email_log_id = ev.email_log_id;

  // For behavior_batch (heartbeat-style pings), derive a stable fingerprint
  // event_id from the latest content timestamps so repeated batches collapse
  // into a single timeline entry instead of spamming "Visited X" rows.
  let batchSkipped = false;
  if (ev.type === "behavior_batch" && !activityMeta.event_id) {
    const beh: any = activityMeta.behavior ?? {};
    const maxTs = (arr: any[], key: string) =>
      Array.isArray(arr) && arr.length
        ? arr.map((r) => r?.[key] ?? "").filter(Boolean).sort().slice(-1)[0] ?? ""
        : "";
    const fp = [
      maxTs(beh.forms, "submitted_at"),
      maxTs(beh.views, "viewed_at"),
      maxTs(beh.sessions, "ended_at"),
      maxTs(beh.engagement, "occurred_at"),
    ].join("|");
    const idScope = contact?.id ?? visitorId ?? email ?? phone ?? "anon";
    const fingerprint = `batch:${idScope}:${fp}`;
    activityMeta.event_id = fingerprint;
    activityMeta.fingerprint = fingerprint;

    const { data: dupe } = await supabase
      .from("crm_activity_events")
      .select("id")
      .eq("type", "behavior_batch")
      .eq("metadata->>fingerprint", fingerprint)
      .limit(1)
      .maybeSingle();
    if (dupe?.id) {
      batchSkipped = true;
    }
  }

  let inserted: { id: string } | null = null;
  if (!batchSkipped) {
    const { data, error: insertErr } = await supabase
      .from("crm_activity_events")
      .insert({
        type: ev.type,
        lead_email: email,
        lead_phone: phone,
        contact_id: contact?.id ?? null,
        project_slug: ev.project_slug,
        agent_slug: ev.agent_slug,
        metadata: activityMeta,
        occurred_at: occurredAt,
      })
      .select("id")
      .single();
    if (insertErr) {
      await notifySyncFailure(supabase, "event insert failed", `${ev.type} for ${email ?? phone ?? "unknown lead"}: ${insertErr.message}`);
      return { error: insertErr.message, status: 500 };
    }
    inserted = data;
  }


  if (!contact && (email || phone)) {
    await notifySyncFailure(
      supabase,
      "lead not matched",
      `Presale sent ${ev.type} for ${email ?? phone} but no CRM contact matched. Event was stored for back-fill.`,
    );
  }

  // ── Hot-lead computation ─────────────────────────────────────────────────
  if (contact) {
    let hotReason: string | null = null;
    const t = ev.type.toLowerCase();
    const visitNum = Number((meta as any)?.visit_number ?? 0);
    if (t === "floorplan_download") hotReason = "floorplan_download";
    else if ((t === "deck_visit" || t === "deck_unlock") && visitNum >= 2) hotReason = "deck_revisit";

    if (!hotReason && (t === "email.opened" || t === "email_opened" || t === "email_open")) {
      const { count } = await supabase
        .from("crm_activity_events")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contact.id)
        .in("type", ["email.opened", "email_opened", "email_open"]);
      if ((count ?? 0) >= 2) hotReason = "email_opens";
    }
    if (!hotReason) {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("crm_activity_events")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contact.id)
        .gte("occurred_at", since);
      if ((count ?? 0) >= 2) hotReason = "activity_burst_7d";
    }

    const updates: Record<string, unknown> = { last_activity_at: occurredAt };
    if (hotReason) {
      const { data: cur } = await supabase
        .from("crm_contacts")
        .select("tags, lead_tier")
        .eq("id", contact.id)
        .maybeSingle();
      const tags = Array.from(new Set([...(cur?.tags ?? []), "hot"]));
      updates.tags = tags;
      if (cur?.lead_tier !== "hot") updates.lead_tier = "hot";
    }
    await supabase.from("crm_contacts").update(updates).eq("id", contact.id);
  }

  // ── Behavior batch fan-out ───────────────────────────────────────────────
  let expanded = { forms: 0, views: 0, sessions: 0, engagement: 0 };
  let projectsAppended: string[] = [];
  const behavior: any = meta?.behavior ?? null;

  if (behavior && (contact || visitorId)) {
    const cId = contact?.id ?? null;
    const forms = Array.isArray(behavior.forms) ? behavior.forms : [];
    const views = Array.isArray(behavior.views) ? behavior.views : [];
    const sessions = Array.isArray(behavior.sessions) ? behavior.sessions : [];
    const engagement = Array.isArray(behavior.engagement) ? behavior.engagement : [];

    async function bulkUpsert(table: string, rows: any[]) {
      if (!rows.length) return 0;
      const { data, error } = await supabase
        .from(table)
        .upsert(rows, { onConflict: "event_id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        console.warn(`[presale-activity] ${table}:`, error.message);
        await notifySyncFailure(supabase, `${table} upsert failed`, `${rows.length} rows for ${email ?? phone ?? cId}: ${error.message}`, `/crm/leads/${cId}`);
        return 0;
      }
      return data?.length ?? 0;
    }

    const idScope = cId ?? visitorId ?? email ?? phone ?? "anon";
    const stableId = (kind: string, key: string) => `${idScope}:${kind}:${key}`;

    expanded.forms = await bulkUpsert("crm_lead_behavior_forms",
      forms.map((f: any) => ({
        event_id: f.event_id ?? stableId("form", `${f.form_type}:${f.submitted_at}`),
        contact_id: cId, presale_user_id: visitorId, email,
        form_type: f.form_type ?? "unknown",
        form_name: f.form_name ?? null,
        status: f.status ?? null,
        property_id: f.property_id ?? null,
        property_name: f.property_name ?? null,
        payload: f.payload ?? f ?? null,
        funnel_step: f.funnel_step ?? null,
        funnel_total_steps: f.funnel_total_steps ?? null,
        submitted_at: f.submitted_at ?? occurredAt,
      })));
    expanded.views = await bulkUpsert("crm_lead_behavior_views",
      views.map((v: any) => ({
        event_id: v.event_id ?? stableId("view", `${v.property_id ?? v.property_url}:${v.viewed_at}`),
        contact_id: cId, presale_user_id: visitorId, email,
        property_id: v.property_id ?? null,
        property_name: v.property_name ?? null,
        property_url: v.property_url ?? null,
        action: v.action ?? "view",
        duration_seconds: v.duration_seconds ?? 0,
        metadata: v.metadata ?? null,
        viewed_at: v.viewed_at ?? occurredAt,
      })));
    expanded.sessions = await bulkUpsert("crm_lead_behavior_sessions",
      sessions.map((s: any) => ({
        event_id: s.event_id ?? stableId("session", s.session_id ?? s.started_at),
        contact_id: cId, presale_user_id: visitorId, email,
        session_id: s.session_id ?? null,
        pages_viewed: s.pages_viewed ?? 0,
        duration_seconds: s.duration_seconds ?? 0,
        referrer: s.referrer ?? null,
        utm_source: s.utm_source ?? null,
        utm_medium: s.utm_medium ?? null,
        utm_campaign: s.utm_campaign ?? null,
        device_type: s.device_type ?? null,
        landing_page: s.landing_page ?? null,
        exit_page: s.exit_page ?? null,
        started_at: s.started_at ?? occurredAt,
        ended_at: s.ended_at ?? null,
      })));
    expanded.engagement = await bulkUpsert("crm_lead_behavior_engagement",
      engagement.map((e: any) => ({
        event_id: e.event_id ?? stableId("eng", `${e.event_type}:${e.occurred_at}:${e.link_url ?? ""}`),
        contact_id: cId, presale_user_id: visitorId, email,
        event_type: e.event_type ?? "unknown",
        campaign_id: e.campaign_id ?? null,
        campaign_name: e.campaign_name ?? null,
        template_id: e.template_id ?? null,
        template_name: e.template_name ?? null,
        link_url: e.link_url ?? null,
        metadata: e.metadata ?? null,
        occurred_at: e.occurred_at ?? occurredAt,
      })));

    const newProjects = Array.from(new Set([
      ...forms.map((f: any) => f.property_name).filter(Boolean),
      ...views.map((v: any) => v.property_name).filter(Boolean),
    ] as string[]));
    if (newProjects.length && cId) {
      const { data: cur } = await supabase
        .from("crm_contacts")
        .select("projects, project, tags, presale_user_id")
        .eq("id", cId)
        .maybeSingle();
      const merged = Array.from(new Set([...(cur?.projects ?? []), ...newProjects]));
      projectsAppended = newProjects.filter((p) => !(cur?.projects ?? []).includes(p));
      const newTags = Array.from(new Set([...(cur?.tags ?? []), "presale-website"]));
      await supabase.from("crm_contacts").update({
        projects: merged,
        project: cur?.project || newProjects[0],
        tags: newTags,
        presale_user_id: cur?.presale_user_id || visitorId,
        last_activity_at: occurredAt,
        ai_summary_stale: true,
      }).eq("id", cId);
    }
  }

  // ── Notifications: completed form submissions in batch ──
  let notified = false;
  if (contact && behavior?.forms) {
    const completed = (behavior.forms as any[]).filter((f) => f?.status === "completed");
    if (completed.length > 0) {
      const { data: recipients } = await supabase.rpc("crm_recipients_for_contact", { _assigned_to: contact.assigned_to ?? "" });
      const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "A lead";
      const formLabel = completed.map((f) => f.form_type).filter(Boolean).join(", ");
      if (Array.isArray(recipients) && recipients.length > 0) {
        await supabase.from("crm_notifications").insert(
          (recipients as string[]).map((u) => ({
            user_id: u,
            title: `📝 ${fullName} submitted a form`,
            body: formLabel ? `New ${formLabel} submission` : "New form submission on Presale",
            type: "hot_lead_activity",
            link_to: `/crm/leads/${contact!.id}`,
            is_read: false,
          })),
        );
        notified = true;
      }
    }
  }

  // ── Notifications: 2+ email opens in last 24h ──
  if (contact && (ev.type === "email_open" || ev.type === "email.opened" || ev.type === "email_opened")) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("crm_activity_events")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contact.id)
      .in("type", ["email_open", "email.opened", "email_opened"])
      .gte("occurred_at", since);
    if ((count ?? 0) >= 2) {
      const { data: recipients } = await supabase.rpc("crm_recipients_for_contact", { _assigned_to: contact.assigned_to ?? "" });
      const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "A lead";
      const projectLabel = ev.project_slug ? ` (${ev.project_slug})` : "";
      if (Array.isArray(recipients) && recipients.length > 0) {
        await supabase.from("crm_notifications").insert(
          (recipients as string[]).map((u) => ({
            user_id: u,
            title: `🔥 ${fullName} is engaging`,
            body: `${count} email opens in the last 24h${projectLabel}`,
            type: "hot_lead_activity",
            link_to: `/crm/leads/${contact!.id}`,
            is_read: false,
          })),
        );
        notified = true;
      }
    }
  }

  return {
    ok: true,
    activity_id: inserted?.id ?? null,
    contact_id: contact?.id ?? null,
    matched: !!contact,
    high_intent: HIGH_INTENT.has(ev.type),
    notified,
    expanded,
    projects_appended: projectsAppended,
  };
}
