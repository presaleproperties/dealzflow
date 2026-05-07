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

type EventType =
  | "email_open"
  | "link_click"
  | "deck_unlock"
  | "deck_section_view"
  | "page_view";

const HIGH_INTENT: EventType[] = ["email_open", "deck_unlock", "link_click"];

interface IncomingEvent {
  type: EventType;
  lead_email?: string;
  lead_phone?: string;
  project_slug?: string;
  agent_slug?: string;
  metadata?: Record<string, unknown>;
  occurred_at?: string;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  if (!body.lead_email && !body.lead_phone) {
    return jsonResp({ error: "missing_lead_identifier" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const email = body.lead_email?.trim().toLowerCase() ?? null;
  const phone = body.lead_phone?.trim() ?? null;
  const occurredAt = body.occurred_at ?? new Date().toISOString();

  // Find matching CRM contact by email first, then phone
  let contact:
    | {
        id: string;
        first_name: string | null;
        last_name: string | null;
        assigned_to: string | null;
      }
    | null = null;

  if (email) {
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
    return jsonResp({ error: insertErr.message }, 500);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Behavior batch fan-out: when Presale sends type="behavior_batch" with a
  // nested metadata.behavior payload, expand it into the four behavior tables
  // (forms, views, sessions, engagement) and refresh the lead's project list.
  // Without this the Timeline/Engage tabs never see new form submissions.
  // ─────────────────────────────────────────────────────────────────────────
  let expanded = { forms: 0, views: 0, sessions: 0, engagement: 0 };
  let projectsAppended: string[] = [];

  const meta: any = body.metadata ?? {};
  const behavior: any = meta?.behavior ?? null;
  const presaleUserId: string | null =
    meta?.presale_user_id ?? meta?.visitor_id ?? null;

  if (behavior && contact) {
    const cId = contact.id;

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
        return 0;
      }
      return data?.length ?? 0;
    }

    // Stable event_id per row so re-deliveries don't duplicate
    const stableId = (kind: string, key: string) =>
      `${cId}:${kind}:${key}`;

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
    if (newProjects.length) {
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
          // only set top-level project if blank, never overwrite manual edits
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
