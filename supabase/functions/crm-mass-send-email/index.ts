// crm-mass-send-email — Fans out one personalized send per recipient via the
// existing bridge-send-email function. Throttles at ~5/sec to be a friendly
// SMTP citizen. Logs a job row to crm_mass_send_jobs for auditability.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const THROTTLE_PER_SEC = 5;
const MAX_RECIPIENTS = 7000;

interface Body {
  recipient_ids: string[];
  subject: string;
  body_html: string;
  append_signature?: boolean;
  signature_id?: string | null;
  cc?: string | null;
  bcc?: string | null;
}

/** Naive but safe variable substitution mirroring renderForRecipient on the client. */
function renderForLead(template: string, lead: Record<string, string>, sender: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const path = String(key).split('.');
    if (path[0] === 'lead') return lead[path[1]] ?? '';
    if (path[0] === 'sender') return sender[path[1]] ?? '';
    return '';
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const token = authHeader.replace("Bearer ", "");
    const { data: userResp, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userResp?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userResp.user.id;

    const body = (await req.json()) as Body;
    if (!Array.isArray(body.recipient_ids) || body.recipient_ids.length === 0) {
      return json({ error: "recipient_ids required" }, 400);
    }
    if (body.recipient_ids.length > MAX_RECIPIENTS) {
      return json({ error: `Max ${MAX_RECIPIENTS} recipients per job` }, 400);
    }
    if (!body.subject?.trim() || !body.body_html?.trim()) {
      return json({ error: "subject and body_html required" }, 400);
    }

    // Fetch recipient details
    const { data: contacts, error: cErr } = await supabase
      .from("crm_contacts")
      .select("id,first_name,last_name,email,phone")
      .in("id", body.recipient_ids);
    if (cErr) return json({ error: cErr.message }, 500);

    // Fetch sender info (settings + signature)
    const { data: settings } = await supabase
      .from("crm_email_settings").select("sender_name,reply_to,signature_html")
      .eq("user_id", userId).maybeSingle();

    let signatureHtml = "";
    if (body.append_signature && body.signature_id) {
      const { data: sig } = await supabase
        .from("crm_email_signatures").select("html")
        .eq("id", body.signature_id).maybeSingle();
      signatureHtml = sig?.html ?? "";
    } else if (body.append_signature) {
      signatureHtml = settings?.signature_html ?? "";
    }

    const senderCtx = {
      full_name: settings?.sender_name ?? "",
      first_name: (settings?.sender_name ?? "").split(" ")[0] ?? "",
      email: settings?.reply_to ?? userResp.user.email ?? "",
      signature: signatureHtml,
    };

    const reachable = (contacts ?? []).filter((c: any) => c.email);
    const skipped = (contacts ?? []).length - reachable.length;

    // Create a job row for audit trail (best-effort — table may not exist yet)
    let jobId: string | null = null;
    try {
      const { data: job } = await supabase.from("crm_mass_send_jobs").insert({
        created_by: userId,
        recipient_count: reachable.length,
        skipped_count: skipped,
        subject: body.subject,
        status: "running",
        throttle_per_sec: THROTTLE_PER_SEC,
        started_at: new Date().toISOString(),
      }).select("id").single();
      jobId = job?.id ?? null;
    } catch (e) {
      console.warn("crm_mass_send_jobs insert skipped:", (e as Error).message);
    }

    const estimated = Math.ceil(reachable.length / THROTTLE_PER_SEC);

    // Fan out asynchronously without blocking the response
    (async () => {
      let sent = 0, failed = 0;
      for (const c of reachable) {
        const lead = {
          first_name: c.first_name ?? "",
          last_name: c.last_name ?? "",
          full_name: [c.first_name, c.last_name].filter(Boolean).join(" "),
          email: c.email ?? "",
          phone: c.phone ?? "",
        };
        const subj = renderForLead(body.subject, lead, senderCtx);
        let html = renderForLead(body.body_html, lead, senderCtx);
        if (body.append_signature && signatureHtml) {
          html = `${html}<br/><br/>${signatureHtml}`;
        }
        try {
          const upstream = await fetch(`${supabaseUrl}/functions/v1/bridge-send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": authHeader,
            },
            body: JSON.stringify({
              to: c.email,
              cc: body.cc || undefined,
              bcc: body.bcc || undefined,
              subject: subj,
              html,
              contact_id: c.id,
            }),
          });
          if (upstream.ok) sent++;
          else failed++;
        } catch (e) {
          console.error("send failed for", c.id, e);
          failed++;
        }
        // throttle
        await new Promise((r) => setTimeout(r, Math.ceil(1000 / THROTTLE_PER_SEC)));
      }
      if (jobId) {
        await supabase.from("crm_mass_send_jobs").update({
          status: "completed",
          sent_count: sent,
          failed_count: failed,
          completed_at: new Date().toISOString(),
        }).eq("id", jobId);
      }
    })().catch((e) => console.error("fanout error", e));

    return json({
      job_id: jobId ?? "inline",
      queued: reachable.length,
      skipped,
      estimated_seconds: estimated,
    }, 200);

  } catch (e) {
    console.error("crm-mass-send-email error", e);
    return json({ error: e instanceof Error ? e.message : "Internal" }, 500);
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
