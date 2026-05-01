// Cron/worker: drains crm_email_schedule and sends with retry safety.
// Agent-owned sends prefer the agent's connected Gmail. If Gmail is unavailable
// or temporarily fails, the worker falls back to the Presale bridge and keeps
// retrying transient failures instead of surfacing brittle compose errors.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const PRESALE_FUNCTIONS_URL = "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BATCH_SIZE = 25;

type SendResult = { ok: true; provider: "gmail" | "presale"; messageId?: string | null; detail?: string } | { ok: false; provider: "gmail" | "presale" | "none"; error: string; retryable: boolean };

function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret") || "";
  if (cronSecret && provided && provided === cronSecret) return true;

  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || "";
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const apikey = req.headers.get("apikey") || "";
    if (token && (token === anon || token === svc || token === apikey)) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const nowIso = new Date().toISOString();
    const staleIso = new Date(Date.now() - 10 * 60_000).toISOString();

    const { data: due, error: fetchErr } = await supabase
      .from("crm_email_schedule")
      .select("*")
      .or(`and(status.eq.pending,send_at.lte.${nowIso}),and(status.eq.processing,last_attempt_at.lte.${staleIso})`)
      .order("send_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!due || due.length === 0) return json({ processed: 0 }, 200);

    let sent = 0;
    let retried = 0;
    let failed = 0;

    for (const row of due) {
      const attempt = Number(row.attempt_count ?? 0) + 1;
      const { error: lockErr } = await supabase
        .from("crm_email_schedule")
        .update({ status: "processing", attempt_count: attempt, last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .in("status", ["pending", "processing"]);
      if (lockErr) continue;

      const result = await sendQueuedEmail(supabase, row);

      if (result.ok) {
        await supabase.from("crm_email_schedule").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: result.detail ?? null,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);

        if (row.contact_id) {
          try {
            await supabase.from("crm_email_log").insert({
              contact_id: row.contact_id,
              user_id: row.created_by,
              direction: "outbound",
              subject: row.subject,
              body: row.body_html,
              cc: row.cc,
              bcc: row.bcc,
              gmail_message_id: result.provider === "gmail" ? result.messageId ?? null : null,
              sent_at: new Date().toISOString(),
            });
          } catch (logErr) {
            console.warn("crm_email_log insert failed", logErr);
          }
        }
        sent++;
        continue;
      }

      const maxAttempts = Number(row.max_attempts ?? 5);
      if (result.retryable && attempt < maxAttempts) {
        const delayMs = Math.min(30 * 60_000, 2 ** Math.max(0, attempt - 1) * 60_000);
        await supabase.from("crm_email_schedule").update({
          status: "pending",
          send_at: new Date(Date.now() + delayMs).toISOString(),
          error_message: result.error.slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        retried++;
      } else {
        await supabase.from("crm_email_schedule").update({
          status: "failed",
          error_message: result.error.slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        failed++;
      }
    }

    return json({ processed: due.length, sent, retried, failed }, 200);
  } catch (e) {
    console.error("process-scheduled-emails error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});

async function sendQueuedEmail(supabase: any, row: any): Promise<SendResult> {
  const gmail = await sendViaAgentGmail(supabase, row);
  if (gmail.ok) return gmail;

  const presale = await sendViaPresale(row);
  if (presale.ok) {
    return gmail.provider === "gmail"
      ? { ...presale, detail: `Agent Gmail unavailable; fallback used. ${gmail.error}` }
      : presale;
  }

  return presale.retryable ? presale : { ...presale, retryable: gmail.retryable || presale.retryable };
}

async function sendViaAgentGmail(supabase: any, row: any): Promise<SendResult> {
  try {
    const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
    if (!clientId || !clientSecret) return { ok: false, provider: "none", error: "Google credentials not configured", retryable: false };

    const accessToken = await getValidAccessToken(supabase, row.created_by, clientId, clientSecret);
    if (!accessToken) return { ok: false, provider: "none", error: "No connected Gmail mailbox", retryable: false };

    const [{ data: tokenRow }, { data: settingsRow }, { data: teamRow }] = await Promise.all([
      supabase.from("gmail_tokens").select("gmail_email").eq("user_id", row.created_by).maybeSingle(),
      supabase.from("crm_email_settings").select("sender_name,reply_to").eq("user_id", row.created_by).maybeSingle(),
      supabase.from("crm_team").select("display_name,email").eq("user_id", row.created_by).maybeSingle(),
    ]);

    const fromEmail = tokenRow?.gmail_email ?? teamRow?.email ?? "";
    if (!fromEmail) return { ok: false, provider: "none", error: "No sender email found", retryable: false };

    const displayName = (settingsRow?.sender_name ?? teamRow?.display_name ?? "").replace(/[<>"\\]/g, "").trim();
    const fromHeader = displayName ? `${displayName} <${fromEmail}>` : fromEmail;
    const replyTo = (settingsRow?.reply_to ?? "").trim();
    const recipients = Array.isArray(row.to_emails) ? row.to_emails.filter(Boolean) : [row.to_emails].filter(Boolean);
    let lastMessageId: string | null = null;

    for (const recipient of recipients) {
      const headers = [
        `From: ${fromHeader}`,
        `To: ${recipient}`,
        ...(row.cc ? [`Cc: ${row.cc}`] : []),
        ...(row.bcc ? [`Bcc: ${row.bcc}`] : []),
        `Subject: ${row.subject ?? "(no subject)"}`,
        ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
        "MIME-Version: 1.0",
        'Content-Type: text/html; charset="UTF-8"',
      ];
      const raw = headers.join("\r\n") + "\r\n\r\n" + row.body_html;
      const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: base64Url(raw) }),
      });
      const sent = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) {
        const msg = sent?.error?.message ?? sent?.message ?? `Gmail returned ${sendRes.status}`;
        return { ok: false, provider: "gmail", error: msg, retryable: sendRes.status === 429 || sendRes.status >= 500 };
      }
      lastMessageId = sent.id ?? null;
    }

    return { ok: true, provider: "gmail", messageId: lastMessageId };
  } catch (e) {
    return { ok: false, provider: "gmail", error: e instanceof Error ? e.message : String(e), retryable: true };
  }
}

async function sendViaPresale(row: any): Promise<SendResult> {
  const bridgeSecret = Deno.env.get("PRESALE_BRIDGE_SECRET") ?? Deno.env.get("BRIDGE_SECRET");
  const presaleAnonKey = Deno.env.get("PRESALE_ANON_KEY");
  if (!bridgeSecret || !presaleAnonKey) return { ok: false, provider: "presale", error: "Presale bridge is not configured", retryable: false };

  try {
    const upstream = await fetch(`${PRESALE_FUNCTIONS_URL}/bridge-send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-secret": bridgeSecret,
        Authorization: `Bearer ${presaleAnonKey}`,
        apikey: presaleAnonKey,
      },
      body: JSON.stringify({
        to: row.to_emails,
        cc: row.cc,
        bcc: row.bcc,
        subject: row.subject,
        html: row.body_html,
        template_id: row.template_id,
        source: "dealzflow_crm_queue",
      }),
    });
    const text = await upstream.text();
    let upstreamJson: any = {};
    try { upstreamJson = JSON.parse(text); } catch { /* ignore */ }
    if (!upstream.ok) {
      const errorText = upstreamJson?.error ?? (text.slice(0, 500) || `Presale bridge returned ${upstream.status}`);
      return { ok: false, provider: "presale", error: errorText, retryable: upstream.status === 429 || upstream.status >= 500 };
    }
    return { ok: true, provider: "presale" };
  } catch (e) {
    return { ok: false, provider: "presale", error: e instanceof Error ? e.message : String(e), retryable: true };
  }
}

async function getValidAccessToken(supabase: any, userId: string, clientId: string, clientSecret: string): Promise<string | null> {
  const { data: token } = await supabase.from("gmail_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (!token) return null;
  if (new Date(token.token_expires_at).getTime() > Date.now() + 5 * 60_000) return token.access_token;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const refreshed = await res.json().catch(() => ({}));
  if (!res.ok || !refreshed.access_token) return null;

  await supabase.from("gmail_tokens").update({
    access_token: refreshed.access_token,
    token_expires_at: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
  }).eq("user_id", userId);
  return refreshed.access_token;
}

function base64Url(value: string): string {
  return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
