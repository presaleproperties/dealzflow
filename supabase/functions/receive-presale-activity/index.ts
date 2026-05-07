// Webhook receiver for real-time engagement events from Presale Properties.
// Authenticated via shared X-Bridge-Secret header. Writes to crm_activity_events,
// matches the lead by email/phone, bumps last_activity_at, and notifies the
// assigned agent on hot signals.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BRIDGE_SECRET = Deno.env.get("PRESALE_BRIDGE_SECRET") ?? "";

type EventType = string;

const HIGH_INTENT: EventType[] = ["email_open", "email_opened", "deck_unlock", "link_click", "email_clicked", "return_visit"];
const LEAD_LIFECYCLE_EVENTS = new Set(["lead.created", "lead.approved", "contact_form"]);
const FALLBACK_AGENT = "Uzair Muhammad";

interface IncomingEvent {
  type: EventType;
  lead_email?: string;
  lead_phone?: string;
  project_slug?: string;
  agent_slug?: string;
  metadata?: Record<string, unknown>;
  occurred_at?: string;
}

function cleanEmail(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

function cleanPhone(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function splitName(value: unknown): { first_name: string; last_name: string } {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { first_name: "New", last_name: "Lead" };
  const parts = raw.split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || "New",
    last_name: parts.slice(1).join(" ") || "Lead",
  };
}

async function pickAssignee(supabase: any, agentSlug?: string | null): Promise<string> {
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

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Notify owner + admins when presale → CRM sync hits a problem so issues
// (missing leads, failed inserts, dropped batches) surface immediately.
async function notifySyncFailure(
  supabase: any,
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
    const userIds = (admins ?? [])
      .map((r: any) => r.user_id)
      .filter(Boolean);
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
    console.error("[receive-presale-activity] notifySyncFailure failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResp({ error: "method_not_allowed" }, 405);
  }

  // Auth via shared bridge secret
  const provided = req.headers.get("x-bridge-secret") ?? "";
  if (!BRIDGE_SECRET || provided !== BRIDGE_SECRET) {
    return jsonResp({ error: "unauthorized" }, 401);
  }

  let body: IncomingEvent;
  try {
    body = (await req.json()) as IncomingEvent;
  } catch {
    return jsonResp({ error: "invalid_json" }, 400);
  }

  if (!body?.type) {
    return jsonResp({ error: "missing_type" }, 400);
  }
  // Allow batches that only carry presale_user_id (anonymous-but-known visitor)
  const metaPre: any = body.metadata ?? {};
  const presaleUserIdEarly: string | null =
    metaPre?.presale_user_id ?? metaPre?.visitor_id ?? null;

  if (!body.lead_email && !body.lead_phone && !presaleUserIdEarly) {
    return jsonResp({ error: "missing_lead_identifier" }, 400);
  }

  // Skip events from internal Presale accounts — they pollute the activity feed
  const INTERNAL_EMAILS = new Set([
    "info@presaleproperties.com",
    "admin@presaleproperties.com",
    "noreply@presaleproperties.com",
    "no-reply@presaleproperties.com",
  ]);
  if (body.lead_email && INTERNAL_EMAILS.has(body.lead_email.trim().toLowerCase())) {
    return jsonResp({ ok: true, skipped: "internal_email" });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const email = body.lead_email?.trim().toLowerCase() ?? null;
  const phone = body.lead_phone?.trim() ?? null;
  const occurredAt = body.occurred_at ?? new Date().toISOString();
  const meta: any = body.metadata ?? {};

  // Identity stitch order: presale_user_id → email → phone
  let contact:
    | {
        id: string;
        first_name: string | null;
        last_name: string | null;
        assigned_to: string | null;
      }
    | null = null;

  if (presaleUserIdEarly) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, first_name, last_name, assigned_to")
      .eq("presale_user_id", presaleUserIdEarly)
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

  // Presale sometimes sends new-lead lifecycle events to this activity webhook
  // instead of bridge-ingest-lead. Treat those as real CRM leads, then continue
  // recording the originating activity against the newly created/merged contact.
  if (!contact && LEAD_LIFECYCLE_EVENTS.has(body.type) && (email || phone)) {
    const { first_name, last_name } = splitName(meta.name ?? meta.full_name);
    const assignee = await pickAssignee(supabase, body.agent_slug ?? meta.agent_slug ?? null);
    const leadEmail = email ?? cleanEmail(meta.email);
    const leadPhone = phone ?? cleanPhone(meta.phone);
    const source = meta.source === "presale_properties_bulk_sync"
      ? "presaleproperties.com"
      : (typeof meta.source === "string" ? meta.source : "presaleproperties.com");
    const leadSource = typeof meta.lead_source === "string" ? meta.lead_source : null;
    const projects = [body.project_slug, meta.project, meta.property_name, meta.project_name].filter(Boolean) as string[];

    const { data: created, error: createErr } = await supabase
      .from("crm_contacts")
      .insert({
        first_name,
        last_name,
        email: leadEmail,
        phone: leadPhone,
        presale_user_id: presaleUserIdEarly,
        source,
        campaign_source: leadSource,
        project: projects[0] ?? null,
        projects: Array.from(new Set(projects)),
        presale_metadata: meta,
        tags: Array.from(new Set(["presale-website", leadSource].filter(Boolean))),
        status: "New Lead",
        lead_type: "Pre-Sale",
        assigned_to: assignee,
        sync_source: "presale",
        lofty_synced_at: occurredAt,
        last_activity_at: occurredAt,
        ai_summary_stale: true,
      })
      .select("id, first_name, last_name, assigned_to")
      .single();

    if (createErr) {
      await notifySyncFailure(
        supabase,
        "lead create failed",
        `${body.type} for ${leadEmail ?? leadPhone}: ${createErr.message}`,
      );
      return jsonResp({ error: createErr.message }, 500);
    }
    contact = created as typeof contact;
  }

  // Backfill presale_user_id on the contact when stitched via email/phone
  if (contact && presaleUserIdEarly) {
    await supabase
      .from("crm_contacts")
      .update({ presale_user_id: presaleUserIdEarly })
      .eq("id", contact.id)
      .is("presale_user_id", null);
  }

  // Insert the event (always, even if no contact match — useful for
  // forensics/back-fill when a lead is created later)
  const { data: inserted, error: insertErr } = await supabase
    .from("crm_activity_events")
    .insert({
      type: body.type,
      lead_email: email,
      lead_phone: phone,
      contact_id: contact?.id ?? null,
      project_slug: body.project_slug ?? null,
      agent_slug: body.agent_slug ?? null,
      metadata: body.metadata ?? {},
      occurred_at: occurredAt,
    })
    .select("id")
    .single();

  if (insertErr) {
    await notifySyncFailure(
      supabase,
      "event insert failed",
      `${body.type} for ${email ?? phone ?? "unknown lead"}: ${insertErr.message}`,
    );
    return jsonResp({ error: insertErr.message }, 500);
  }

  // Lead identifier present but no CRM match — flag so admin can investigate.
  // Skip noise when we only have a presale_user_id (anonymous web visitor).
  if (!contact && (email || phone)) {
    await notifySyncFailure(
      supabase,
      "lead not matched",
      `Presale sent ${body.type} for ${email ?? phone} but no CRM contact matched. Event was stored for back-fill.`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Behavior batch fan-out: when Presale sends type="behavior_batch" with a
  // nested metadata.behavior payload, expand it into the four behavior tables
  // (forms, views, sessions, engagement) and refresh the lead's project list.
  // Without this the Timeline/Engage tabs never see new form submissions.
  // ─────────────────────────────────────────────────────────────────────────
  let expanded = { forms: 0, views: 0, sessions: 0, engagement: 0 };
  let projectsAppended: string[] = [];

  const behavior: any = meta?.behavior ?? null;
  const presaleUserId: string | null = presaleUserIdEarly;

  // Store behavior even when no contact yet — orphan rows get stitched later
  // by the identity-stitch cron once a contact is created/linked.
  if (behavior && (contact || presaleUserId)) {
    const cId = contact?.id ?? null;

    const forms = Array.isArray(behavior.forms) ? behavior.forms : [];
    const views = Array.isArray(behavior.views) ? behavior.views : [];
    const sessions = Array.isArray(behavior.sessions) ? behavior.sessions : [];
    const engagement = Array.isArray(behavior.engagement)
      ? behavior.engagement
      : [];

    async function bulkUpsert(table: string, rows: any[]) {
      if (!rows.length) return 0;
      const { data, error } = await supabase
        .from(table)
        .upsert(rows, { onConflict: "event_id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        console.warn(`[receive-presale-activity] ${table}:`, error.message);
        await notifySyncFailure(
          supabase,
          `${table} upsert failed`,
          `${rows.length} rows for ${email ?? phone ?? cId}: ${error.message}`,
          `/crm/leads/${cId}`,
        );
        return 0;
      }
      return data?.length ?? 0;
    }

    // Stable event_id per row so re-deliveries don't duplicate. Falls back
    // to presale_user_id when no contact yet (orphan rows get stitched later).
    const idScope = cId ?? presaleUserId ?? email ?? phone ?? "anon";
    const stableId = (kind: string, key: string) =>
      `${idScope}:${kind}:${key}`;

    expanded.forms = await bulkUpsert(
      "crm_lead_behavior_forms",
      forms.map((f: any) => ({
        event_id: f.event_id ?? stableId("form", `${f.form_type}:${f.submitted_at}`),
        contact_id: cId,
        presale_user_id: presaleUserId,
        email,
        form_type: f.form_type ?? "unknown",
        form_name: f.form_name ?? null,
        status: f.status ?? null,
        property_id: f.property_id ?? null,
        property_name: f.property_name ?? null,
        payload: f.payload ?? f ?? null,
        funnel_step: f.funnel_step ?? null,
        funnel_total_steps: f.funnel_total_steps ?? null,
        submitted_at: f.submitted_at ?? occurredAt,
      })),
    );

    expanded.views = await bulkUpsert(
      "crm_lead_behavior_views",
      views.map((v: any) => ({
        event_id: v.event_id ?? stableId("view", `${v.property_id ?? v.property_url}:${v.viewed_at}`),
        contact_id: cId,
        presale_user_id: presaleUserId,
        email,
        property_id: v.property_id ?? null,
        property_name: v.property_name ?? null,
        property_url: v.property_url ?? null,
        action: v.action ?? "view",
        duration_seconds: v.duration_seconds ?? 0,
        metadata: v.metadata ?? null,
        viewed_at: v.viewed_at ?? occurredAt,
      })),
    );

    expanded.sessions = await bulkUpsert(
      "crm_lead_behavior_sessions",
      sessions.map((s: any) => ({
        event_id: s.event_id ?? stableId("session", s.session_id ?? s.started_at),
        contact_id: cId,
        presale_user_id: presaleUserId,
        email,
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
      })),
    );

    expanded.engagement = await bulkUpsert(
      "crm_lead_behavior_engagement",
      engagement.map((e: any) => ({
        event_id: e.event_id ?? stableId("eng", `${e.event_type}:${e.occurred_at}:${e.link_url ?? ""}`),
        contact_id: cId,
        presale_user_id: presaleUserId,
        email,
        event_type: e.event_type ?? "unknown",
        campaign_id: e.campaign_id ?? null,
        campaign_name: e.campaign_name ?? null,
        template_id: e.template_id ?? null,
        template_name: e.template_name ?? null,
        link_url: e.link_url ?? null,
        metadata: e.metadata ?? null,
        occurred_at: e.occurred_at ?? occurredAt,
      })),
    );

    // Append any new project names from forms/views into the contact's
    // projects[] so the lead detail reflects current interest.
    const newProjects = Array.from(
      new Set(
        [
          ...forms.map((f: any) => f.property_name).filter(Boolean),
          ...views.map((v: any) => v.property_name).filter(Boolean),
        ] as string[],
      ),
    );
    if (newProjects.length && cId) {
      const { data: cur } = await supabase
        .from("crm_contacts")
        .select("projects, project, tags, presale_user_id")
        .eq("id", cId)
        .maybeSingle();
      const merged = Array.from(
        new Set([...(cur?.projects ?? []), ...newProjects]),
      );
      projectsAppended = newProjects.filter(
        (p) => !(cur?.projects ?? []).includes(p),
      );
      const newTags = Array.from(
        new Set([...(cur?.tags ?? []), "presale-website"]),
      );
      await supabase
        .from("crm_contacts")
        .update({
          projects: merged,
          project: cur?.project || newProjects[0],
          tags: newTags,
          presale_user_id: cur?.presale_user_id || presaleUserId,
          last_activity_at: occurredAt,
          ai_summary_stale: true,
        })
        .eq("id", cId);
    }
  }

  // Update last_activity_at on the contact (NOT last_touch_at — that's
  // reserved for human actions per the last-touch rule).
  if (contact && projectsAppended.length === 0) {
    await supabase
      .from("crm_contacts")
      .update({ last_activity_at: occurredAt })
      .eq("id", contact.id);
  }

  // Notify assigned agent on completed form submissions in this batch
  if (contact && behavior?.forms) {
    const completed = (behavior.forms as any[]).filter(
      (f) => f?.status === "completed",
    );
    if (completed.length > 0) {
      const { data: recipients } = await supabase.rpc(
        "crm_recipients_for_contact",
        { _assigned_to: contact.assigned_to ?? "" },
      );
      const fullName =
        [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
        "A lead";
      const formLabel = completed
        .map((f) => f.form_type)
        .filter(Boolean)
        .join(", ");
      if (Array.isArray(recipients) && recipients.length > 0) {
        await supabase.from("crm_notifications").insert(
          (recipients as string[]).map((u) => ({
            user_id: u,
            title: `📝 ${fullName} submitted a form`,
            body: formLabel
              ? `New ${formLabel} submission`
              : "New form submission on Presale",
            type: "hot_lead_activity",
            link_to: `/crm/leads/${contact!.id}`,
            is_read: false,
          })),
        );
      }
    }
  }

  // Hot-signal notification: 2+ email_opens in the last 24h
  let notified = false;
  if (contact && body.type === "email_open") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("crm_activity_events")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contact.id)
      .eq("type", "email_open")
      .gte("occurred_at", since);

    if ((count ?? 0) >= 2) {
      const { data: recipients } = await supabase.rpc(
        "crm_recipients_for_contact",
        { _assigned_to: contact.assigned_to ?? "" },
      );

      const fullName =
        [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
        "A lead";
      const projectLabel = body.project_slug
        ? ` (${body.project_slug})`
        : "";

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

  return jsonResp({
    ok: true,
    event_id: inserted?.id,
    matched_contact_id: contact?.id ?? null,
    high_intent: HIGH_INTENT.includes(body.type),
    notified,
    expanded,
    projects_appended: projectsAppended,
  });
});
