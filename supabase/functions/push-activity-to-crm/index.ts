// Webhook receiver for Presale Properties activity events using the spec'd
// envelope: { event_type, email, visitor_id?, source, payload, first_name?, phone? }.
// Auth: shared BRIDGE_SECRET via x-bridge-secret header.
// Behavior:
//   • Always create-or-get contact by email (case-insensitive).
//   • Append a crm_activity_events row, idempotent by payload.email_log_id.
//   • Bump last_activity_at on the contact.
// Mirrors auth + identity rules used by receive-presale-activity.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireBridgeSecret } from "../_shared/inbound-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// BRIDGE_SECRET / PRESALE_BRIDGE_SECRET checked via _shared/inbound-auth

const INTERNAL_EMAILS = new Set([
  "info@presaleproperties.com",
  "admin@presaleproperties.com",
  "noreply@presaleproperties.com",
  "no-reply@presaleproperties.com",
]);

// event_type → CRM activity type (kept namespaced; UI maps icons off these)
function mapEventType(raw: string): string {
  const v = (raw ?? "").toLowerCase();
  switch (v) {
    case "email.sent": return "email_sent";
    case "email.auto_response_sent": return "email_auto_response_sent";
    case "email.opened": return "email.opened";
    case "email.clicked": return "email.clicked";
    case "vip_registration": return "vip_registration";
    default: return v || "presale_event";
  }
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

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function pickFallbackAssignee(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from("crm_team")
    .select("display_name, role")
    .eq("is_active", true)
    .in("role", ["agent", "admin", "owner"]);
  return (data ?? []).map((a: any) => a.display_name).filter(Boolean)[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "method_not_allowed" }, 405);

  const authFail = requireBridgeSecret(req);
  if (authFail) return authFail;

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: "invalid_json" }, 400); }

  const eventType: string = body?.event_type ?? "";
  const emailRaw: string | undefined = body?.email;
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";
  const visitorId: string | null = body?.visitor_id ?? null;
  const source: string = body?.source ?? "presale_properties";
  const payload: Record<string, any> = body?.payload ?? {};

  if (!eventType) return jsonResp({ error: "missing_event_type" }, 400);
  if (!email && !visitorId) return jsonResp({ error: "missing_identity" }, 400);

  if (email && INTERNAL_EMAILS.has(email)) {
    return jsonResp({ ok: true, skipped: "internal_email" });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const occurredAt: string = payload?.sent_at ?? body?.occurred_at ?? new Date().toISOString();
  const emailLogId: string | null = payload?.email_log_id ?? null;
  const eventId: string | null = body?.event_id ?? (emailLogId ? `${eventType}:${emailLogId}` : null);
  const mappedType = mapEventType(eventType);

  // ── Idempotency: if we've already stored this email_log_id / event_id, exit ──
  if (emailLogId || eventId) {
    const { data: dupe } = await supabase
      .from("crm_activity_events")
      .select("id")
      .or([
        emailLogId ? `metadata->>email_log_id.eq.${emailLogId}` : null,
        eventId ? `metadata->>event_id.eq.${eventId}` : null,
      ].filter(Boolean).join(","))
      .limit(1)
      .maybeSingle();
    if (dupe?.id) return jsonResp({ ok: true, deduped: true, activity_id: dupe.id });
  }

  // ── Resolve or create contact ──
  let contact: { id: string; assigned_to: string | null } | null = null;

  if (email) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, assigned_to")
      .ilike("email", email)
      .maybeSingle();
    if (data) contact = data as typeof contact;
  }
  if (!contact && visitorId) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, assigned_to")
      .eq("presale_user_id", visitorId)
      .maybeSingle();
    if (data) contact = data as typeof contact;
  }

  if (!contact && email) {
    const { first_name, last_name } = splitName(body?.first_name ?? body?.name);
    const assignee = await pickFallbackAssignee(supabase);
    const tags = ["presale-website"];
    if (eventType === "vip_registration") tags.push("vip");
    const { data: created, error: createErr } = await supabase
      .from("crm_contacts")
      .insert({
        first_name,
        last_name,
        email,
        phone: typeof body?.phone === "string" ? body.phone : null,
        presale_user_id: visitorId,
        source: "PresaleProperties.com",
        status: "New Lead",
        lead_type: "Pre-Sale",
        tags,
        assigned_to: assignee,
        sync_source: "presale",
        last_activity_at: occurredAt,
        ai_summary_stale: true,
        notes: `[Presale ${eventType} @ ${occurredAt}] auto-created from activity webhook`,
      })
      .select("id, assigned_to")
      .single();
    if (createErr) return jsonResp({ error: `contact_create_failed: ${createErr.message}` }, 500);
    contact = created as typeof contact;
  }

  // Backfill presale_user_id when stitched via email
  if (contact && visitorId) {
    await supabase
      .from("crm_contacts")
      .update({ presale_user_id: visitorId })
      .eq("id", contact.id)
      .is("presale_user_id", null);
  }

  // ── Insert activity (always) ──
  const metadata: Record<string, any> = {
    ...payload,
    source,
    event_type: eventType,
  };
  if (eventId) metadata.event_id = eventId;
  if (emailLogId) metadata.email_log_id = emailLogId;
  if (payload?.tracking_id) metadata.tracking_id = payload.tracking_id;
  if (payload?.subject) metadata.subject = payload.subject;
  if (payload?.template_type) metadata.template_type = payload.template_type;

  const { data: inserted, error: insertErr } = await supabase
    .from("crm_activity_events")
    .insert({
      type: mappedType,
      lead_email: email || null,
      lead_phone: typeof body?.phone === "string" ? body.phone : null,
      contact_id: contact?.id ?? null,
      project_slug: payload?.project_slug ?? null,
      agent_slug: payload?.agent_slug ?? null,
      metadata,
      occurred_at: occurredAt,
    })
    .select("id")
    .single();

  if (insertErr) return jsonResp({ error: `activity_insert_failed: ${insertErr.message}` }, 500);

  if (contact) {
    await supabase
      .from("crm_contacts")
      .update({ last_activity_at: occurredAt })
      .eq("id", contact.id);
  }

  return jsonResp({
    ok: true,
    activity_id: inserted?.id,
    contact_id: contact?.id ?? null,
    matched: !!contact,
  });
});
