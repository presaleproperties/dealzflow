// Bridge endpoint: Presale Properties → CRM behavior ingest
// Accepts batched page/project/email events and writes them into the
// crm_lead_behavior_* tables. Idempotent via per-event `event_id`.
//
// Auth: shared `x-bridge-secret` header (same secret used by bridge-ingest-lead).
//
// Body shape:
// {
//   identity: { email?: string, presale_user_id?: string },   // at least one required
//   events: Array<{
//     event_id: string,            // stable id from presale (e.g. client_activity.id)
//     type: 'view' | 'session' | 'form' | 'engagement',
//     occurred_at?: string,        // ISO timestamp; defaults to now
//     data: { ...type-specific fields }
//   }>
// }
//
// Returns: { matched_contact_id, inserted: { views, sessions, forms, engagement }, skipped: number }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EventType = "view" | "session" | "form" | "engagement";

interface IncomingEvent {
  event_id: string;
  type: EventType;
  occurred_at?: string;
  data: Record<string, any>;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth
    const secret = req.headers.get("x-bridge-secret");
    if (!secret || secret !== Deno.env.get("BRIDGE_SECRET")) {
      return json({ error: "unauthorized" }, 401);
    }

    // Parse + validate
    let body: IngestRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const email = body?.identity?.email?.trim().toLowerCase() || null;
    const presaleUserId = body?.identity?.presale_user_id?.trim() || null;
    if (!email && !presaleUserId) {
      return json({ error: "identity.email or identity.presale_user_id required" }, 400);
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

    // Resolve contact: presale_user_id first, then email
    let contact: { id: string; presale_user_id: string | null } | null = null;
    if (presaleUserId) {
      const { data } = await supabase
        .from("crm_contacts")
        .select("id, presale_user_id")
        .eq("presale_user_id", presaleUserId)
        .maybeSingle();
      contact = data;
    }
    if (!contact && email) {
      const { data } = await supabase
        .from("crm_contacts")
        .select("id, presale_user_id")
        .eq("email", email)
        .maybeSingle();
      contact = data;
      // Backfill presale_user_id for future lookups
      if (contact && presaleUserId && !contact.presale_user_id) {
        await supabase
          .from("crm_contacts")
          .update({ presale_user_id: presaleUserId })
          .eq("id", contact.id);
      }
    }

    if (!contact) {
      // No matching CRM contact — accept silently so caller doesn't retry forever
      return json({
        matched_contact_id: null,
        inserted: { views: 0, sessions: 0, forms: 0, engagement: 0 },
        skipped: body.events.length,
        reason: "contact_not_found",
      });
    }

    const contactId = contact.id;

    // Bucket events by type and shape rows
    const viewRows: any[] = [];
    const sessionRows: any[] = [];
    const formRows: any[] = [];
    const engagementRows: any[] = [];
    let skipped = 0;

    for (const ev of body.events) {
      if (!ev?.event_id || !ev?.type || !ev?.data) {
        skipped++;
        continue;
      }
      const occurredAt = ev.occurred_at || new Date().toISOString();
      const d = ev.data || {};

      switch (ev.type) {
        case "view":
          viewRows.push({
            event_id: ev.event_id,
            contact_id: contactId,
            presale_user_id: presaleUserId,
            email,
            property_id: d.property_id ?? null,
            property_name: d.property_name ?? null,
            property_url: d.property_url ?? null,
            action: d.action || "view",
            duration_seconds: d.duration_seconds ?? 0,
            metadata: d.metadata ?? null,
            viewed_at: occurredAt,
          });
          break;
        case "session":
          sessionRows.push({
            event_id: ev.event_id,
            contact_id: contactId,
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
            started_at: occurredAt,
            ended_at: d.ended_at ?? null,
          });
          break;
        case "form":
          formRows.push({
            event_id: ev.event_id,
            contact_id: contactId,
            email,
            form_type: d.form_type || "unknown",
            form_name: d.form_name ?? null,
            property_id: d.property_id ?? null,
            property_name: d.property_name ?? null,
            payload: d.payload ?? null,
            funnel_step: d.funnel_step ?? null,
            funnel_total_steps: d.funnel_total_steps ?? null,
            submitted_at: occurredAt,
          });
          break;
        case "engagement":
          engagementRows.push({
            event_id: ev.event_id,
            contact_id: contactId,
            email,
            event_type: d.event_type || "unknown",
            campaign_id: d.campaign_id ?? null,
            campaign_name: d.campaign_name ?? null,
            template_id: d.template_id ?? null,
            template_name: d.template_name ?? null,
            link_url: d.link_url ?? null,
            metadata: d.metadata ?? null,
            occurred_at: occurredAt,
          });
          break;
        default:
          skipped++;
      }
    }

    // Insert with idempotency (ignore duplicates on event_id)
    async function bulkInsert(table: string, rows: any[]): Promise<number> {
      if (!rows.length) return 0;
      const { data, error } = await supabase
        .from(table)
        .upsert(rows, { onConflict: "event_id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        console.error(`[bridge-ingest-behavior] ${table} insert error:`, error.message);
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
      inserted: { views: v, sessions: s, forms: f, engagement: e },
      skipped,
    });
  } catch (err) {
    console.error("[bridge-ingest-behavior] error", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
