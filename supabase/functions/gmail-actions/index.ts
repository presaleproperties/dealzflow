// @ts-nocheck
// Gmail mutations: mark read/unread, archive, send reply, watch (Pub/Sub).
// Body: { action: "mark_read" | "mark_unread" | "archive" | "send_reply" | "watch" | "stop_watch" | "sync_now", ... }
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
    const CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")!;
    const CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")!;
    const PUBSUB_TOPIC = Deno.env.get("GMAIL_PUBSUB_TOPIC") ?? ""; // optional

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const userId = user.id;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const accessToken = await getValidAccessToken(supabase, userId, CLIENT_ID, CLIENT_SECRET);
    if (!accessToken) return json({ error: "No Gmail connection" }, 401);

    const body = await req.json();
    const action = body.action;

    // ── sync now ──────────────────────────────────────────────────────
    if (action === "sync_now") {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/gmail-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ user_id: userId, full: body.full === true }),
      });
      const data = await r.json();
      return json(data, r.status);
    }

    // ── mark_read / mark_unread (per gmail_message_id or thread_id) ───
    if (action === "mark_read" || action === "mark_unread") {
      const ids: string[] = body.gmail_message_ids ?? [];
      const threadDbId: string | null = body.thread_db_id ?? null;
      let targets: { gmail_message_id: string }[] = ids.map(id => ({ gmail_message_id: id }));

      if (threadDbId) {
        const { data } = await supabase
          .from("crm_gmail_messages")
          .select("gmail_message_id")
          .eq("user_id", userId)
          .eq("thread_id", threadDbId)
          .eq("direction", "inbound");
        targets = data ?? [];
      }

      for (const t of targets) {
        await fetch(`${GMAIL_API}/messages/${t.gmail_message_id}/modify`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            action === "mark_read"
              ? { removeLabelIds: ["UNREAD"] }
              : { addLabelIds: ["UNREAD"] },
          ),
        });
      }

      // Update DB
      await supabase
        .from("crm_gmail_messages")
        .update({ is_read: action === "mark_read" })
        .eq("user_id", userId)
        .in("gmail_message_id", targets.map(t => t.gmail_message_id));

      return json({ ok: true, count: targets.length });
    }

    // ── archive (remove INBOX label) ──────────────────────────────────
    if (action === "archive") {
      const ids: string[] = body.gmail_message_ids ?? [];
      for (const id of ids) {
        await fetch(`${GMAIL_API}/messages/${id}/modify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
        });
      }
      // mirror in DB
      await supabase
        .from("crm_gmail_messages")
        .update({ labels: [] }) // simplified; sync will refresh
        .eq("user_id", userId)
        .in("gmail_message_id", ids);
      // Mark thread archived if all msgs were inbox
      if (body.thread_db_id) {
        await supabase
          .from("crm_email_threads")
          .update({ is_archived: true })
          .eq("id", body.thread_db_id)
          .eq("user_id", userId);
      }
      return json({ ok: true });
    }

    // ── send reply ────────────────────────────────────────────────────
    if (action === "send_reply") {
      const { thread_db_id, to, subject, body_html, body_text, in_reply_to, references, contact_id, reply_to_override } = body;
      if (!to || (!body_html && !body_text)) return json({ error: "to + body required" }, 400);

      // Fetch the sender's email + thread for proper threading.
      // Also pull display name + reply-to from crm_email_settings so the
      // recipient sees "Sarb Grewal <sarb@…>" instead of a bare address.
      const [{ data: tokenRow }, { data: settingsRow }, { data: teamRow }] = await Promise.all([
        supabase.from("gmail_tokens").select("gmail_email").eq("user_id", userId).maybeSingle(),
        supabase.from("crm_email_settings").select("sender_name,reply_to").eq("user_id", userId).maybeSingle(),
        supabase.from("crm_team").select("display_name,email").eq("user_id", userId).maybeSingle(),
      ]);
      const fromEmail = tokenRow?.gmail_email ?? teamRow?.email ?? user.email ?? "";
      if (!fromEmail) {
        return json({ error: "No connected Gmail mailbox. Reconnect inbox in Settings → Email." }, 400);
      }
      const displayName = (settingsRow?.sender_name ?? teamRow?.display_name ?? "").replace(/[<>"\\]/g, "").trim();
      // RFC 2047 "encoded-word" for any header value containing non-ASCII.
      // Without this, em-dashes / smart quotes / accents render as
      // mojibake (Ã¢Â€Â) in Gmail, Outlook, Apple Mail.
      const encodeHeader = (value: string): string => {
        if (!value) return value;
        // eslint-disable-next-line no-control-regex
        if (!/[^\x00-\x7F]/.test(value)) return value;
        const b64 = btoa(unescape(encodeURIComponent(value)));
        return `=?UTF-8?B?${b64}?=`;
      };
      const encodeFromHeader = (name: string, email: string): string => {
        if (!name) return email;
        return `${encodeHeader(name)} <${email}>`;
      };
      const fromHeader = encodeFromHeader(displayName, fromEmail);
      // Reply-To priority: explicit override (Send Project) > settings.reply_to.
      const replyTo = (reply_to_override ?? settingsRow?.reply_to ?? "").toString().trim();

      let gmailThreadId: string | null = null;
      if (thread_db_id) {
        const { data: thread } = await supabase
          .from("crm_email_threads")
          .select("gmail_thread_id")
          .eq("id", thread_db_id)
          .single();
        gmailThreadId = thread?.gmail_thread_id ?? null;
      }

      const headers = [
        `From: ${fromHeader}`,
        `To: ${to}`,
        `Subject: ${encodeHeader(subject ?? "(no subject)")}`,
      ];
      if (replyTo) headers.push(`Reply-To: ${replyTo}`);
      if (in_reply_to) {
        headers.push(`In-Reply-To: ${in_reply_to}`);
        headers.push(`References: ${references ?? in_reply_to}`);
      }
      headers.push("MIME-Version: 1.0");

      let raw: string;
      if (body_html && body_text) {
        // Multipart/alternative: text first, then HTML — much better
        // deliverability and Apple Mail privacy preview accuracy.
        const boundary = `bnd_${crypto.randomUUID().replace(/-/g, "")}`;
        headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
        const parts = [
          `--${boundary}`,
          'Content-Type: text/plain; charset="UTF-8"',
          'Content-Transfer-Encoding: 8bit',
          '',
          body_text,
          `--${boundary}`,
          'Content-Type: text/html; charset="UTF-8"',
          'Content-Transfer-Encoding: 8bit',
          '',
          body_html,
          `--${boundary}--`,
          '',
        ].join("\r\n");
        raw = headers.join("\r\n") + "\r\n\r\n" + parts;
      } else if (body_html) {
        headers.push('Content-Type: text/html; charset="UTF-8"');
        raw = headers.join("\r\n") + "\r\n\r\n" + body_html;
      } else {
        headers.push('Content-Type: text/plain; charset="UTF-8"');
        raw = headers.join("\r\n") + "\r\n\r\n" + body_text;
      }
      const encoded = btoa(unescape(encodeURIComponent(raw)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          raw: encoded,
          ...(gmailThreadId ? { threadId: gmailThreadId } : {}),
        }),
      });
      const sent = await sendRes.json();
      if (!sendRes.ok) return json({ error: "Send failed", details: sent }, 502);

      // Trigger an immediate sync to pull the sent message into our tables
      fetch(`${SUPABASE_URL}/functions/v1/gmail-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ user_id: userId }),
      }).catch(() => {});

      return json({ ok: true, gmail_message_id: sent.id, gmail_thread_id: sent.threadId });
    }

    // ── watch (set up Pub/Sub push) ────────────────────────────────────
    if (action === "watch") {
      if (!PUBSUB_TOPIC) return json({ error: "GMAIL_PUBSUB_TOPIC not configured" }, 400);
      const watchRes = await fetch(`${GMAIL_API}/watch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          topicName: PUBSUB_TOPIC,
          labelIds: ["INBOX"],
          labelFilterAction: "include",
        }),
      });
      const watch = await watchRes.json();
      if (!watchRes.ok) return json({ error: "Watch failed", details: watch }, 502);
      await supabase.from("crm_gmail_sync_state").upsert({
        user_id: userId,
        watch_history_id: watch.historyId,
        watch_expires_at: new Date(parseInt(watch.expiration, 10)).toISOString(),
      }, { onConflict: "user_id" });
      return json({ ok: true, expiration: watch.expiration });
    }

    if (action === "stop_watch") {
      await fetch(`${GMAIL_API}/stop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await supabase.from("crm_gmail_sync_state").update({
        watch_history_id: null,
        watch_expires_at: null,
      }).eq("user_id", userId);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("gmail-actions error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function getValidAccessToken(supabase: any, userId: string, clientId: string, clientSecret: string): Promise<string | null> {
  const { data: token } = await supabase.from("gmail_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (!token) return null;
  if (new Date(token.token_expires_at).getTime() > Date.now() + 5 * 60 * 1000) return token.access_token;
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: token.refresh_token, grant_type: "refresh_token",
    }),
  });
  const r = await res.json();
  if (!res.ok || !r.access_token) return null;
  await supabase.from("gmail_tokens").update({
    access_token: r.access_token,
    token_expires_at: new Date(Date.now() + (r.expires_in || 3600) * 1000).toISOString(),
  }).eq("user_id", userId);
  return r.access_token;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
