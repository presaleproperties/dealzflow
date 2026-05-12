// @ts-nocheck
// Gmail sync: full or incremental. Fetches messages via Gmail API,
// parses them, matches to CRM contacts by email, upserts into
// crm_email_threads + crm_gmail_messages.
//
// Triggered by:
//   - gmail-auth (after connect, full=true)
//   - gmail-webhook (Pub/Sub push, incremental via historyId)
//   - cron job every 2 minutes (incremental safety net)
//   - manual "Sync now" button in UI
//
// Body: { user_id?: string, full?: boolean, history_id?: string }
//   - user_id required when called by service role
//   - if no user_id, uses auth header (from UI)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Limit per sync run to avoid edge function timeouts (Supabase: 150s wall)
const FULL_SYNC_LIMIT = 200;     // initial pull = last ~200 messages
const FULL_SYNC_DAYS = 60;       // only go back 60 days on first sync
const INCREMENTAL_LIMIT = 100;   // per incremental run
const BATCH_SIZE = 10;           // parallel get() calls

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID")!;
    const CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET")!;

    const body = await req.json().catch(() => ({}));
    let userId: string | null = body.user_id ?? null;
    const fullSync = body.full === true;

    // If no user_id in body, derive from auth header
    if (!userId) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const token = authHeader.replace("Bearer ", "");
      // If token is the service role, body.user_id is required
      if (token === SERVICE_KEY) return json({ error: "user_id required" }, 400);
      const u = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await u.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);
      userId = user.id;
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Get + refresh token
    const accessToken = await getValidAccessToken(supabase, userId, CLIENT_ID, CLIENT_SECRET);
    if (!accessToken) return json({ error: "No Gmail connection" }, 401);

    // 2. Decide sync strategy
    const { data: syncState } = await supabase
      .from("crm_gmail_sync_state")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    let messageIds: string[] = [];
    let newHistoryId: string | null = null;
    let strategy: "full" | "incremental" = "full";

    if (!fullSync && syncState?.last_history_id && syncState?.initial_sync_completed) {
      // Incremental
      strategy = "incremental";
      const histRes = await fetch(
        `${GMAIL_API}/history?startHistoryId=${syncState.last_history_id}&historyTypes=messageAdded&historyTypes=labelAdded`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const hist = await histRes.json();

      // 404 = history too old, fall back to full
      if (histRes.status === 404 || hist.error?.code === 404) {
        console.log(`[gmail-sync] history expired for user ${userId}, falling back to full`);
        strategy = "full";
      } else if (!histRes.ok) {
        return json({ error: "history fetch failed", details: hist }, 500);
      } else {
        newHistoryId = hist.historyId ?? null;
        const ids = new Set<string>();
        for (const h of hist.history ?? []) {
          for (const m of h.messagesAdded ?? []) ids.add(m.message.id);
          for (const m of h.labelsAdded ?? []) ids.add(m.message.id);
        }
        messageIds = Array.from(ids).slice(0, INCREMENTAL_LIMIT);
      }
    }

    if (strategy === "full") {
      // Full sync: pull recent messages from inbox + sent
      const since = Math.floor((Date.now() - FULL_SYNC_DAYS * 24 * 3600 * 1000) / 1000);
      const q = `after:${since}`;
      const listRes = await fetch(
        `${GMAIL_API}/messages?maxResults=${FULL_SYNC_LIMIT}&q=${encodeURIComponent(q)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const list = await listRes.json();
      if (!listRes.ok) return json({ error: "list failed", details: list }, 500);
      messageIds = (list.messages ?? []).map((m: any) => m.id);

      // Capture current historyId for next incremental
      const profileRes = await fetch(`${GMAIL_API}/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profile = await profileRes.json();
      newHistoryId = profile.historyId ?? null;
    }

    console.log(`[gmail-sync] user=${userId} strategy=${strategy} ids=${messageIds.length}`);

    // 3. Filter out already-synced messages
    if (messageIds.length > 0) {
      const { data: existing } = await supabase
        .from("crm_gmail_messages")
        .select("gmail_message_id")
        .eq("user_id", userId)
        .in("gmail_message_id", messageIds);
      const known = new Set((existing ?? []).map(r => r.gmail_message_id));
      messageIds = messageIds.filter(id => !known.has(id));
    }

    // 4. Build a contact-email lookup once
    const { data: contacts } = await supabase
      .from("crm_contacts")
      .select("id, email, email_secondary, first_name, last_name")
      .or("email.not.is.null,email_secondary.not.is.null");
    const emailToContact = new Map<string, string>();
    for (const c of contacts ?? []) {
      if (c.email) emailToContact.set(c.email.toLowerCase(), c.id);
      if (c.email_secondary) emailToContact.set(c.email_secondary.toLowerCase(), c.id);
    }

    // 5. Fetch + insert in batches
    let inserted = 0;
    let matched = 0;
    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batch = messageIds.slice(i, i + BATCH_SIZE);
      const msgs = await Promise.all(
        batch.map(id =>
          fetch(`${GMAIL_API}/messages/${id}?format=full`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }).then(r => r.json()).catch(e => ({ error: String(e) }))
        )
      );

      for (const msg of msgs) {
        if (!msg || msg.error || !msg.id) continue;
        const parsed = parseGmailMessage(msg);
        const contactId = findContactId(parsed, emailToContact);
        if (contactId) matched++;

        // Upsert thread (find existing or create)
        let threadDbId: string | null = null;
        const { data: existingThread } = await supabase
          .from("crm_email_threads")
          .select("id")
          .eq("user_id", userId)
          .eq("gmail_thread_id", parsed.gmail_thread_id)
          .maybeSingle();

        if (existingThread) {
          threadDbId = existingThread.id;
          // Backfill contact_id if we just discovered it
          if (contactId) {
            await supabase
              .from("crm_email_threads")
              .update({ contact_id: contactId })
              .eq("id", threadDbId)
              .is("contact_id", null);
          }
        } else {
          const participants = Array.from(new Set([
            parsed.from_email,
            ...parsed.to_emails,
            ...parsed.cc_emails,
          ].filter(Boolean).map(e => e.toLowerCase())));
          const { data: newThread } = await supabase
            .from("crm_email_threads")
            .insert({
              user_id: userId,
              contact_id: contactId,
              gmail_thread_id: parsed.gmail_thread_id,
              subject: parsed.subject || "(no subject)",
              participants,
              last_message_at: parsed.internal_date,
            })
            .select("id")
            .single();
          threadDbId = newThread?.id ?? null;
        }

        // Insert message
        const { error: insErr } = await supabase
          .from("crm_gmail_messages")
          .insert({
            user_id: userId,
            thread_id: threadDbId,
            contact_id: contactId,
            gmail_message_id: parsed.gmail_message_id,
            gmail_thread_id: parsed.gmail_thread_id,
            message_id_header: parsed.message_id_header,
            in_reply_to: parsed.in_reply_to,
            direction: parsed.direction,
            from_email: parsed.from_email,
            from_name: parsed.from_name,
            to_emails: parsed.to_emails,
            cc_emails: parsed.cc_emails,
            subject: parsed.subject,
            snippet: parsed.snippet,
            body_text: parsed.body_text,
            body_html: parsed.body_html,
            labels: parsed.labels,
            is_read: parsed.is_read,
            is_starred: parsed.is_starred,
            has_attachments: parsed.has_attachments,
            attachment_meta: parsed.attachment_meta,
            internal_date: parsed.internal_date,
          });
        if (!insErr) {
          inserted++;
          // Zara hook: fire-and-forget if this is an inbound message on a Zara-assigned contact
          if (parsed.direction === "inbound" && contactId) {
            try {
              const { data: c } = await supabase
                .from("crm_contacts").select("assigned_to").eq("id", contactId).maybeSingle();
              const { data: zara } = await supabase
                .from("crm_team").select("id").eq("slug", "zara").maybeSingle();
              if (c?.assigned_to && zara?.id && c.assigned_to === zara.id) {
                supabase.functions.invoke("zara-reply", {
                  body: {
                    contact_id: contactId,
                    channel: "email",
                    message_text: parsed.body_text || parsed.snippet || "",
                    message_id: parsed.gmail_message_id,
                  },
                }).catch((e) => console.warn("[gmail-sync] zara-reply invoke failed", e));
              }
            } catch (e) { console.warn("[gmail-sync] zara hook err", e); }
          }
        } else if (!String(insErr.message).includes("duplicate")) {
          console.error(`[gmail-sync] insert error for msg ${msg.id}:`, insErr);
        }
      }
    }

    // 6. Update sync state
    await supabase.from("crm_gmail_sync_state").upsert({
      user_id: userId,
      last_history_id: newHistoryId ?? syncState?.last_history_id,
      last_sync_at: new Date().toISOString(),
      initial_sync_completed: true,
      total_messages_synced: (syncState?.total_messages_synced ?? 0) + inserted,
      last_error: null,
      last_error_at: null,
    }, { onConflict: "user_id" });

    return json({
      ok: true,
      strategy,
      processed: messageIds.length,
      inserted,
      matched_to_contacts: matched,
      new_history_id: newHistoryId,
    });
  } catch (e) {
    console.error("gmail-sync error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ── helpers ──────────────────────────────────────────────────────────

async function getValidAccessToken(supabase: any, userId: string, clientId: string, clientSecret: string): Promise<string | null> {
  const { data: token } = await supabase
    .from("gmail_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!token) return null;

  const expiresAt = new Date(token.token_expires_at).getTime();
  // Refresh if expires in next 5 min
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
  if (!refreshRes.ok || !refreshed.access_token) {
    console.error("Refresh failed for user", userId, refreshed);
    return null;
  }
  const newExpiry = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();
  await supabase.from("gmail_tokens").update({
    access_token: refreshed.access_token,
    token_expires_at: newExpiry,
  }).eq("user_id", userId);
  return refreshed.access_token;
}

function parseGmailMessage(msg: any) {
  const headers: Record<string, string> = {};
  for (const h of msg.payload?.headers ?? []) {
    headers[h.name.toLowerCase()] = h.value;
  }

  const labels: string[] = msg.labelIds ?? [];
  const isInbound = labels.includes("INBOX") || (!labels.includes("SENT") && !labels.includes("DRAFT"));
  const isOutbound = labels.includes("SENT");
  // If both, prefer SENT for direction = outbound
  const direction = isOutbound ? "outbound" : "inbound";
  const isRead = !labels.includes("UNREAD");
  const isStarred = labels.includes("STARRED");

  const fromRaw = headers["from"] ?? "";
  const { email: fromEmail, name: fromName } = parseAddress(fromRaw);
  const toEmails = parseAddressList(headers["to"]);
  const ccEmails = parseAddressList(headers["cc"]);

  const { text, html, hasAttachments, attachmentMeta } = extractBody(msg.payload);

  return {
    gmail_message_id: msg.id as string,
    gmail_thread_id: msg.threadId as string,
    message_id_header: headers["message-id"] ?? null,
    in_reply_to: headers["in-reply-to"] ?? null,
    direction,
    from_email: (fromEmail || "").toLowerCase(),
    from_name: fromName,
    to_emails: toEmails,
    cc_emails: ccEmails,
    subject: headers["subject"] ?? "",
    snippet: msg.snippet ?? "",
    body_text: text,
    body_html: html,
    labels,
    is_read: isRead,
    is_starred: isStarred,
    has_attachments: hasAttachments,
    attachment_meta: attachmentMeta,
    internal_date: new Date(parseInt(msg.internalDate, 10)).toISOString(),
  };
}

function parseAddress(raw: string): { email: string; name: string | null } {
  if (!raw) return { email: "", name: null };
  const m = raw.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim() };
  return { email: raw.trim(), name: null };
}

function parseAddressList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map(p => parseAddress(p.trim()).email.toLowerCase()).filter(Boolean);
}

function extractBody(payload: any): { text: string; html: string; hasAttachments: boolean; attachmentMeta: any[] } {
  let text = "";
  let html = "";
  const attachmentMeta: any[] = [];
  let hasAttachments = false;

  function walk(part: any) {
    if (!part) return;
    const mime = part.mimeType ?? "";
    const filename = part.filename ?? "";
    if (filename && part.body?.attachmentId) {
      hasAttachments = true;
      attachmentMeta.push({
        filename,
        mime,
        size: part.body.size,
        attachment_id: part.body.attachmentId,
      });
    }
    if (mime === "text/plain" && part.body?.data) {
      text += decodeBase64Url(part.body.data);
    } else if (mime === "text/html" && part.body?.data) {
      html += decodeBase64Url(part.body.data);
    }
    for (const child of part.parts ?? []) walk(child);
  }
  walk(payload);

  return { text, html, hasAttachments, attachmentMeta };
}

function decodeBase64Url(data: string): string {
  try {
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

function findContactId(parsed: any, lookup: Map<string, string>): string | null {
  // Inbound: match on from_email; Outbound: match on to_emails or cc_emails
  if (parsed.direction === "inbound") {
    const id = lookup.get(parsed.from_email);
    if (id) return id;
  } else {
    for (const e of parsed.to_emails) {
      const id = lookup.get(e);
      if (id) return id;
    }
    for (const e of parsed.cc_emails) {
      const id = lookup.get(e);
      if (id) return id;
    }
  }
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
