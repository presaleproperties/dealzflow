// Cron worker: drains crm_email_schedule (rows with status='pending' AND send_at <= now())
// and dispatches each via Presale's bridge-send-email.
//
// Auth: gated by CRON_SECRET header (x-cron-secret).
// Schedule: trigger every minute via pg_cron (set up separately).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const PRESALE_FUNCTIONS_URL =
  "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1";

const BATCH_SIZE = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const provided = req.headers.get("x-cron-secret") || "";
    if (!cronSecret || provided !== cronSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const bridgeSecret = Deno.env.get("BRIDGE_SECRET");
    if (!bridgeSecret) return json({ error: "BRIDGE_SECRET not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const nowIso = new Date().toISOString();

    const { data: due, error: fetchErr } = await supabase
      .from("crm_email_schedule")
      .select("*")
      .eq("status", "pending")
      .lte("send_at", nowIso)
      .order("send_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!due || due.length === 0) return json({ processed: 0 }, 200);

    let sent = 0;
    let failed = 0;

    for (const row of due) {
      // Mark as processing to avoid double-dispatch on overlapping cron runs
      const { error: lockErr } = await supabase
        .from("crm_email_schedule")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending");
      if (lockErr) continue;

      try {
        const upstream = await fetch(`${PRESALE_FUNCTIONS_URL}/bridge-send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-bridge-secret": bridgeSecret,
          },
          body: JSON.stringify({
            to: row.to_emails,
            cc: row.cc,
            bcc: row.bcc,
            subject: row.subject,
            html: row.body_html,
            template_id: row.template_id,
            source: "dealzflow_crm_scheduled",
          }),
        });
        const text = await upstream.text();
        let upstreamJson: any = {};
        try { upstreamJson = JSON.parse(text); } catch {/* ignore */}

        if (!upstream.ok) {
          await supabase.from("crm_email_schedule").update({
            status: "failed",
            error_message: upstreamJson?.error ?? text.slice(0, 500),
            updated_at: new Date().toISOString(),
          }).eq("id", row.id);
          failed++;
          continue;
        }

        await supabase.from("crm_email_schedule").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);

        // Best-effort activity log
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
              sent_at: new Date().toISOString(),
            });
          } catch {/* ignore */}
        }
        sent++;
      } catch (e) {
        await supabase.from("crm_email_schedule").update({
          status: "failed",
          error_message: e instanceof Error ? e.message : String(e),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        failed++;
      }
    }

    return json({ processed: due.length, sent, failed }, 200);
  } catch (e) {
    console.error("process-scheduled-emails error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
