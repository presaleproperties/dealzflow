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

  // Update last_activity_at on the contact (NOT last_touch_at — that's
  // reserved for human actions per the last-touch rule).
  if (contact) {
    await supabase
      .from("crm_contacts")
      .update({ last_activity_at: occurredAt })
      .eq("id", contact.id);
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
  });
});
