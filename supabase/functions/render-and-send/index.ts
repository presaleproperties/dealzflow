// Render a branded email via Presale's bridge-render-email and send it
// through the agent's own Gmail (gmail-actions). Logs to crm_email_log,
// updates last_touch on the contact, and optionally enrolls the lead in a
// follow-up automation.
//
// Auth: requires a signed-in CRM user JWT.
// POST body:
// {
//   contact_id: uuid,
//   template_slug: string,
//   project_slug: string,
//   channel?: "email" | "sms",
//   enroll_followup_slug?: string | null,
//   dry_run?: boolean
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BRIDGE_URL = Deno.env.get("PRESALE_BRIDGE_URL");
const BRIDGE_SECRET = Deno.env.get("PRESALE_BRIDGE_SECRET");
const PRESALE_ANON_KEY = Deno.env.get("PRESALE_ANON_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }

    const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      console.error("[render-and-send] auth error", userErr);
      return json({ error: "unauthorized", detail: userErr?.message }, 401);
    }
    const user = userData.user;

  let body: {
    contact_id?: string;
    template_slug?: string;
    project_slug?: string;
    channel?: "email" | "sms";
    enroll_followup_slug?: string | null;
    dry_run?: boolean;
  } = {};
  try { body = await req.json(); } catch { /* */ }

  const {
    contact_id,
    template_slug,
    project_slug,
    channel = "email",
    enroll_followup_slug = null,
    dry_run = false,
  } = body;

  if (!contact_id || !template_slug || !project_slug) {
    return json({ error: "contact_id, template_slug and project_slug are required" }, 400);
  }
  if (channel === "sms") {
    return json({ ok: false, error: "sms_pending_prompt_3" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // (a) contact
  const { data: contact, error: contactErr } = await supabase
    .from("crm_contacts")
    .select("id, first_name, last_name, email, phone, phone_normalized, assigned_to")
    .eq("id", contact_id)
    .maybeSingle();
  if (contactErr || !contact) return json({ error: "contact_not_found" }, 404);
  if (!contact.email && channel === "email") {
    return json({ error: "contact_has_no_email" }, 400);
  }

  // (b) template
  const { data: template, error: templateErr } = await supabase
    .from("crm_email_templates")
    .select("id, name, subject, body_html, merge_tags")
    .eq("slug", template_slug)
    .maybeSingle();
  if (templateErr || !template) return json({ error: "template_not_found" }, 404);

  // (c) bridge-render-email (POST)
  if (!BRIDGE_URL || !BRIDGE_SECRET || !PRESALE_ANON_KEY) {
    return json({ error: "bridge_env_missing" }, 500);
  }
  const renderRes = await fetch(`${BRIDGE_URL}/bridge-render-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bridge-secret": BRIDGE_SECRET,
      "Authorization": `Bearer ${PRESALE_ANON_KEY}`,
      "apikey": PRESALE_ANON_KEY,
    },
    body: JSON.stringify({
      template: {
        name: template.name,
        subject: template.subject,
        body_html: template.body_html,
      },
      contact: {
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        phone: contact.phone,
      },
      project_slug,
      agent: {
        display_name: contact.assigned_to ||
          (user.user_metadata as { full_name?: string } | null)?.full_name ||
          user.email || "",
      },
    }),
  });
  const renderText = await renderRes.text();
  let rendered: { ok?: boolean; subject_rendered?: string; html_rendered?: string; text_rendered?: string; error?: string } = {};
  try { rendered = renderText ? JSON.parse(renderText) : {}; } catch { /* */ }
  if (!renderRes.ok || !rendered.html_rendered) {
    return json({
      error: "bridge_render_failed",
      status: renderRes.status,
      body: rendered.error ?? renderText.slice(0, 500),
    }, 502);
  }

  const subject_rendered = rendered.subject_rendered || template.subject || "";
  const html_rendered = rendered.html_rendered;
  const text_rendered = rendered.text_rendered ?? "";

  // (d) dry run — preview only
  if (dry_run) {
    return json({
      ok: true,
      subject: subject_rendered,
      html: html_rendered,
      text: text_rendered,
    });
  }

  // (e) send via gmail-actions (forwards user's JWT so user_id = auth.uid())
  let gmail_message_id: string | null = null;
  let gmail_thread_id: string | null = null;
  let sendError: string | null = null;
  try {
    const gmailRes = await fetch(`${SUPABASE_URL}/functions/v1/gmail-actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({
        action: "send_reply",
        to: contact.email,
        subject: subject_rendered,
        body_html: html_rendered,
        contact_id,
      }),
    });
    const gmailJson = await gmailRes.json();
    if (!gmailRes.ok || gmailJson.error) {
      sendError = gmailJson.error || `gmail_status_${gmailRes.status}`;
    } else {
      gmail_message_id = gmailJson.gmail_message_id ?? null;
      gmail_thread_id = gmailJson.gmail_thread_id ?? null;
    }
  } catch (e) {
    sendError = (e as Error).message;
  }

  if (sendError) {
    // (failure log) — best-effort insert with metadata in subject prefix
    await supabase.from("crm_email_log").insert({
      contact_id,
      user_id: user.id,
      subject: `[FAILED] ${subject_rendered}`,
      body: html_rendered,
      sent_at: new Date().toISOString(),
      direction: "outbound",
    });
    return json({ ok: false, error: sendError }, 500);
  }

  // (f) success log
  const { data: logRow, error: logErr } = await supabase
    .from("crm_email_log")
    .insert({
      contact_id,
      user_id: user.id,
      subject: subject_rendered,
      body: html_rendered,
      sent_at: new Date().toISOString(),
      direction: "outbound",
      gmail_message_id,
      gmail_thread_id,
    })
    .select("id")
    .single();
  if (logErr) console.error("crm_email_log insert error", logErr);

  // (g) human send — touch the contact
  await supabase
    .from("crm_contacts")
    .update({
      last_touch_at: new Date().toISOString(),
      last_touch_type: "email_human",
      last_contact_at: new Date().toISOString(),
    })
    .eq("id", contact_id);

  // (h) optional follow-up enrollment
  let enrolled = false;
  if (enroll_followup_slug) {
    // Match by slug-like name; crm_automations has no slug column yet, fall
    // back to matching the lower-cased name. If the automation isn't seeded
    // yet (Prompt 3), silently skip.
    const { data: automation } = await supabase
      .from("crm_automations")
      .select("id, is_active")
      .or(
        `name.eq.${enroll_followup_slug},name.ilike.${enroll_followup_slug.replace(/-/g, " ")}`,
      )
      .limit(1)
      .maybeSingle();
    if (automation?.id) {
      const { error: enrollErr } = await supabase
        .from("crm_automation_logs")
        .insert({
          automation_id: automation.id,
          contact_id,
          trigger_data: {
            project_slug,
            template_slug,
            enrolled_via: "render-and-send",
          },
        });
      if (!enrollErr) enrolled = true;
    }
  }

  return json({
    ok: true,
    message_id: logRow?.id ?? null,
    external_id: gmail_message_id,
    enrolled,
  });
});
