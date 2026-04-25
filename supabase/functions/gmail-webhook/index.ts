// @ts-nocheck
// Gmail Pub/Sub webhook: receives push notifications when a watched mailbox changes.
// Pub/Sub POSTs: { message: { data: <base64-json>, ... } }
// data decodes to: { emailAddress, historyId }
//
// We look up which user owns that email and trigger an incremental sync.
//
// SECURITY: Pub/Sub adds a JWT in the Authorization header, signed by Google.
// For now we verify a shared secret in the URL (?token=) — set GMAIL_WEBHOOK_TOKEN.
// You can later add full JWT verification.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SHARED_TOKEN = Deno.env.get("GMAIL_WEBHOOK_TOKEN");

    // Verify shared secret
    if (SHARED_TOKEN) {
      const url = new URL(req.url);
      if (url.searchParams.get("token") !== SHARED_TOKEN) {
        return new Response("forbidden", { status: 403 });
      }
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
