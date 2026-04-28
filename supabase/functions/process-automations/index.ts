// Tick handler for the automation engine.
// Runs every 15 minutes via pg_cron. Authenticates with CRON_SECRET or the
// service_role JWT — rejects all user JWTs.
//
// Per tick: pulls up to 100 active enrollments whose next_step_due_at <= now(),
// honors exit conditions (lead replied), executes the current step, then
// either advances to the next step or marks the enrollment completed.
//
// All sends pass through render-and-send (email) or send-sms (sms) and the
// `app.skip_touch=on` GUC is set so automation activity does NOT update the
// contact's last_touch_at (per project memory: that field is for human acts).
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

// Tiny merge-tag substitution: {{first_name}}, {{source}}, etc.
function substituteMergeTags(input: string, ctx: Record<string, string | null | undefined>): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    const v = ctx[k];
    return v == null ? "" : String(v);
  });
}

async function pickActingAgent(
  supabase: ReturnType<typeof createClient>,
  contact: Contact,
): Promise<string | null> {
  // Try contact.assigned_to → profiles.full_name → user with gmail_tokens
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
    // Inbound email since enrollment?
    const { data: email } = await supabase
      .from("crm_email_log")
      .select("id")
      .eq("contact_id", enrollment.contact_id)
      .eq("direction", "inbound")
      .gt("sent_at", enrollment.enrolled_at)
      .limit(1)
      .maybeSingle();
    if (email) return true;
    // Inbound sms since enrollment?
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
    } catch { /* table may differ — best effort */ }
  }
  return false;
}

async function executeAction(
  supabase: ReturnType<typeof createClient>,
  step: Step,
  enrollment: Enrollment,
  contact: Contact,
  actingAgentId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = step.action_config ?? {};

  if (step.action_type === "send_email") {
    if (!actingAgentId) return { ok: false, error: "no_acting_agent_with_gmail" };
    const templateSlug = (cfg as { template_slug?: string }).template_slug;
    if (!templateSlug) return { ok: false, error: "missing_template_slug" };
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
        enroll_followup_slug: null,
        dry_run: false,
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return { ok: false, error: out?.error ?? `render_status_${res.status}` };
    return { ok: true };
  }

  if (step.action_type === "send_sms") {
    if (!contact.phone_normalized && !contact.phone) return { ok: false, error: "no_phone" };
    // Pull template body if a slug is given; otherwise use action_config.body
    let body = (cfg as { body?: string }).body ?? "";
    const templateSlug = (cfg as { template_slug?: string }).template_slug;
    if (templateSlug) {
      const { data: tpl } = await supabase
        .from("crm_email_templates")
        .select("body_html, subject")
        .eq("slug", templateSlug)
        .maybeSingle();
      // SMS templates are stored in same table with plain text in body_html
      body = tpl?.body_html ?? body;
    }
    body = substituteMergeTags(body, {
      first_name: contact.first_name,
      last_name: contact.last_name,
      source: contact.source,
    });
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
        body,
        channel: "sms",
        skip_touch: true,
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out?.error) return { ok: false, error: out?.error ?? `sms_status_${res.status}` };
    return { ok: true };
  }

  if (step.action_type === "set_tag") {
    const rawTag = (cfg as { tag?: string }).tag ?? "";
    const tag = substituteMergeTags(rawTag, {
      source: contact.source,
      first_name: contact.first_name,
      status: contact.status,
    }).trim();
    if (!tag) return { ok: false, error: "empty_tag" };
    const existing = contact.tags ?? [];
    if (existing.some(t => t.toLowerCase() === tag.toLowerCase())) return { ok: true };
    const { error } = await supabase
      .from("crm_contacts")
      .update({ tags: [...existing, tag] })
      .eq("id", contact.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (step.action_type === "set_status") {
    const newStatus = (cfg as { status?: string }).status;
    if (!newStatus) return { ok: false, error: "missing_status" };
    const { error } = await supabase
      .from("crm_contacts")
      .update({ status: newStatus, status_changed_at: new Date().toISOString() })
      .eq("id", contact.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  return { ok: false, error: `unsupported_action:${step.action_type}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authorize(req)) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Tell triggers downstream NOT to bump last_touch_at — automation = bot.
  // (Best-effort; ignored if the GUC isn't whitelisted at the connection level.)
  try {
    await supabase.rpc("set_config" as never, {
      setting_name: "app.skip_touch",
      new_value: "on",
      is_local: true,
    } as never);
  } catch { /* RPC not exposed — sends still succeed, last_touch may flip */ }

  const nowIso = new Date().toISOString();

  // Pull due active enrollments
  const { data: due, error: dueErr } = await supabase
    .from("crm_automation_logs")
    .select("id, automation_id, contact_id, project_slug, enrolled_at, current_step_order, status")
    .eq("status", "active")
    .lte("next_step_due_at", nowIso)
    .order("next_step_due_at", { ascending: true })
    .limit(TICK_LIMIT);

  if (dueErr) return json({ error: "fetch_due_failed", details: dueErr.message }, 500);

  let processed = 0, advanced = 0, completed = 0, exited = 0, errors = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const row of (due ?? []) as Enrollment[]) {
    processed++;
    const automationId = row.automation_id;

    // Step
    const { data: step } = await supabase
      .from("crm_automation_steps")
      .select("id, automation_id, step_order, delay_hours, action_type, action_config, exit_condition")
      .eq("automation_id", automationId)
      .eq("step_order", row.current_step_order)
      .maybeSingle();

    if (!step) {
      await supabase.from("crm_automation_logs")
        .update({ status: "completed", exited_at: nowIso, exit_reason: "no_step" })
        .eq("id", row.id);
      completed++;
      continue;
    }

    // Contact
    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("id, first_name, last_name, email, phone, phone_normalized, assigned_to, source, status, tags")
      .eq("id", row.contact_id)
      .maybeSingle();
    if (!contact) {
      await supabase.from("crm_automation_logs")
        .update({ status: "exited", exited_at: nowIso, exit_reason: "contact_missing" })
        .eq("id", row.id);
      exited++;
      continue;
    }

    // Exit-condition check
    const shouldExit = await checkExit(supabase, row, step as Step);
    if (shouldExit) {
      await supabase.from("crm_automation_logs")
        .update({ status: "exited", exited_at: nowIso, exit_reason: step.exit_condition })
        .eq("id", row.id);
      exited++;
      continue;
    }

    const actingAgentId = await pickActingAgent(supabase, contact as Contact);

    // Execute
    const result = await executeAction(supabase, step as Step, row, contact as Contact, actingAgentId);

    if (!result.ok) {
      errors++;
      await supabase.from("crm_automation_logs")
        .insert({
          automation_id: automationId,
          contact_id: row.contact_id,
          action_result: "failed",
          error_message: result.error,
          trigger_data: { enrollment_id: row.id, step_order: row.current_step_order },
        });
      // Keep enrollment active but push next attempt 1h forward to avoid hammering
      await supabase.from("crm_automation_logs")
        .update({ next_step_due_at: new Date(Date.now() + 60 * 60_000).toISOString() })
        .eq("id", row.id);
      results.push({ id: row.id, action: step.action_type, error: result.error });
      continue;
    }

    // Advance: find next step
    const { data: nextStep } = await supabase
      .from("crm_automation_steps")
      .select("step_order, delay_hours")
      .eq("automation_id", automationId)
      .eq("step_order", row.current_step_order + 1)
      .maybeSingle();

    if (nextStep) {
      const due = new Date(
        new Date(row.enrolled_at).getTime() + (nextStep.delay_hours ?? 0) * 60 * 60_000,
      ).toISOString();
      await supabase.from("crm_automation_logs")
        .update({ current_step_order: nextStep.step_order, next_step_due_at: due })
        .eq("id", row.id);
      advanced++;
    } else {
      await supabase.from("crm_automation_logs")
        .update({ status: "completed", exited_at: nowIso, exit_reason: "all_steps_done" })
        .eq("id", row.id);
      completed++;
    }

    // Bump automation counters (separate row — append-only audit log)
    await supabase.rpc("noop" as never, {} as never).catch(() => {});
    await supabase.from("crm_automations")
      .update({
        runs_count: (await supabase.from("crm_automations").select("runs_count").eq("id", automationId).maybeSingle()).data?.runs_count != null
          ? ((await supabase.from("crm_automations").select("runs_count").eq("id", automationId).maybeSingle()).data!.runs_count as number) + 1
          : 1,
        last_run_at: nowIso,
      })
      .eq("id", automationId);

    results.push({ id: row.id, action: step.action_type, ok: true });
  }

  return json({
    ok: true,
    tick_at: nowIso,
    processed, advanced, completed, exited, errors,
    results,
  });
});
