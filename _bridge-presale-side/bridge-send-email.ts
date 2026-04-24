// DEPLOY TO PRESALE PROPERTIES PROJECT as:
//   supabase/functions/bridge-send-email/index.ts
//
// Accepts a send request from the Dealzflow CRM and sends through Presale's
// existing Gmail SMTP pipeline (info@presaleproperties.com). Logs to email_logs
// with template_type='crm_bridge' for unified analytics.
//
// Gated by shared BRIDGE_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "../_shared/gmail-smtp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BridgeSendBody {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  template_id?: string | null;
  source?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const expected = Deno.env.get("BRIDGE_SECRET");
    const provided = req.headers.get("x-bridge-secret") || "";
    if (!expected || provided !== expected) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as BridgeSendBody;
    if (!body.to || !body.subject || !body.html) {
      return json({ error: "to, subject, html are required" }, 400);
    }

    const toArr = Array.isArray(body.to) ? body.to : [body.to];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pre-log
    const { data: logEntry } = await supabase
      .from("email_logs")
      .insert({
        email_to: toArr.join(","),
        subject: body.subject,
        status: "queued",
        template_type: "crm_bridge",
        recipient_name: toArr[0],
      })
      .select("id, tracking_id")
      .single();

    const result = await sendEmail({
      to: toArr,
      subject: body.subject,
      html: body.html,
      fromName: "Presale Properties",
    });

    if (!result.success) {
      if (logEntry) {
        await supabase.from("email_logs").update({
          status: "failed",
          error_message: result.error,
        }).eq("id", logEntry.id);
      }
      return json({ error: result.error || "Send failed" }, 500);
    }

    if (logEntry) {
      await supabase.from("email_logs").update({ status: "sent" }).eq("id", logEntry.id);
    }

    return json({
      success: true,
      tracking_id: logEntry?.tracking_id ?? null,
      message_id: result.messageId,
    }, 200);
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
