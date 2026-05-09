// Unified inbound webhook for presaleproperties.com.
// Envelope: { type, occurred_at, idempotency_key, payload }
// Auth: x-presale-signature: sha256=<hex of raw body>
//   (falls back to x-bridge-secret for legacy callers)
//
// Supported types:
//   lead.created      → existing bridge-ingest-lead flow + honor assigned_agent_id
//   deck.viewed       → engagement row + activity event + maybe hot
//   booking.scheduled → showing row + status update + activity event
//   contract.signed   → status=Won + lead_value/won_at + activity event
//   task.claimed      → mark task claimed + activity event
//
// Every request lands in crm_inbound_events for dedupe + audit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyPresaleSignature } from "../_shared/hmac.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-presale-signature, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ----- helpers -----------------------------------------------------------

async function findContact(
  supabase: any,
  payload: any,
): Promise<{ id: string } | null> {
  const leadId = payload?.lead_id ?? payload?.crm_contact_id ?? null;
  if (leadId) {
    const { data } = await supabase
      .from("crm_contacts").select("id").eq("id", leadId).maybeSingle();
    if (data) return data;
  }
  const email = (payload?.email ?? "").toString().trim().toLowerCase();
  const phoneDigits = (payload?.phone ?? "").toString().replace(/\D/g, "");
  if (email) {
    const { data } = await supabase
      .from("crm_contacts").select("id").eq("email", email).limit(1).maybeSingle();
    if (data) return data;
  }
  if (phoneDigits) {
    const { data } = await supabase
      .from("crm_contacts").select("id")
      .or(`phone.eq.${phoneDigits},phone.eq.+${phoneDigits}`)
      .limit(1).maybeSingle();
    if (data) return data;
  }
  return null;
}

async function upsertMinimalContact(
  supabase: any,
  payload: any,
): Promise<string | null> {
  const found = await findContact(supabase, payload);
  if (found) return found.id;
  const email = (payload?.email ?? "").toString().trim().toLowerCase();
  const phone = (payload?.phone ?? "").toString().trim();
  if (!email && !phone) return null;
  const { data, error } = await supabase
    .from("crm_contacts").insert({
      first_name: payload?.first_name ?? "New",
      last_name: payload?.last_name ?? "Lead",
      email: email || null,
      phone: phone || null,
      source: "PresaleProperties.com",
      status: "New Lead",
      lead_type: "Pre-Sale",
      project: payload?.project_name ?? null,
      sync_source: "presale",
    }).select("id").single();
  if (error) {
    console.error("[presale-inbound] upsertMinimalContact error", error);
    return null;
  }
  return data.id;
}

async function emitActivityEvent(
  supabase: any,
  contactId: string | null,
  eventType: string,
  occurredAt: string,
  metadata: any,
) {
  if (!contactId) return;
  await supabase.from("crm_activity_events").insert({
    contact_id: contactId,
    event_type: eventType,
    source: "presale",
    occurred_at: occurredAt,
    metadata,
  }).then((r: any) => r.error && console.warn(
    "[presale-inbound] activity insert", r.error.message,
  ));
}

// ----- per-type handlers -------------------------------------------------

async function handleLeadCreated(supabase: any, payload: any) {
  // Delegate to existing bridge-ingest-lead. We pass the assigned_agent_id
  // through metadata + a derived agent_slug if we can resolve it.
  let agentSlug: string | null = payload?.agent_slug ?? null;
  if (!agentSlug && payload?.assigned_agent_id) {
    const { data: t } = await supabase.from("crm_team")
      .select("slug, display_name, email, presale_email")
      .eq("id", payload.assigned_agent_id).maybeSingle();
    if (t) {
      agentSlug = t.slug
        ?? (t.email ?? t.presale_email ?? "").split("@")[0]
        ?? (t.display_name ?? "").toLowerCase().replace(/\s+/g, "-");
    }
  }

  const url = `${SUPABASE_URL}/functions/v1/bridge-ingest-lead`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bridge-secret": Deno.env.get("BRIDGE_SECRET")
        ?? Deno.env.get("PRESALE_BRIDGE_SECRET") ?? "",
    },
    body: JSON.stringify({
      lead: {
        email: payload.email,
        first_name: payload.first_name,
        last_name: payload.last_name,
        phone: payload.phone,
        presale_user_id: payload.presale_user_id ?? payload.lead_id,
        project: payload.project_name,
        projects: payload.project_name ? [payload.project_name] : undefined,
        agent_slug: agentSlug ?? undefined,
        tags: payload.tags,
        metadata: { ...(payload.metadata ?? {}), utm: payload.utm,
                    assigned_agent_id: payload.assigned_agent_id ?? null },
        ...(payload.lead_source ? { source: payload.lead_source } : {}),
      },
    }),
  });
  const out = await r.json().catch(() => ({}));
  return { ok: r.ok, contact_id: out?.contact_id ?? null, delegated: out };
}

async function handleDeckViewed(supabase: any, payload: any, occurredAt: string) {
  const contactId = await upsertMinimalContact(supabase, payload);
  if (!contactId) return { ok: false, error: "no_contact_match" };

  await supabase.from("crm_lead_behavior_engagement").upsert({
    contact_id: contactId,
    email: (payload.email ?? "").toString().trim().toLowerCase() || null,
    presale_user_id: payload.presale_user_id ?? null,
    event_type: "deck_visit",
    link_url: payload.deck_url ?? null,
    occurred_at: occurredAt,
    metadata: {
      project_id: payload.project_id, project_name: payload.project_name,
      visit_number: payload.visit_number, utm: payload.utm,
      fbp: payload.fbp, fbc: payload.fbc,
    },
  }, { onConflict: "event_id", ignoreDuplicates: true });

  if ((payload.visit_number ?? 0) >= 2) {
    const { data: cur } = await supabase.from("crm_contacts")
      .select("tags, lead_tier").eq("id", contactId).maybeSingle();
    const tags = new Set<string>(cur?.tags ?? []);
    tags.add("hot");
    await supabase.from("crm_contacts").update({
      tags: Array.from(tags),
      lead_tier: cur?.lead_tier ?? "hot",
    }).eq("id", contactId);
  }

  await emitActivityEvent(supabase, contactId, "deck_viewed", occurredAt, payload);
  return { ok: true, contact_id: contactId };
}

async function handleBookingScheduled(supabase: any, payload: any, occurredAt: string) {
  const contactId = await upsertMinimalContact(supabase, payload);
  if (!contactId) return { ok: false, error: "no_contact_match" };

  await supabase.from("crm_showings").insert({
    contact_id: contactId,
    scheduled_at: payload.scheduled_at ?? occurredAt,
    showing_type: payload.appointment_type ?? "consultation",
    status: "scheduled",
    notes: payload.notes ?? null,
    project: payload.project_name ?? null,
  }).then((r: any) => r.error && console.warn(
    "[presale-inbound] showing insert", r.error.message,
  ));

  await supabase.from("crm_contacts").update({
    status: "Showing Booked",
    last_touch_at: occurredAt,
    last_touch_type: "booking_scheduled",
  }).eq("id", contactId);

  await emitActivityEvent(supabase, contactId, "booking_scheduled", occurredAt, payload);
  return { ok: true, contact_id: contactId };
}

async function handleContractSigned(supabase: any, payload: any, occurredAt: string) {
  const contactId = await upsertMinimalContact(supabase, payload);
  if (!contactId) return { ok: false, error: "no_contact_match" };

  await supabase.from("crm_contacts").update({
    status: "Won",
    lead_value: payload.value ?? null,
    lead_currency: payload.currency ?? "CAD",
    won_at: occurredAt,
    last_touch_at: occurredAt,
    last_touch_type: "contract_signed",
  }).eq("id", contactId);

  await emitActivityEvent(supabase, contactId, "contract_signed", occurredAt, payload);
  return { ok: true, contact_id: contactId };
}

async function handleTaskClaimed(supabase: any, payload: any, occurredAt: string) {
  // Inbound task.claimed = presale telling us another channel already claimed it.
  const { data: task } = await supabase.from("crm_tasks")
    .select("id, contact_id, status")
    .eq("presale_task_id", payload.task_id).maybeSingle();
  if (task && task.status !== "claimed") {
    await supabase.from("crm_tasks").update({
      status: "claimed",
      claimed_at: payload.claimed_at ?? occurredAt,
      ack_token: payload.ack_token ?? null,
    }).eq("id", task.id);
  }
  if (task?.contact_id) {
    await emitActivityEvent(supabase, task.contact_id, "task_claimed",
      occurredAt, payload);
  }
  return { ok: true, contact_id: task?.contact_id ?? null };
}

// ----- main --------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-presale-signature");
  const bridgeHeader = req.headers.get("x-bridge-secret");

  // Auth: HMAC preferred, x-bridge-secret accepted as legacy fallback
  let sigValid = false;
  if (sigHeader) sigValid = await verifyPresaleSignature(sigHeader, rawBody);
  const legacyOk = !!bridgeHeader && (
    bridgeHeader === Deno.env.get("BRIDGE_SECRET") ||
    bridgeHeader === Deno.env.get("PRESALE_BRIDGE_SECRET")
  );
  if (!sigValid && !legacyOk) return json({ error: "unauthorized" }, 401);

  let env: any;
  try { env = JSON.parse(rawBody); }
  catch { return json({ error: "invalid_json" }, 400); }

  const eventType = env?.type;
  const occurredAt = env?.occurred_at ?? new Date().toISOString();
  const idempotencyKey = env?.idempotency_key
    ?? `${eventType}:${occurredAt}:${crypto.randomUUID()}`;
  const payload = env?.payload ?? {};
  if (!eventType) return json({ error: "missing_type" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Idempotency: insert-first, dedupe on conflict
  const { error: dedupeErr } = await supabase.from("crm_inbound_events").insert({
    idempotency_key: idempotencyKey,
    event_type: eventType,
    payload: env,
    signature: sigHeader,
    signature_valid: sigValid,
    occurred_at: occurredAt,
    status: "received",
  });
  if (dedupeErr) {
    if ((dedupeErr as any).code === "23505") {
      return json({ ok: true, duplicate: true, idempotency_key: idempotencyKey });
    }
    console.error("[presale-inbound] dedupe insert error", dedupeErr);
  }

  try {
    let result: any;
    switch (eventType) {
      case "lead.created":      result = await handleLeadCreated(supabase, payload); break;
      case "deck.viewed":       result = await handleDeckViewed(supabase, payload, occurredAt); break;
      case "booking.scheduled": result = await handleBookingScheduled(supabase, payload, occurredAt); break;
      case "contract.signed":   result = await handleContractSigned(supabase, payload, occurredAt); break;
      case "task.claimed":      result = await handleTaskClaimed(supabase, payload, occurredAt); break;
      default:
        await supabase.from("crm_inbound_events")
          .update({ status: "unsupported", processed_at: new Date().toISOString() })
          .eq("idempotency_key", idempotencyKey);
        return json({ ok: false, error: "unsupported_type", type: eventType }, 200);
    }

    await supabase.from("crm_inbound_events").update({
      status: result?.ok ? "processed" : "error",
      contact_id: result?.contact_id ?? null,
      error: result?.ok ? null : (result?.error ?? "unknown"),
      processed_at: new Date().toISOString(),
    }).eq("idempotency_key", idempotencyKey);

    return json({ ok: !!result?.ok, type: eventType, ...result });
  } catch (err) {
    console.error("[presale-inbound]", err);
    await supabase.from("crm_inbound_events").update({
      status: "error", error: String(err),
      processed_at: new Date().toISOString(),
    }).eq("idempotency_key", idempotencyKey);
    return json({ error: String(err) }, 500);
  }
});
