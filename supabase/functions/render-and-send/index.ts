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
    attachments?: { brochure?: boolean; floor_plans?: boolean; pricing?: boolean };
    subject_override?: string | null;
    personal_note?: string | null;
  } = {};
  try { body = await req.json(); } catch { /* */ }

  const {
    contact_id,
    template_slug,
    project_slug,
    channel = "email",
    enroll_followup_slug = null,
    dry_run = false,
    attachments = {},
    subject_override = null,
    personal_note = null,
  } = body;

  if (!contact_id || !template_slug || !project_slug) {
    return json({ error: "contact_id, template_slug and project_slug are required" }, 400);
  }
  if (channel === "sms") {
    return json({ ok: false, error: "sms_pending_prompt_3" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: teamAgent } = await supabase
    .from("crm_team")
    .select("slug, email, gmail_address, display_name, presale_snapshot")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  const presaleSnapshot = (teamAgent?.presale_snapshot ?? {}) as Record<string, unknown>;
  const agentSlug =
    (typeof presaleSnapshot.slug === "string" && presaleSnapshot.slug) ||
    teamAgent?.slug ||
    null;
  const agentEmail =
    (typeof presaleSnapshot.email === "string" && presaleSnapshot.email) ||
    teamAgent?.email ||
    teamAgent?.gmail_address ||
    user.email ||
    null;
  const agentName =
    (typeof presaleSnapshot.name === "string" && presaleSnapshot.name) ||
    teamAgent?.display_name ||
    (user.user_metadata as { full_name?: string } | null)?.full_name ||
    user.email ||
    "";

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

  let bridgeProjectSlug = project_slug;
  const { data: projectBySlug } = await supabase
    .from("crm_projects")
    .select("presale_slug")
    .eq("slug", project_slug)
    .maybeSingle();
  if (projectBySlug?.presale_slug) {
    bridgeProjectSlug = projectBySlug.presale_slug;
  }

  // (c) bridge-render-email (POST)
  if (!BRIDGE_URL || !BRIDGE_SECRET || !PRESALE_ANON_KEY) {
    console.error("[render-and-send] bridge env missing", {
      hasUrl: !!BRIDGE_URL, hasSecret: !!BRIDGE_SECRET, hasAnon: !!PRESALE_ANON_KEY,
    });
    return json({ error: "bridge_env_missing" }, 500);
  }
  // Resolve which docs the user toggled on, and pass their URLs to the
  // bridge so its native "YOUR REQUESTED DOCUMENTS" card renders the
  // matching VIEW BROCHURE / VIEW FLOOR PLANS / VIEW PRICING buttons —
  // identical to what Presale Properties sends from its own auto-emails.
  const wantedAttachments = (["brochure", "floor_plans", "pricing"] as const).filter((k) => attachments[k]);
  const resolvedAttachmentsForBridge: Record<string, { url: string; filename: string | null }> = {};
  if (wantedAttachments.length > 0) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/presale-project-assets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ project_slug }),
      });
      const j = await r.json();
      const assets = j?.assets ?? {};
      for (const k of wantedAttachments) {
        const a = assets[k];
        if (a?.url) resolvedAttachmentsForBridge[k] = { url: a.url, filename: a.filename ?? null };
      }
    } catch (e) {
      console.warn("[render-and-send] asset resolve failed", (e as Error).message);
    }
  }

  let renderRes: Response;
  let renderText = "";
  try {
    renderRes = await fetch(`${BRIDGE_URL}/bridge-render-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-secret": BRIDGE_SECRET,
        "Authorization": `Bearer ${PRESALE_ANON_KEY}`,
        "apikey": PRESALE_ANON_KEY,
      },
      body: JSON.stringify({
        // Ask the bridge to render its OWN native template (hero image,
        // project card, CALL NOW, agent footer) instead of merging into
        // our local body_html. We send the slug under several keys so
        // older/newer bridge versions both pick it up. Subject is still
        // forwarded as a soft default — the bridge may override it.
        template_key: template_slug,
        template_slug: template_slug,
        preset: template_slug,
        template: {
          key: template_slug,
          slug: template_slug,
          name: template.name,
          subject: template.subject,
        },
        subject: template.subject,
        contact: {
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          phone: contact.phone,
        },
        recipient: {
          name: [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || null,
          email: contact.email,
        },
        project_slug: bridgeProjectSlug,
        agent_slug: agentSlug,
        agent_id: agentSlug,
        agent_auth_user_id: user.id,
        agent_email: agentEmail,
        agent: {
          slug: agentSlug,
          email: agentEmail,
          display_name: agentName,
        },
        // Tell the bridge which document buttons to render inside its
        // native "Your Requested Documents" card. Both shapes are sent so
        // older/newer bridge versions both pick it up.
        documents: resolvedAttachmentsForBridge,
        requested_documents: {
          brochure: !!resolvedAttachmentsForBridge.brochure,
          floor_plans: !!resolvedAttachmentsForBridge.floor_plans,
          pricing: !!resolvedAttachmentsForBridge.pricing,
        },
        attachments: resolvedAttachmentsForBridge,
      }),
    });
    renderText = await renderRes.text();
  } catch (e) {
    console.error("[render-and-send] bridge fetch threw", e);
    return json({
      error: "bridge_unreachable",
      detail: (e as Error).message,
      bridge_url: BRIDGE_URL,
    }, 502);
  }
  let rendered: { ok?: boolean; subject_rendered?: string; html_rendered?: string; text_rendered?: string; subject?: string; html?: string; text?: string; error?: string } = {};
  try { rendered = renderText ? JSON.parse(renderText) : {}; } catch { /* */ }
  const subject_rendered = rendered.subject_rendered || rendered.subject || template.subject || "";
  const html_rendered = rendered.html_rendered || rendered.html || "";
  const text_rendered = rendered.text_rendered ?? rendered.text ?? "";
  console.log("[render-and-send] bridge ok", {
    status: renderRes.status,
    html_len: html_rendered.length,
    has_hero: html_rendered.includes("<img"),
    has_card: html_rendered.toLowerCase().includes("call now") || html_rendered.toLowerCase().includes("view "),
    keys: Object.keys(rendered),
  });
  if (!renderRes.ok || !html_rendered) {
    console.error("[render-and-send] bridge render failed", { status: renderRes.status, body: renderText.slice(0, 500) });
    return json({
      error: "bridge_render_failed",
      status: renderRes.status,
      body: rendered.error ?? renderText.slice(0, 500),
    }, 502);
  }

  // The bridge already renders the full Presale-styled email — including
  // the "Your Requested Documents" card with VIEW BROCHURE / VIEW FLOOR
  // PLANS / VIEW PRICING buttons (we passed the resolved doc URLs above)
  // and the inline agent block. Nothing to post-process.
  const html_final = html_rendered;

  // (d) dry run — preview only
  if (dry_run) {
    return json({
      ok: true,
      subject: subject_rendered,
      html: html_final,
      text: text_rendered,
      attachments: Object.entries(resolvedAttachmentsForBridge).map(([kind, a]) => ({
        kind,
        url: a.url,
        filename: a.filename,
      })),
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
        body_html: html_final,
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
      body: html_final,
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
      body: html_final,
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
  } catch (e) {
    console.error("[render-and-send] unhandled error", e);
    return json({
      error: "internal_error",
      detail: (e as Error).message,
      stack: (e as Error).stack?.slice(0, 800),
    }, 500);
  }
});
