// crm-mass-send-email — Fans out one personalized send per recipient via the
// existing bridge-send-email function. Throttles at ~5/sec to be a friendly
// SMTP citizen. Logs progress to crm_email_send_jobs for auditability and
// honours the suppressed_emails list.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const THROTTLE_PER_SEC = 5;
const MAX_RECIPIENTS = 1500; // safe per-invocation ceiling (≈5 min wall clock at 5/sec)
const PROGRESS_FLUSH_EVERY = 25; // update job row every N sends

interface Body {
  recipient_ids: string[];
  subject: string;
  body_html: string;
  template_id?: string | null;
  append_signature?: boolean;
  signature_id?: string | null;
  cc?: string | null;
  bcc?: string | null;
}

interface ResultRow {
  contact_id: string;
  email: string;
  status: "sent" | "failed" | "skipped_suppressed" | "skipped_no_email";
  error?: string;
}

function renderForLead(template: string, lead: Record<string, string>, sender: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const path = String(key).split(".");
    if (path[0] === "lead") return lead[path[1]] ?? "";
    if (path[0] === "sender") return sender[path[1]] ?? "";
    return "";
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

    // Suppression filter — best effort (table may or may not exist depending on email infra).
    let suppressedSet = new Set<string>();
    try {
      const emails = (contacts ?? []).map((c: any) => (c.email ?? "").toLowerCase()).filter(Boolean);
      if (emails.length > 0) {
        const { data: sup } = await supabase
          .from("suppressed_emails")
          .select("recipient_email")
          .in("recipient_email", emails);
        suppressedSet = new Set((sup ?? []).map((r: any) => r.recipient_email?.toLowerCase()).filter(Boolean));
      }
    } catch {
      // Table may not exist; proceed without suppression check.
    }

    const results: ResultRow[] = [];
    const reachable: any[] = [];
    for (const c of contacts ?? []) {
      const e = (c.email ?? "").toLowerCase();
      if (!c.email) {
        results.push({ contact_id: c.id, email: "", status: "skipped_no_email" });
      } else if (suppressedSet.has(e)) {
        results.push({ contact_id: c.id, email: c.email, status: "skipped_suppressed" });
      } else {
        reachable.push(c);
      }
    }
    const totalRequested = (contacts ?? []).length;
    const skipped = totalRequested - reachable.length;

    // Create the job row (correct table: crm_email_send_jobs)
    let jobId: string | null = null;
    try {
      const { data: job, error: jobErr } = await supabase.from("crm_email_send_jobs").insert({
        created_by: userId,
        template_id: body.template_id ?? null,
        subject: body.subject,
        body_html: body.body_html,
        recipient_ids: body.recipient_ids,
        total_count: reachable.length,
        sent_count: 0,
        failed_count: 0,
        status: "running",
        results: results, // pre-seed with skipped rows
        started_at: new Date().toISOString(),
      }).select("id").single();
      if (jobErr) throw jobErr;
      jobId = job?.id ?? null;
    } catch (e) {
      console.warn("crm_email_send_jobs insert failed:", (e as Error).message);
    }

    const estimated = Math.ceil(reachable.length / THROTTLE_PER_SEC);

    // Background fan-out using EdgeRuntime.waitUntil so it survives response close.
    const work = (async () => {
      let sent = 0;
      let failed = 0;
      const flush = async (final = false) => {
        if (!jobId) return;
        try {
          await supabase.from("crm_email_send_jobs").update({
            sent_count: sent,
            failed_count: failed,
            results: results,
            status: final ? "completed" : "running",
            completed_at: final ? new Date().toISOString() : null,
          }).eq("id", jobId);
        } catch (e) {
          console.warn("progress flush failed:", (e as Error).message);
        }
      };

      for (let i = 0; i < reachable.length; i++) {
        const c = reachable[i];
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
          if (upstream.ok) {
            sent++;
            results.push({ contact_id: c.id, email: c.email, status: "sent" });
          } else {
            const errText = await upstream.text().catch(() => "");
            failed++;
            results.push({ contact_id: c.id, email: c.email, status: "failed", error: errText.slice(0, 240) });
          }
        } catch (e) {
          console.error("send failed for", c.id, e);
          failed++;
          results.push({ contact_id: c.id, email: c.email, status: "failed", error: (e as Error).message });
        }
        if ((i + 1) % PROGRESS_FLUSH_EVERY === 0) await flush(false);
        // throttle
        await new Promise((r) => setTimeout(r, Math.ceil(1000 / THROTTLE_PER_SEC)));
      }
      await flush(true);
    })().catch(async (e) => {
      console.error("fanout error", e);
      if (jobId) {
        try {
          await supabase.from("crm_email_send_jobs").update({
            status: "failed",
            error_message: (e as Error).message ?? "unknown",
            completed_at: new Date().toISOString(),
          }).eq("id", jobId);
        } catch { /* ignore */ }
      }
    });

    // Keep function alive until fan-out finishes (Deno Deploy: EdgeRuntime.waitUntil).
    // @ts-ignore — EdgeRuntime is provided by the Supabase Edge runtime.
    if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
      // @ts-ignore
      EdgeRuntime.waitUntil(work);
    }

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
