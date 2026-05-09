// LEGACY Presale → CRM activity endpoint.
// Envelope: { type, lead_email?, lead_phone?, project_slug?, agent_slug?, metadata?, occurred_at? }
// where metadata may contain `behavior` (form/view/session/engagement batch),
// `presale_user_id` / `visitor_id`, and free-form fields.
//
// This endpoint is kept as a backwards-compatible shim that translates the
// legacy envelope to the canonical NormalizedActivity and delegates to
// `_shared/presale-activity.ts`. Presale Properties should migrate sends to
// `/push-activity-to-crm` (new envelope) — both code paths are now identical.

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

  if (!body?.type) return jsonResp({ error: "missing_type" }, 400);

  const meta: any = body.metadata ?? {};
  const email = typeof body.lead_email === "string" && body.lead_email.trim()
    ? body.lead_email.trim().toLowerCase()
    : null;
  const phone = typeof body.lead_phone === "string" && body.lead_phone.trim()
    ? body.lead_phone.trim()
    : null;
  const visitorId: string | null = meta?.presale_user_id ?? meta?.visitor_id ?? null;
  const occurredAt: string = body.occurred_at ?? new Date().toISOString();
  // Legacy callers don't send a top-level event_id; mine metadata for
  // the same idempotency keys the new envelope provides.
  const eventId: string | null = meta?.event_id ?? null;
  const emailLogId: string | null = meta?.email_log_id ?? null;

  const normalized: NormalizedActivity = {
    type: body.type,
    raw_event_type: body.type,
    email,
    phone,
    visitor_id: visitorId,
    project_slug: body.project_slug ?? null,
    agent_slug: body.agent_slug ?? null,
    occurred_at: occurredAt,
    metadata: meta,
    name_hint: meta.name ?? meta.full_name ?? null,
    event_id: eventId,
    email_log_id: emailLogId,
  };

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const result = await processPresaleActivity(supabase, normalized);
  if ("error" in result) return jsonResp({ error: result.error }, result.status);
  return jsonResp(result);
});
