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

  try {
    // Fetch the send-log row to know which contact / template / campaign this belongs to.
    const { data: log } = await supabase
      .from("crm_email_send_log")
      .select("id, contact_id, email_to, subject, template_id, campaign_id, template_type, open_count, click_count")
      .eq("tracking_id", trackingId)
      .maybeSingle();

    // Also load the matching crm_email_log row (the table the CRM activity feed
    // reads). Both updates are best-effort — neither should block the response.
    const { data: emailLog } = await supabase
      .from("crm_email_log")
      .select("id, contact_id, open_count, click_count")
      .eq("tracking_id", trackingId)
      .maybeSingle();

    const nowIso = new Date().toISOString();

    if (action === "open") {
      if (log) {
        await supabase
          .from("crm_email_send_log")
          .update({
            status: "opened",
            opened_at: log.open_count === 0 ? nowIso : undefined,
            last_opened_at: nowIso,
            open_count: (log.open_count ?? 0) + 1,
          })
          .eq("id", log.id);
      }

      if (emailLog) {
        await supabase
          .from("crm_email_log")
          .update({
            opened_at: emailLog.open_count === 0 ? nowIso : undefined,
            last_opened_at: nowIso,
            open_count: (emailLog.open_count ?? 0) + 1,
          })
          .eq("id", emailLog.id);
      }

      // Only write an engagement event on the FIRST open to avoid timeline spam.
      const firstOpen =
        (log?.open_count ?? emailLog?.open_count ?? 0) === 0;
      const contactId = log?.contact_id ?? emailLog?.contact_id ?? null;
      if (firstOpen && contactId) {
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
