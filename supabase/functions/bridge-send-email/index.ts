// CRM → Presale send proxy.
// Forwards send requests to Presale's bridge-send-email (Gmail SMTP via
// info@presaleproperties.com), then writes a row to crm_email_log so the
// CRM activity feed stays accurate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PRESALE_FUNCTIONS_URL =
  "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1";

// Public tracker endpoint on this CRM project. Recipients hit this from their
// inbox so it must NOT require auth (crm-email-track is deployed with
// verify_jwt = false).
const TRACKER_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/crm-email-track`;

/**
 * Inject a 1×1 transparent tracking pixel right before </body> (or appended
 * to the end if no </body> tag exists). Idempotent — if a pixel for this
 * tracking_id is already present we skip re-injecting.
 *
 * Note: open tracking is inherently lossy. Gmail proxies images through its
 * cache (1 open per recipient + occasional phantom prefetches), and Apple
 * Mail Privacy Protection pre-fetches images so an "open" can fire without
 * the user actually reading it. Treat counts as directional, not exact.
 */
function injectTrackingPixel(html: string, trackingId: string): string {
  const pixelUrl = `${TRACKER_URL}?a=open&t=${encodeURIComponent(trackingId)}`;
  const pixelTag =
    `<img src="${pixelUrl}" width="1" height="1" alt="" ` +
    `style="display:none!important;width:1px;height:1px;border:0;outline:none;" />`;

  if (html.includes(pixelUrl)) return html; // already injected

  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${pixelTag}</body>`);
  }
  return `${html}${pixelTag}`;
}

/**
 * Rewrite every <a href="..."> in the HTML so clicks route through the
 * tracker, which records the click and 302-redirects to the original URL.
 *
 * Skipped:
 *  - mailto:, tel:, sms:, javascript:, # anchors
 *  - URLs that already point at the tracker (idempotent)
 *  - The tracking pixel itself (we only touch <a href>, not <img src>)
 *
 * Preserves the rest of the anchor tag (target, style, class, etc.) and
 * supports both single and double-quoted hrefs.
 */
function rewriteLinks(html: string, trackingId: string): string {
  const SKIP_PREFIX = /^(mailto:|tel:|sms:|javascript:|#)/i;

  return html.replace(
    /<a\b([^>]*?)\shref\s*=\s*(["'])([\s\S]*?)\2([^>]*)>/gi,
    (match, pre, quote, href, post) => {
      const trimmed = href.trim();
      if (!trimmed) return match;
      if (SKIP_PREFIX.test(trimmed)) return match;
      if (trimmed.startsWith(TRACKER_URL)) return match;

      const wrapped =
        `${TRACKER_URL}?a=click&t=${encodeURIComponent(trackingId)}` +
        `&u=${encodeURIComponent(trimmed)}`;
      return `<a${pre} href=${quote}${wrapped}${quote}${post}>`;
    },
  );
}

interface SendBody {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  template_id?: string | null;
  contact_id?: string | null;
  // When provided, send is queued via crm_email_schedule
  send_at?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bridgeSecret =
      Deno.env.get("PRESALE_BRIDGE_SECRET") ?? Deno.env.get("BRIDGE_SECRET");
    const presaleAnonKey = Deno.env.get("PRESALE_ANON_KEY");

    if (!bridgeSecret) return json({ error: "BRIDGE_SECRET not configured" }, 500);
    if (!presaleAnonKey) return json({ error: "PRESALE_ANON_KEY not configured" }, 500);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userResp, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userResp?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userResp.user.id;

    const body = (await req.json()) as SendBody;
    const toArr = Array.isArray(body.to) ? body.to : [body.to];
    if (toArr.length === 0 || !body.subject || !body.html) {
      return json({ error: "to, subject, html are required" }, 400);
    }

    const ccStr = Array.isArray(body.cc) ? body.cc.join(",") : (body.cc ?? null);
    const bccStr = Array.isArray(body.bcc) ? body.bcc.join(",") : (body.bcc ?? null);

    // ── Scheduled send: queue and return ──
    if (body.send_at) {
      const { error: schedErr } = await supabase.from("crm_email_schedule").insert({
        contact_id: body.contact_id ?? null,
        template_id: body.template_id ?? null,
        to_emails: toArr,
        cc: ccStr,
        bcc: bccStr,
        subject: body.subject,
        body_html: body.html,
        send_at: body.send_at,
        status: "pending",
        created_by: userId,
      });
      if (schedErr) return json({ error: schedErr.message }, 500);
      return json({ scheduled: true }, 200);
    }

    // ── Immediate send: prefer agent's connected Gmail, fallback to bridge ──
    // If the logged-in user has a connected Gmail mailbox, send through THEIR
    // mailbox so the From: header matches the agent. This keeps the per-agent
    // identity correct (Zara's emails come from admin@…, not info@…).
    const { data: gmailToken } = await supabase
      .from("gmail_tokens")
      .select("gmail_email")
      .eq("user_id", userId)
      .maybeSingle();
    const useAgentGmail = !!gmailToken?.gmail_email;

    // Fetch sender's brand logo settings so 1:1 emails carry the same banner
    // as bulk sends (visible in body regardless of BIMI/Workspace avatars).
    const { data: settings } = await supabase
      .from("crm_email_settings")
      .select("sender_name,brand_logo_url,brand_logo_alt,brand_logo_enabled")
      .eq("user_id", userId)
      .maybeSingle();

    // Header logo is opt-in: only injected when explicitly enabled in Settings.
    const logoEnabled = settings?.brand_logo_enabled === true;
    const rawLogoUrl = (settings?.brand_logo_url ?? "").trim();
    const safeLogoUrl = logoEnabled && /^https:\/\//i.test(rawLogoUrl) ? rawLogoUrl : "";
    const safeLogoAlt = ((settings?.brand_logo_alt ?? settings?.sender_name ?? "Logo") || "Logo")
      .replace(/[<>"']/g, "");
    const brandBannerHtml = safeLogoUrl
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 20px 0;"><tr><td align="center" style="padding:8px 0 16px 0;border-bottom:1px solid #ececec;"><img src="${safeLogoUrl}" alt="${safeLogoAlt}" style="display:block;max-height:64px;max-width:240px;height:auto;width:auto;border:0;outline:none;text-decoration:none;" /></td></tr></table>`
      : "";

    // Generate a tracking_id up-front, inject the open-tracking pixel into
    // the HTML, and persist the same id on crm_email_log so crm-email-track
    // can correlate inbox opens back to this send.
    const trackingId = crypto.randomUUID();
    const bodyWithBanner = brandBannerHtml ? `${brandBannerHtml}${body.html}` : body.html;
    const linkedHtml = rewriteLinks(bodyWithBanner, trackingId);
    const trackedHtml = injectTrackingPixel(linkedHtml, trackingId);

    let upstreamJson: any = {};
    let upstreamOk = false;
    let upstreamStatus = 0;

    if (useAgentGmail) {
      // Send through gmail-actions using the agent's connected mailbox.
      // We loop one-per-recipient so each gets a clean To: header.
      const recipients = toArr.filter(Boolean);
      const sendResults: Array<{ ok: boolean; gmail_message_id?: string; error?: string }> = [];
      for (const rcpt of recipients) {
        const r = await fetch(`${supabaseUrl}/functions/v1/gmail-actions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          },
          body: JSON.stringify({
            action: "send_reply",
            to: rcpt,
            subject: body.subject,
            body_html: trackedHtml,
            contact_id: body.contact_id ?? null,
          }),
        });
        const j = await r.json().catch(() => ({}));
        sendResults.push({ ok: r.ok && !j.error, gmail_message_id: j.gmail_message_id, error: j.error });
        if (!r.ok) upstreamStatus = r.status;
      }
      upstreamOk = sendResults.every((s) => s.ok);
      upstreamJson = { sent_via: "gmail", results: sendResults };
      if (!upstreamOk) {
        const firstErr = sendResults.find((s) => !s.ok)?.error ?? "Gmail send failed";
        console.error("agent Gmail send failed", firstErr);
        return json({ error: firstErr, status: upstreamStatus || 502 }, 502);
      }
    } else {
      // Fallback: route through Presale's bridge (info@presaleproperties.com)
      const upstream = await fetch(`${PRESALE_FUNCTIONS_URL}/bridge-send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bridge-secret": bridgeSecret,
          "Authorization": `Bearer ${presaleAnonKey}`,
          "apikey": presaleAnonKey,
        },
        body: JSON.stringify({
          to: toArr,
          cc: body.cc,
          bcc: body.bcc,
          subject: body.subject,
          html: trackedHtml,
          template_id: body.template_id ?? null,
          source: "dealzflow_crm",
        }),
      });

      const upstreamText = await upstream.text();
      try { upstreamJson = JSON.parse(upstreamText); } catch {/* ignore */}
      upstreamOk = upstream.ok;
      upstreamStatus = upstream.status;

      if (!upstreamOk) {
        console.error("Presale bridge-send-email failed", upstream.status, upstreamText);
        return json(
          { error: upstreamJson?.error ?? "Send failed", status: upstream.status },
          502,
        );
      }
    }

    // Log to crm_email_log only when we have a contact_id (column is NOT NULL).
    if (body.contact_id) {
      try {
        await supabase.from("crm_email_log").insert({
          contact_id: body.contact_id,
          user_id: userId,
          direction: "outbound",
          subject: body.subject,
          body: trackedHtml,
          cc: ccStr,
          bcc: bccStr,
          sent_at: new Date().toISOString(),
          tracking_id: trackingId,
        });
      } catch (e) {
        console.warn("crm_email_log insert failed", e);
      }
    }

    return json({ success: true, tracking_id: trackingId, ...upstreamJson }, 200);

  } catch (e) {
    console.error("bridge-send-email error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
