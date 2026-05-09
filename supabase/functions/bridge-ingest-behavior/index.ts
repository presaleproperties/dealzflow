// Bridge: Presale Properties → CRM behavior ingest
// Accepts batched events. Supports anonymous-only (presale_user_id) writes,
// stitches to a contact when email is provided, and idempotent via event_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireBridgeSecret } from "../_shared/inbound-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Accept both legacy + new event type names
type EventType =
  | "view" | "property_view"
  | "session"
  | "form"
  | "engagement";

interface IncomingEvent {
  event_id?: string;
  type: EventType;
  occurred_at?: string;
  // legacy nested shape: { data: {...} } or flat shape (fields at top level)
  data?: Record<string, any>;
  [k: string]: any;
}

interface IngestRequest {
  identity: { email?: string; presale_user_id?: string };
  events: IncomingEvent[];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickData(ev: IncomingEvent): Record<string, any> {
  // Allow either { data: {...} } or flat fields
  if (ev.data && typeof ev.data === "object") return ev.data;
  const { event_id, type, occurred_at, data, ...rest } = ev;
  return rest;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authFail = requireBridgeSecret(req);
    if (authFail) return authFail;

    let body: IngestRequest;
    try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

    const email = body?.identity?.email?.trim().toLowerCase() || null;
    const presaleUserId = body?.identity?.presale_user_id?.trim() || null;

    if (!presaleUserId) {
      return json({ error: "identity.presale_user_id required" }, 400);
    }
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return json({ error: "events[] required" }, 400);
    }
    if (body.events.length > 500) {
      return json({ error: "max 500 events per request" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve contact (priority: email → presale_user_id)
    let contactId: string | null = null;
    let stitchedNow = false;
    if (email) {
      const { data } = await supabase
        .from("crm_contacts")
        .select("id, presale_user_id")
        .eq("email", email)
        .maybeSingle();
      if (data) {
        contactId = data.id;
        // Backfill presale_user_id on contact for future lookups
        if (!data.presale_user_id) {
          await supabase.from("crm_contacts")
            .update({ presale_user_id: presaleUserId })
            .eq("id", data.id);
        }
      }
    }
    if (!contactId) {
      const { data } = await supabase
        .from("crm_contacts")
        .select("id")
        .eq("presale_user_id", presaleUserId)
        .maybeSingle();
      if (data) contactId = data.id;
    }

    // Stitch any prior anonymous rows for this presale_user_id → contact
    if (contactId) {
      const stitchTables = [
        "crm_lead_behavior_views",
        "crm_lead_behavior_sessions",
        "crm_lead_behavior_forms",
        "crm_lead_behavior_engagement",
      ];
      for (const t of stitchTables) {
        const { error } = await supabase
          .from(t)
          .update({ contact_id: contactId, ...(email ? { email } : {}) })
          .eq("presale_user_id", presaleUserId)
          .is("contact_id", null);
        if (error) console.warn(`[stitch] ${t}:`, error.message);
        else stitchedNow = true;
      }
    }

    const viewRows: any[] = [];
    const sessionRows: any[] = [];
    const formRows: any[] = [];
    const engagementRows: any[] = [];
    let skipped = 0;

    for (const ev of body.events) {
      if (!ev?.type) { skipped++; continue; }
      const occurredAt = ev.occurred_at || new Date().toISOString();
      const d = pickData(ev);
      const event_id = ev.event_id || d.event_id || crypto.randomUUID();

      switch (ev.type) {
        case "view":
        case "property_view":
          viewRows.push({
            event_id,
            contact_id: contactId,
            presale_user_id: presaleUserId,
            email,
            property_id: d.property_id ?? null,
            property_name: d.property_name ?? null,
            property_url: d.property_url ?? null,
            action: d.action || "view",
            duration_seconds: d.duration_seconds ?? 0,
            metadata: d.metadata ?? null,
            viewed_at: d.viewed_at || occurredAt,
          });
          break;
        case "session":
          sessionRows.push({
            event_id,
            contact_id: contactId,
            presale_user_id: presaleUserId,
            email,
            session_id: d.session_id ?? null,
            pages_viewed: d.pages_viewed ?? 0,
            duration_seconds: d.duration_seconds ?? 0,
            referrer: d.referrer ?? null,
            utm_source: d.utm_source ?? null,
            utm_medium: d.utm_medium ?? null,
            utm_campaign: d.utm_campaign ?? null,
            device_type: d.device_type ?? null,
            landing_page: d.landing_page ?? null,
            exit_page: d.exit_page ?? null,
            started_at: d.started_at || occurredAt,
            ended_at: d.ended_at ?? null,
          });
          break;
        case "form":
          formRows.push({
            event_id,
            contact_id: contactId,
            presale_user_id: presaleUserId,
            email,
            form_type: d.form_type || "unknown",
            form_name: d.form_name ?? null,
            status: d.status ?? null,
            property_id: d.property_id ?? null,
            property_name: d.property_name ?? null,
            payload: d.payload ?? d ?? null,
            funnel_step: d.funnel_step ?? null,
            funnel_total_steps: d.funnel_total_steps ?? null,
            submitted_at: d.submitted_at || occurredAt,
          });
          break;
        case "engagement":
          engagementRows.push({
            event_id,
            contact_id: contactId,
            presale_user_id: presaleUserId,
            email,
            event_type: d.event_type || "unknown",
            campaign_id: d.campaign_id ?? null,
            campaign_name: d.campaign_name ?? null,
            template_id: d.template_id ?? null,
            template_name: d.template_name ?? null,
            link_url: d.link_url ?? null,
            metadata: d.metadata ?? null,
            occurred_at: d.occurred_at || occurredAt,
          });
          break;
        default:
          skipped++;
      }
    }

    async function bulkInsert(table: string, rows: any[]): Promise<number> {
      if (!rows.length) return 0;
      const { data, error } = await supabase
        .from(table)
        .upsert(rows, { onConflict: "event_id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        console.error(`[bridge-ingest-behavior] ${table}:`, error.message);
        return 0;
      }
      return data?.length ?? 0;
    }

    const [v, s, f, e] = await Promise.all([
      bulkInsert("crm_lead_behavior_views", viewRows),
      bulkInsert("crm_lead_behavior_sessions", sessionRows),
      bulkInsert("crm_lead_behavior_forms", formRows),
      bulkInsert("crm_lead_behavior_engagement", engagementRows),
    ]);

    return json({
      matched_contact_id: contactId,
      stitched: stitchedNow,
      inserted: { views: v, sessions: s, forms: f, engagement: e },
      skipped,
      reason: contactId ? null : "anonymous_stored",
    });
  } catch (err) {
    console.error("[bridge-ingest-behavior]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
