// @ts-nocheck
// Forwards email send requests from the CRM to Presale Properties' email infra,
// then logs the result in crm_email_send_log so the CRM has full visibility.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRESALE_SEND_URL = Deno.env.get("PRESALE_SEND_URL") ?? "";
const PRESALE_BRIDGE_SECRET = Deno.env.get("BRIDGE_SECRET") ?? "";

interface SendPayload {
  to: string;
  to_name?: string;
  subject: string;
  html?: string;
  text?: string;
  template_id?: string;
  template_type?: string;
  campaign_id?: string;
  contact_id?: string;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return json({ error: "Missing auth" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      auth.replace("Bearer ", ""),
    );
    if (userErr || !userData.user) return json({ error: "Invalid token" }, 401);

    const { data: member } = await supabase
      .from("crm_team")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!member) return json({ error: "Not a CRM member" }, 403);

    const body = (await req.json()) as SendPayload;
    if (!body?.to || !body?.subject || (!body.html && !body.text)) {
      return json({ error: "to, subject and html/text are required" }, 400);
    }

    const trackingId = crypto.randomUUID();

    // Pre-log as pending so the UI can immediately show the attempt.
    const { data: logRow } = await supabase
      .from("crm_email_send_log")
      .insert({
        contact_id: body.contact_id ?? null,
        email_to: body.to,
        recipient_name: body.to_name ?? null,
        subject: body.subject,
        status: "pending",
        template_id: body.template_id ?? null,
        template_type: body.template_type ?? null,
        campaign_id: body.campaign_id ?? null,
        tracking_id: trackingId,
        metadata: body.metadata ?? {},
      })
      .select("id")
      .single();

    let presaleResp: Response | null = null;
    let presaleBody: any = null;

    if (PRESALE_SEND_URL && PRESALE_BRIDGE_SECRET) {
      try {
        presaleResp = await fetch(PRESALE_SEND_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Bridge-Secret": PRESALE_BRIDGE_SECRET,
          },
          body: JSON.stringify({
            to: body.to,
            to_name: body.to_name,
            subject: body.subject,
            html: body.html,
            text: body.text,
            tracking_id: trackingId,
            origin: "crm",
            template_type: body.template_type,
          }),
        });
        presaleBody = await presaleResp.json().catch(() => ({}));
      } catch (e) {
        presaleBody = { error: String(e) };
      }
    } else {
      // Bridge URL not configured yet — mark as queued so the user knows.
      await supabase
        .from("crm_email_send_log")
        .update({
          status: "queued",
          error_message:
            "PRESALE_SEND_URL not configured — set the secret to enable delivery.",
        })
        .eq("id", logRow?.id);
      return json({
        ok: false,
        queued: true,
        tracking_id: trackingId,
        message:
          "Email queued in CRM but PRESALE_SEND_URL is not configured. Add the secret to start delivery via Presale Properties.",
      }, 202);
    }

    const ok = presaleResp && presaleResp.ok;
    await supabase
      .from("crm_email_send_log")
      .update({
        status: ok ? "sent" : "failed",
        error_message: ok ? null : JSON.stringify(presaleBody).slice(0, 500),
        presale_message_id: presaleBody?.message_id ?? null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", logRow?.id);

    return json({ ok, tracking_id: trackingId, presale: presaleBody }, ok ? 200 : 502);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
