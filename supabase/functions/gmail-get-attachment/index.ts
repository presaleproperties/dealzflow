// @ts-nocheck
// gmail-get-attachment: fetch a single Gmail attachment as base64 for download.
// Body: { gmail_message_id: string, attachment_id: string, filename?: string, mime?: string }
// Auth: user JWT (uses caller's stored Gmail tokens). Verifies user owns the message.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")!;
    const CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { gmail_message_id, attachment_id, filename, mime } = await req.json();
    if (!gmail_message_id || !attachment_id) {
      return json({ error: "gmail_message_id and attachment_id required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify the message belongs to a contact this user can see
    const { data: msg, error: msgErr } = await supabase
      .from("crm_gmail_messages")
      .select("id, user_id, gmail_message_id, attachment_meta")
      .eq("gmail_message_id", gmail_message_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (msgErr || !msg) return json({ error: "Message not found" }, 404);

    // Verify the attachment_id is one we know about (prevents arbitrary id fetching)
    const meta = (msg.attachment_meta as any[]) || [];
    const att = meta.find((a) => a.attachment_id === attachment_id);
    if (!att) return json({ error: "Attachment not found on message" }, 404);

    const accessToken = await getValidAccessToken(supabase, user.id, CLIENT_ID, CLIENT_SECRET);
    if (!accessToken) return json({ error: "No Gmail connection" }, 401);

    const url = `${GMAIL_API}/messages/${gmail_message_id}/attachments/${attachment_id}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const out = await res.json();
    if (!res.ok || !out.data) {
      console.error("Gmail attachment fetch failed", out);
      return json({ error: "Gmail fetch failed", details: out }, 500);
    }

    return json({
      filename: filename || att.filename,
      mime: mime || att.mime,
      size: out.size ?? att.size,
      data_base64url: out.data, // base64url-encoded; client converts
    });
  } catch (e) {
    console.error("gmail-get-attachment error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function getValidAccessToken(supabase: any, userId: string, clientId: string, clientSecret: string): Promise<string | null> {
  const { data: token } = await supabase.from("gmail_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (!token) return null;
  const expiresAt = new Date(token.token_expires_at).getTime();
  if (expiresAt > Date.now() + 5 * 60 * 1000) return token.access_token;
  const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const refreshed = await refreshRes.json();
  if (!refreshRes.ok || !refreshed.access_token) return null;
  const newExpiry = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();
  await supabase.from("gmail_tokens").update({
    access_token: refreshed.access_token,
    token_expires_at: newExpiry,
  }).eq("user_id", userId);
  return refreshed.access_token;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
