// @ts-nocheck
// Gmail Pub/Sub webhook: receives push notifications when a watched mailbox changes.
// Pub/Sub POSTs: { message: { data: <base64-json>, ... } }
// data decodes to: { emailAddress, historyId }
//
// SECURITY (defense in depth — order of checks):
//   1. If GMAIL_PUBSUB_AUDIENCE is set, verify the OIDC JWT in the
//      Authorization header against Google's JWKS, check `aud`, and
//      (optionally) check `email` matches GMAIL_PUBSUB_SA_EMAIL.
//   2. If GMAIL_WEBHOOK_TOKEN is set, also accept a matching ?token=
//      query param (legacy fallback).
//   3. If neither secret is configured, reject with 401.
//
// Configure your Pub/Sub push subscription with an OIDC token using the
// service account email of your choice and an audience matching the
// function URL — that is what we verify here.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyGoogleOidcJwt } from "../_shared/googleOidc.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SHARED_TOKEN = Deno.env.get("GMAIL_WEBHOOK_TOKEN");
    const PUBSUB_AUDIENCE = Deno.env.get("GMAIL_PUBSUB_AUDIENCE"); // e.g. https://<ref>.supabase.co/functions/v1/gmail-webhook
    const PUBSUB_SA_EMAIL = Deno.env.get("GMAIL_PUBSUB_SA_EMAIL"); // optional pin

    // ── Auth: OIDC first, then shared-secret fallback ──────────────────
    let authed = false;

    if (PUBSUB_AUDIENCE) {
      try {
        await verifyGoogleOidcJwt(req.headers.get("authorization"), {
          audience: PUBSUB_AUDIENCE,
          expectedEmail: PUBSUB_SA_EMAIL || undefined,
        });
        authed = true;
      } catch (e) {
        console.warn("[gmail-webhook] OIDC verify failed:", (e as Error).message);
      }
    }

    if (!authed && SHARED_TOKEN) {
      const url = new URL(req.url);
      if (url.searchParams.get("token") === SHARED_TOKEN) {
        authed = true;
      }
    }

    if (!authed) {
      // If neither check passed and at least one was configured, reject.
      if (PUBSUB_AUDIENCE || SHARED_TOKEN) {
        return new Response("forbidden", { status: 403 });
      }
      // Nothing configured — refuse rather than accept anonymous webhooks.
      return new Response("webhook auth not configured", { status: 401 });
    }

    const body = await req.json();
    const data = body?.message?.data;
    if (!data) return new Response("ok", { status: 200 });

    const decoded = JSON.parse(atob(data));
    const { emailAddress, historyId } = decoded;
    if (!emailAddress) return new Response("ok", { status: 200 });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: tokenRow } = await supabase
      .from("gmail_tokens")
      .select("user_id")
      .eq("gmail_email", emailAddress)
      .maybeSingle();

    if (!tokenRow) {
      console.log(`[gmail-webhook] no user for ${emailAddress}`);
      return new Response("ok", { status: 200 });
    }

    // Trigger incremental sync (fire and forget)
    fetch(`${SUPABASE_URL}/functions/v1/gmail-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ user_id: tokenRow.user_id, history_id: historyId }),
    }).catch(e => console.error("sync trigger failed:", e));

    // ACK Pub/Sub immediately (must respond <10s)
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("gmail-webhook error:", e);
    return new Response("ok", { status: 200 }); // never NACK — Pub/Sub will retry forever
  }
});
