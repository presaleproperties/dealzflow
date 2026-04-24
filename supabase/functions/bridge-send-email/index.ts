// CRM → Presale send proxy.
// Accepts a compose payload from the CRM UI, forwards to Presale's
// bridge-send-email (Gmail SMTP via info@presaleproperties.com),
// then writes a row to crm_email_log so the CRM activity feed stays accurate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PRESALE_FUNCTIONS_URL =
  "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1";

interface SendBody {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  template_id?: string | null;
  contact_id?: string | null;
  // When provided, send is queued for later via crm_email_schedule
  send_at?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bridgeSecret = Deno.env.get("BRIDGE_SECRET");

    if (!bridgeSecret) return json({ error: "BRIDGE_SECRET not configured" }, 500);

    // Authenticate caller
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
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

    // ── Scheduled send: insert into crm_email_schedule and return ──
    if (body.send_at) {
      const { error: schedErr } = await supabase.from("crm_email_schedule").insert({
        contact_id: body.contact_id ?? null,
        template_id: body.template_id ?? null,
        to_emails: toArr,
        cc: typeof body.cc === "string" ? body.cc : (body.cc?.join(",") ?? null),
        bcc: typeof body.bcc === "string" ? body.bcc : (body.bcc?.join(",") ?? null),
        subject: body.subject,
        body_html: body.html,
        send_at: body.send_at,
        status: "pending",
        created_by: userId,
      });
      if (schedErr) return json({ error: schedErr.message }, 500);
      return json({ scheduled: true }, 200);
    }

    // ── Immediate send via Presale bridge ──
    const upstream = await fetch(`${PRESALE_FUNCTIONS_URL}/bridge-send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-secret": bridgeSecret,
      },
      body: JSON.stringify({
        to: toArr,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        html: body.html,
        template_id: body.template_id ?? null,
        source: "dealzflow_crm",
      }),
    });

    const upstreamText = await upstream.text();
    let upstreamJson: any = {};
    try { upstreamJson = JSON.parse(upstreamText); } catch {/* ignore */}

    if (!upstream.ok) {
      console.error("Presale bridge-send-email failed", upstream.status, upstreamText);
      // Best-effort log
      await supabase.from("crm_email_log").insert({
        contact_id: body.contact_id ?? null,
        direction: "outbound",
        subject: body.subject,
        body: body.html,
        status: "failed",
        error_message: upstreamJson?.error ?? upstreamText.slice(0, 500),
        sent_by: userId,
        sent_at: new Date().toISOString(),
      }).then(() => {}, () => {});
      return json(
        { error: upstreamJson?.error ?? "Send failed", status: upstream.status },
        502,
      );
    }

    // Log success rows — one per primary recipient
    for (const addr of toArr) {
      await supabase.from("crm_email_log").insert({
        contact_id: body.contact_id ?? null,
        direction: "outbound",
        subject: body.subject,
        body: body.html,
        status: "sent",
        recipient_email: addr,
        sent_by: userId,
        sent_at: new Date().toISOString(),
      }).then(() => {}, () => {});
    }

    return json({ success: true, ...upstreamJson }, 200);
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
