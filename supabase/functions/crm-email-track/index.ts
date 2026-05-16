// Public tracking endpoint — handles open pixels and click redirects for CRM emails.
// No JWT required (recipients click these from their inbox).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

// 1×1 transparent GIF
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

function pixelResponse() {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const action = url.searchParams.get("a") ?? "open";
  const trackingId = url.searchParams.get("t");
  const targetUrl = url.searchParams.get("u");
  const buttonKind = url.searchParams.get("b"); // brochure | floor_plans | pricing | project_details | call | link

  // Always succeed — we never want a tracking error to break the recipient's experience.
  if (!trackingId) {
    if (action === "click" && targetUrl) return Response.redirect(targetUrl, 302);
    return pixelResponse();
  }

  // ── Bot/scanner classification ──────────────────────────────────────────────
  // Apple Mail Privacy Protection, Gmail proxy, Outlook ATP, Proofpoint, etc.
  // pre-fetch the pixel without a human reading the email. Heuristics:
  //   1. Known scanner/proxy user-agent substrings
  //   2. Pixel fired < 8s after sent_at (no human reads that fast)
  //   3. Cache-warming GoogleImageProxy/AMP/Outlook safelink prefetches
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  const BOT_UA_PATTERNS = [
    "googleimageproxy",     // Gmail image proxy
    "ggpht.com",
    "yahoomailproxy",
    "mimecast",
    "proofpoint",
    "barracuda",
    "symantec",
    "messagelabs",
    "trendmicro",
    "forcepoint",
    "cloudmark",
    "spamtitan",
    "msnbot",
    "bingpreview",
    "slackbot",
    "facebookexternalhit",
    "twitterbot",
    "linkedinbot",
    "discordbot",
    "curl/",
    "python-requests",
    "go-http-client",
    "node-fetch",
    "headlesschrome",
    "phantomjs",
  ];
  function classifyBot(userAgent: string, sentAt?: string | null): boolean {
    if (!userAgent) return true; // No UA = almost certainly a bot
    if (BOT_UA_PATTERNS.some((p) => userAgent.includes(p))) return true;
    // Apple Mail Privacy: requests come from Apple's iCloud relay range with
    // a Mozilla-style UA, almost always within seconds of send.
    if (sentAt) {
      const dt = Date.now() - new Date(sentAt).getTime();
      if (dt < 8_000) return true; // pre-fetch
    }
    return false;
  }

  try {
    // Fetch the send-log row to know which contact / template / campaign this belongs to.
    const { data: log } = await supabase
      .from("crm_email_send_log")
      .select("id, contact_id, email_to, subject, template_id, campaign_id, template_type, open_count, click_count, human_open_count, sent_at")
      .eq("tracking_id", trackingId)
      .maybeSingle();

    // Also load the matching crm_email_log row (the table the CRM activity feed
    // reads). Both updates are best-effort — neither should block the response.
    const { data: emailLog } = await supabase
      .from("crm_email_log")
      .select("id, contact_id, open_count, click_count, human_open_count, sent_at")
      .eq("tracking_id", trackingId)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    const sentAt = log?.sent_at ?? emailLog?.sent_at ?? null;
    const isBot = action === "open" ? classifyBot(ua, sentAt) : false;

    if (action === "open") {
      if (log) {
        const patch: Record<string, unknown> = {
          last_opened_at: nowIso,
          open_count: (log.open_count ?? 0) + 1,
        };
        if (isBot) {
          patch.bot_open_count = ((log as any).bot_open_count ?? 0) + 1;
        } else {
          patch.status = "opened";
          patch.human_open_count = (log.human_open_count ?? 0) + 1;
          if ((log.human_open_count ?? 0) === 0) {
            patch.opened_at = nowIso;
            patch.first_human_opened_at = nowIso;
          }
        }
        await supabase.from("crm_email_send_log").update(patch).eq("id", log.id);
      }

      if (emailLog) {
        const patch: Record<string, unknown> = {
          last_opened_at: nowIso,
          open_count: (emailLog.open_count ?? 0) + 1,
        };
        if (isBot) {
          patch.bot_open_count = ((emailLog as any).bot_open_count ?? 0) + 1;
        } else {
          patch.human_open_count = (emailLog.human_open_count ?? 0) + 1;
          if ((emailLog.human_open_count ?? 0) === 0) {
            patch.opened_at = nowIso;
            patch.first_human_opened_at = nowIso;
          }
        }
        await supabase.from("crm_email_log").update(patch).eq("id", emailLog.id);
      }

      // Only write an engagement event on the FIRST HUMAN open to avoid timeline spam from bots.
      const firstHumanOpen = !isBot &&
        (log?.human_open_count ?? emailLog?.human_open_count ?? 0) === 0;
      const contactId = log?.contact_id ?? emailLog?.contact_id ?? null;
      if (firstHumanOpen && contactId) {
        await supabase.from("crm_lead_behavior_engagement").insert({
          contact_id: contactId,
          email: log?.email_to,
          event_type: "email_open",
          campaign_id: log?.campaign_id,
          campaign_name: log?.subject,
          template_id: log?.template_id,
          template_name: log?.template_type,
          occurred_at: nowIso,
          metadata: { tracking_id: trackingId },
        });
      }
    }

    if (action === "click") {
      if (log) {
        await supabase
          .from("crm_email_send_log")
          .update({
            status: "clicked",
            clicked_at: log.click_count === 0 ? nowIso : undefined,
            last_clicked_at: nowIso,
            click_count: (log.click_count ?? 0) + 1,
            clicked_url: targetUrl ?? undefined,
          })
          .eq("id", log.id);
      }

      if (emailLog) {
        await supabase
          .from("crm_email_log")
          .update({
            clicked_at: emailLog.click_count === 0 ? nowIso : undefined,
            last_clicked_at: nowIso,
            click_count: (emailLog.click_count ?? 0) + 1,
          })
          .eq("id", emailLog.id);
      }

      const contactId = log?.contact_id ?? emailLog?.contact_id ?? null;
      if (contactId) {
        // Always write click events — clicks are higher-signal than opens.
        await supabase.from("crm_lead_behavior_engagement").insert({
          contact_id: contactId,
          email: log?.email_to,
          event_type: "email_click",
          campaign_id: log?.campaign_id,
          campaign_name: log?.subject,
          template_id: log?.template_id,
          template_name: log?.template_type,
          link_url: targetUrl,
          occurred_at: nowIso,
          metadata: { tracking_id: trackingId, button: buttonKind ?? null },
        });
      }
    }
  } catch (e) {
    console.error("track error", e);
  }

  if (action === "click" && targetUrl) {
    try {
      // Validate URL before redirecting
      const u = new URL(targetUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return new Response("Invalid redirect", { status: 400, headers: corsHeaders });
      }
      return Response.redirect(targetUrl, 302);
    } catch {
      return new Response("Invalid redirect URL", { status: 400, headers: corsHeaders });
    }
  }

  return pixelResponse();
});
