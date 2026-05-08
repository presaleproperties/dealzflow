// Tick handler for the automation engine.
// Runs every 15 minutes via pg_cron. Authenticates with CRON_SECRET or the
// service_role JWT — rejects all user JWTs.
//
// Per tick: pulls up to 100 active enrollments whose next_step_due_at <= now()
// from crm_automation_enrollments, honors per-step exit conditions, executes
// the step, writes a row to crm_automation_run_log, then advances or
// completes the enrollment.
//
// Supported action_type values:
//   send_email, send_sms, wait, assign_agent, update_status, add_tag,
//   create_task, send_notification, branch_if, ai_draft_email, webhook
//
// Legacy aliases accepted for back-compat: set_status -> update_status,
// set_tag -> add_tag.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const FALLBACK_AGENT_USER_ID = Deno.env.get("FALLBACK_AGENT_USER_ID") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const TICK_LIMIT = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Enrollment {
  id: string;
  automation_id: string;
  contact_id: string;
  project_slug: string | null;
  enrolled_at: string;
  current_step_order: number;
  status: string;
}
interface Step {
  id: string;
  automation_id: string;
  step_order: number;
  delay_hours: number;
  action_type: string;
  action_config: Record<string, unknown> | null;
  exit_condition: string | null;
}
interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  phone_normalized: string | null;
  assigned_to: string | null;
  source: string | null;
  status: string | null;
  tags: string[] | null;
}

function authorize(req: Request): boolean {
  const h = req.headers.get("Authorization") ?? "";
  if (!h.startsWith("Bearer ")) return false;
  const token = h.slice(7).trim();
  if (CRON_SECRET && token === CRON_SECRET) return true;
  if (token === SERVICE_KEY) return true;
  return false;
}

function normalizeAction(t: string): string {
  if (t === "set_status") return "update_status";
  if (t === "set_tag") return "add_tag";
  return t;
}

function substituteMergeTags(input: string, ctx: Record<string, string | null | undefined>): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    const v = ctx[k];
    return v == null ? "" : String(v);
  });
}

function buildCtx(c: Contact): Record<string, string> {
  return {
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    source: c.source ?? "",
    status: c.status ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    agent_name: c.assigned_to ?? "",
  };
}

async function pickActingAgent(
  supabase: ReturnType<typeof createClient>,
  contact: Contact,
): Promise<string | null> {
  if (contact.assigned_to && contact.assigned_to.trim()) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .ilike("full_name", contact.assigned_to.trim())
      .limit(1)
      .maybeSingle();
    if (profile?.user_id) {
      const { data: tok } = await supabase
        .from("gmail_tokens")
        .select("user_id")
        .eq("user_id", profile.user_id)
        .maybeSingle();
      if (tok?.user_id) return tok.user_id;
    }
  }
  if (FALLBACK_AGENT_USER_ID) {
    const { data: tok } = await supabase
      .from("gmail_tokens")
      .select("user_id")
      .eq("user_id", FALLBACK_AGENT_USER_ID)
      .maybeSingle();
    if (tok?.user_id) return tok.user_id;
  }
  return null;
}

async function checkExit(
  supabase: ReturnType<typeof createClient>,
  enrollment: Enrollment,
  step: Step,
): Promise<boolean> {
  if (step.exit_condition === "lead_replied") {
    const { data: email } = await supabase
      .from("crm_email_log")
      .select("id")
      .eq("contact_id", enrollment.contact_id)
      .eq("direction", "inbound")
      .gt("sent_at", enrollment.enrolled_at)
      .limit(1)
      .maybeSingle();
    if (email) return true;
    try {
      const { data: sms } = await supabase
        .from("crm_sms_log")
        .select("id")
        .eq("contact_id", enrollment.contact_id)
        .eq("direction", "inbound")
        .gt("sent_at", enrollment.enrolled_at)
        .limit(1)
        .maybeSingle();
      if (sms) return true;
    } catch { /* best effort */ }
  }
  if (step.exit_condition?.startsWith("status_is:")) {
    const target = step.exit_condition.slice("status_is:".length);
    const { data: c } = await supabase
      .from("crm_contacts").select("status").eq("id", enrollment.contact_id).maybeSingle();
    if (c?.status === target) return true;
  }
  return false;
}

function evaluateBranch(cfg: Record<string, unknown>, c: Contact): boolean {
  const field = String(cfg.field ?? "");
  const op = String(cfg.op ?? "equals");
  const val = String(cfg.value ?? "");
  let actual = "";
  switch (field) {
    case "source": actual = c.source ?? ""; break;
    case "status": actual = c.status ?? ""; break;
    case "has_email": return !!c.email;
    case "has_phone": return !!(c.phone || c.phone_normalized);
    case "tag":
      return (c.tags ?? []).some(t => t.toLowerCase() === val.toLowerCase());
    default: actual = "";
  }
  if (op === "equals") return actual === val;
  if (op === "not_equals") return actual !== val;
  if (op === "contains") return actual.toLowerCase().includes(val.toLowerCase());
  return false;
}

async function executeAction(
  supabase: ReturnType<typeof createClient>,
  step: Step,
  enrollment: Enrollment,
  contact: Contact,
  actingAgentId: string | null,
): Promise<{ ok: boolean; error?: string; payload?: Record<string, unknown> }> {
  const cfg = (step.action_config ?? {}) as Record<string, unknown>;
  const action = normalizeAction(step.action_type);
  const ctx = buildCtx(contact);

  if (action === "send_email") {
    if (!actingAgentId) return { ok: false, error: "no_acting_agent_with_gmail" };
    const templateSlug = (cfg.template_slug as string) || (cfg.template_id as string);
    if (!templateSlug) return { ok: false, error: "missing_template" };
    const res = await fetch(`${SUPABASE_URL}/functions/v1/render-and-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: ANON_KEY,
        "X-Acting-User-Id": actingAgentId,
      },
      body: JSON.stringify({
        contact_id: contact.id,
        template_slug: templateSlug,
        project_slug: enrollment.project_slug ?? "",
        channel: "email",
        dry_run: false,
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return { ok: false, error: out?.error ?? `render_status_${res.status}` };
    return { ok: true, payload: { template_slug: templateSlug } };
  }

  if (action === "send_sms") {
    if (!contact.phone_normalized && !contact.phone) return { ok: false, error: "no_phone" };
    let body = (cfg.body as string) ?? "";
    const templateSlug = cfg.template_slug as string | undefined;
    if (templateSlug) {
      const { data: tpl } = await supabase
        .from("crm_email_templates")
        .select("body_html").eq("slug", templateSlug).maybeSingle();
      body = tpl?.body_html ?? body;
    }
    body = substituteMergeTags(body, ctx);
    if (!body) return { ok: false, error: "empty_sms_body" };
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({
        contact_id: contact.id,
        to: contact.phone_normalized || contact.phone,
        body, channel: "sms", skip_touch: true,
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out?.error) return { ok: false, error: out?.error ?? `sms_status_${res.status}` };
    return { ok: true, payload: { body_preview: body.slice(0, 80) } };
  }

  if (action === "wait") {
    // No-op; the wait is enforced by step.delay_hours when scheduling next step.
    return { ok: true, payload: { note: "wait_passthrough" } };
  }

  if (action === "assign_agent") {
    const agent = (cfg.agent as string) ?? "";
    if (!agent) return { ok: false, error: "missing_agent" };
    const { error } = await supabase
      .from("crm_contacts").update({ assigned_to: agent }).eq("id", contact.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, payload: { assigned_to: agent } };
  }

  if (action === "update_status") {
    const newStatus = cfg.status as string | undefined;
    if (!newStatus) return { ok: false, error: "missing_status" };
    const { error } = await supabase
      .from("crm_contacts")
      .update({ status: newStatus, status_changed_at: new Date().toISOString() })
      .eq("id", contact.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, payload: { status: newStatus } };
  }

  if (action === "add_tag") {
    const rawTag = (cfg.tag as string) ?? "";
    const tag = substituteMergeTags(rawTag, ctx).trim();
    if (!tag) return { ok: false, error: "empty_tag" };
    const existing = contact.tags ?? [];
    if (existing.some(t => t.toLowerCase() === tag.toLowerCase())) return { ok: true, payload: { tag, dedup: true } };
    const { error } = await supabase
      .from("crm_contacts").update({ tags: [...existing, tag] }).eq("id", contact.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, payload: { tag } };
  }

  if (action === "create_task") {
    const title = substituteMergeTags((cfg.title as string) ?? "Follow up", ctx);
    const dueDays = Number(cfg.due_days ?? 3);
    const due = new Date(Date.now() + dueDays * 86400_000).toISOString();
    try {
      const { error } = await supabase.from("crm_tasks").insert({
        contact_id: contact.id, title, due_at: due, status: "open",
        assigned_to: contact.assigned_to,
      });
      if (error) return { ok: false, error: error.message };
    } catch (e) { return { ok: false, error: String(e) }; }
    return { ok: true, payload: { title, due_at: due } };
  }

  if (action === "send_notification") {
    const message = substituteMergeTags((cfg.message as string) ?? "Automation update", ctx);
    try {
      const { data: rec } = await supabase.rpc("crm_recipients_for_contact" as never, {
        p_contact_id: contact.id,
      } as never);
      const recipients = (rec as string[] | null) ?? [];
      if (recipients.length > 0) {
        await supabase.from("notifications").insert(
          recipients.map((uid) => ({
            user_id: uid, title: "Automation", body: message,
            data: { contact_id: contact.id, automation_id: enrollment.automation_id },
          }))
        );
      }
    } catch (e) { return { ok: false, error: String(e) }; }
    return { ok: true, payload: { message } };
  }

  if (action === "branch_if") {
    const truthy = evaluateBranch(cfg, contact);
    return { ok: true, payload: { branch: truthy ? "yes" : "no" } };
  }

  if (action === "ai_draft_email") {
    if (!LOVABLE_API_KEY) return { ok: false, error: "missing_lovable_api_key" };
    const goal = substituteMergeTags((cfg.goal as string) ?? "Personalized warm follow-up", ctx);
    const sys = "You are a real-estate agent assistant. Draft a short, warm, personalized email body (no greeting line, no signature). Plain text. <120 words.";
    const usr = `Goal: ${goal}\nLead: ${ctx.name || "(unknown)"}\nSource: ${ctx.source}\nStatus: ${ctx.status}`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
      }),
    });
    if (!res.ok) return { ok: false, error: `ai_status_${res.status}` };
    const out = await res.json().catch(() => ({}));
    const draft = out?.choices?.[0]?.message?.content ?? "";
    if (!draft) return { ok: false, error: "ai_empty" };
    try {
      await supabase.from("crm_notes").insert({
        contact_id: contact.id,
        body: `[AI draft email]\n\n${draft}`,
        source: "automation",
      });
    } catch { /* best effort */ }
    return { ok: true, payload: { draft_preview: String(draft).slice(0, 120) } };
  }

  if (action === "webhook") {
    const url = cfg.url as string | undefined;
    if (!url) return { ok: false, error: "missing_url" };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "automation_step",
          automation_id: enrollment.automation_id,
          enrollment_id: enrollment.id,
          contact: {
            id: contact.id, first_name: contact.first_name, last_name: contact.last_name,
            email: contact.email, phone: contact.phone, source: contact.source,
            status: contact.status, tags: contact.tags, assigned_to: contact.assigned_to,
          },
        }),
      });
      return { ok: res.ok, error: res.ok ? undefined : `webhook_status_${res.status}`, payload: { status: res.status } };
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  return { ok: false, error: `unsupported_action:${action}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authorize(req)) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Optional override of TICK_LIMIT via body (for "Run now" tests).
  let tickLimit = TICK_LIMIT;
  let onlyEnrollmentId: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.limit === "number") tickLimit = Math.min(500, Math.max(1, body.limit));
      if (typeof body?.enrollment_id === "string") onlyEnrollmentId = body.enrollment_id;
    }
  } catch { /* ignore */ }

  const nowIso = new Date().toISOString();

  let dueQuery = supabase
    .from("crm_automation_enrollments")
    .select("id, automation_id, contact_id, project_slug, enrolled_at, current_step_order, status")
    .eq("status", "active")
    .order("next_step_due_at", { ascending: true })
    .limit(tickLimit);

  if (onlyEnrollmentId) {
    dueQuery = dueQuery.eq("id", onlyEnrollmentId);
  } else {
    dueQuery = dueQuery.lte("next_step_due_at", nowIso);
  }

  const { data: due, error: dueErr } = await dueQuery;
  if (dueErr) return json({ error: "fetch_due_failed", details: dueErr.message }, 500);

  let processed = 0, advanced = 0, completed = 0, exited = 0, errors = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const row of (due ?? []) as Enrollment[]) {
    processed++;
    const automationId = row.automation_id;

    const { data: step } = await supabase
      .from("crm_automation_steps")
      .select("id, automation_id, step_order, delay_hours, action_type, action_config, exit_condition")
      .eq("automation_id", automationId)
      .eq("step_order", row.current_step_order)
      .maybeSingle();

    if (!step) {
      await supabase.from("crm_automation_enrollments")
        .update({ status: "completed", exited_at: nowIso, exit_reason: "no_step" })
        .eq("id", row.id);
      completed++;
      continue;
    }

    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("id, first_name, last_name, email, phone, phone_normalized, assigned_to, source, status, tags")
      .eq("id", row.contact_id)
      .maybeSingle();
    if (!contact) {
      await supabase.from("crm_automation_enrollments")
        .update({ status: "exited", exited_at: nowIso, exit_reason: "contact_missing" })
        .eq("id", row.id);
      exited++;
      continue;
    }

    if (await checkExit(supabase, row, step as Step)) {
      await supabase.from("crm_automation_enrollments")
        .update({ status: "exited", exited_at: nowIso, exit_reason: step.exit_condition })
        .eq("id", row.id);
      exited++;
      continue;
    }

    const actingAgentId = await pickActingAgent(supabase, contact as Contact);
    const result = await executeAction(supabase, step as Step, row, contact as Contact, actingAgentId);

    // Always log the run
    await supabase.from("crm_automation_run_log").insert({
      enrollment_id: row.id,
      automation_id: automationId,
      contact_id: row.contact_id,
      step_order: row.current_step_order,
      action_type: normalizeAction(step.action_type),
      action_result: result.ok ? "success" : "error",
      error_message: result.error ?? null,
      payload: result.payload ?? null,
    });

    if (!result.ok) {
      errors++;
      // Push 1h, keep active to retry
      await supabase.from("crm_automation_enrollments")
        .update({ next_step_due_at: new Date(Date.now() + 60 * 60_000).toISOString() })
        .eq("id", row.id);
      results.push({ id: row.id, action: step.action_type, error: result.error });
      continue;
    }

    // Advance: find next step (branch_if respects branch label in payload)
    let nextOrder = row.current_step_order + 1;
    if (normalizeAction(step.action_type) === "branch_if") {
      const branch = (result.payload?.branch as string) ?? "yes";
      // Convention: yes-branch is the immediate next step; no-branch jumps +2
      if (branch === "no") nextOrder = row.current_step_order + 2;
    }

    const { data: nextStep } = await supabase
      .from("crm_automation_steps")
      .select("step_order, delay_hours")
      .eq("automation_id", automationId)
      .eq("step_order", nextOrder)
      .maybeSingle();

    if (nextStep) {
      const dueAt = new Date(Date.now() + (nextStep.delay_hours ?? 0) * 60 * 60_000).toISOString();
      await supabase.from("crm_automation_enrollments")
        .update({ current_step_order: nextStep.step_order, next_step_due_at: dueAt })
        .eq("id", row.id);
      advanced++;
    } else {
      await supabase.from("crm_automation_enrollments")
        .update({ status: "completed", exited_at: nowIso, exit_reason: "all_steps_done" })
        .eq("id", row.id);
      completed++;
    }

    const { data: aRow } = await supabase
      .from("crm_automations").select("runs_count").eq("id", automationId).maybeSingle();
    await supabase.from("crm_automations")
      .update({ runs_count: (aRow?.runs_count ?? 0) + 1, last_run_at: nowIso })
      .eq("id", automationId);

    results.push({ id: row.id, action: step.action_type, ok: true });
  }

  return json({ ok: true, tick_at: nowIso, processed, advanced, completed, exited, errors, results });
});
