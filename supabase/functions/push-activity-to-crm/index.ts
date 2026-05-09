// Canonical Presale → CRM activity endpoint (NEW envelope).
// Envelope: { event_type, email, visitor_id?, source, payload, first_name?, phone?, occurred_at?, event_id? }
// Auth: shared secret via x-bridge-secret (BRIDGE_SECRET or PRESALE_BRIDGE_SECRET).
//
// Behavior + idempotency + lifecycle/lead create + behavior fan-out + hot rules
// + notifications all live in `_shared/presale-activity.ts`. This file just
// translates the new wire envelope into a NormalizedActivity and delegates.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireBridgeSecret } from "../_shared/inbound-auth.ts";
import { processPresaleActivity, type NormalizedActivity } from "../_shared/presale-activity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// event_type → canonical CRM activity type (UI maps icons off these)
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

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "method_not_allowed" }, 405);

  const authFail = requireBridgeSecret(req);
  if (authFail) return authFail;

  let body: any;
  try { body = await req.json(); } catch { return jsonResp({ error: "invalid_json" }, 400); }

  const rawEventType: string = body?.event_type ?? "";
  if (!rawEventType) return jsonResp({ error: "missing_event_type" }, 400);

  const emailRaw: string | undefined = body?.email;
  const email = typeof emailRaw === "string" && emailRaw.trim() ? emailRaw.trim().toLowerCase() : null;
  const visitorId: string | null = body?.visitor_id ?? null;
  const phone = typeof body?.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
  const payload: Record<string, any> = body?.payload ?? {};
  const source: string = body?.source ?? "presale_properties";
  const occurredAt: string = payload?.sent_at ?? body?.occurred_at ?? new Date().toISOString();
  const emailLogId: string | null = payload?.email_log_id ?? null;
  const eventId: string | null = body?.event_id ?? (emailLogId ? `${rawEventType}:${emailLogId}` : null);

  const normalized: NormalizedActivity = {
    type: mapEventType(rawEventType),
    raw_event_type: rawEventType,
    email,
    phone,
    visitor_id: visitorId,
    project_slug: payload?.project_slug ?? null,
    agent_slug: payload?.agent_slug ?? null,
    occurred_at: occurredAt,
    metadata: { ...payload, source },
    name_hint: body?.first_name ?? body?.name ?? null,
    event_id: eventId,
    email_log_id: emailLogId,
  };

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const result = await processPresaleActivity(supabase, normalized);
  if ("error" in result) return jsonResp({ error: result.error }, result.status);
  return jsonResp(result);
});
