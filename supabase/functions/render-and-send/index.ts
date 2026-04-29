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
        // Bridge uses `recipient.name` to render "Hi {first}," in the greeting.
        // Without this it falls back to "Hi there,".
        recipient: {
          name: [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || null,
          email: contact.email,
        },
        project_slug: bridgeProjectSlug,
        // Prefer the Presale agent identity synced into crm_team; auth email/id
        // often differs from the Presale agent record and causes 404s.
        agent_slug: agentSlug,
        agent_id: agentSlug,
        agent_auth_user_id: user.id,
        agent_email: agentEmail,
        agent: {
          slug: agentSlug,
          email: agentEmail,
          display_name: agentName,
        },
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
  if (!renderRes.ok || !html_rendered) {
    console.error("[render-and-send] bridge render failed", { status: renderRes.status, body: renderText.slice(0, 500) });
    return json({
      error: "bridge_render_failed",
      status: renderRes.status,
      body: rendered.error ?? renderText.slice(0, 500),
    }, 502);
  }

  // (c.5) Post-process: swap Presale auto-signature with the agent's CRM
  // signature, and inject an "Attachments" section if any toggles are on.
  let html_final = html_rendered;

  // — Resolve the agent's CRM signature (default signature → fallback to legacy)
  let agentSignatureHtml = "";
  try {
    const { data: sigRow } = await supabase
      .from("crm_email_signatures")
      .select("html, is_default")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sigRow?.html && sigRow.html.trim()) {
      agentSignatureHtml = sigRow.html;
    } else {
      const { data: settings } = await supabase
        .from("crm_email_settings")
        .select("signature_html")
        .eq("user_id", user.id)
        .maybeSingle();
      if (settings?.signature_html?.trim()) agentSignatureHtml = settings.signature_html;
    }
  } catch (e) {
    console.warn("[render-and-send] signature lookup failed", (e as Error).message);
  }

  // — Strip Presale's trailing signature & branding strip, replace with ours.
  // The bridge wraps the signature in a section we can target reliably; we also
  // fall back to a generic "agent block" trim if markers change.
  if (agentSignatureHtml) {
    // Drop everything from the first known signature marker onward, then close.
    const markers = [
      /<table[^>]*data-presale-signature[\s\S]*$/i,
      /<div[^>]*data-presale-signature[\s\S]*$/i,
      /<!--\s*presale:signature\s*-->[\s\S]*$/i,
      /<table[^>]*class="[^"]*signature[^"]*"[\s\S]*$/i,
    ];
    let stripped = html_final;
    for (const rx of markers) {
      if (rx.test(stripped)) { stripped = stripped.replace(rx, ""); break; }
    }
    // Re-close any open tags conservatively, then append CRM signature + close.
    const closing = /<\/body>|<\/html>/i.test(stripped) ? "" : "";
    const signatureBlock =
      `<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;">` +
      agentSignatureHtml +
      `</div>`;
    if (/<\/body\s*>/i.test(stripped)) {
      html_final = stripped.replace(/<\/body\s*>/i, `${signatureBlock}</body>`);
    } else {
      html_final = `${stripped}${signatureBlock}${closing}`;
    }
  }

  // — Resolve and inject attachment links
  const wantedAttachments = (["brochure", "floor_plans", "pricing"] as const).filter((k) => attachments[k]);
  const resolvedAttachments: { kind: string; label: string; url: string; filename: string | null }[] = [];
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
      const labels: Record<string, string> = {
        brochure: "Brochure",
        floor_plans: "Floor Plans",
        pricing: "Pricing Sheet",
      };
      for (const k of wantedAttachments) {
        const a = assets[k];
        if (a?.url) resolvedAttachments.push({ kind: k, label: labels[k], url: a.url, filename: a.filename });
      }
    } catch (e) {
      console.warn("[render-and-send] asset resolve failed", (e as Error).message);
    }
  }

  if (resolvedAttachments.length > 0) {
    const items = resolvedAttachments.map((a) =>
      `<tr><td style="padding:8px 0;">` +
        `<a href="${a.url}" style="display:inline-block;padding:10px 14px;border:1px solid #D7A542;border-radius:6px;color:#111;background:#fff;text-decoration:none;font-weight:600;font-size:13px;">` +
        `📎 ${a.label}${a.filename ? ` <span style="color:#666;font-weight:400;">— ${a.filename}</span>` : ""}` +
        `</a>` +
      `</td></tr>`
    ).join("");
    const attachBlock =
      `<div style="margin:24px 0 8px;font-family:Arial,Helvetica,sans-serif;">` +
        `<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#666;margin-bottom:8px;">Attached</div>` +
        `<table cellpadding="0" cellspacing="0" border="0">${items}</table>` +
      `</div>`;
    // Insert before the signature block we appended (or before </body> as a fallback)
    if (/<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;/i.test(html_final)) {
      html_final = html_final.replace(
        /(<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;)/i,
        `${attachBlock}$1`,
      );
    } else if (/<\/body\s*>/i.test(html_final)) {
      html_final = html_final.replace(/<\/body\s*>/i, `${attachBlock}</body>`);
    } else {
      html_final = `${html_final}${attachBlock}`;
    }
  }

  // (d) dry run — preview only
  if (dry_run) {
    return json({
      ok: true,
      subject: subject_rendered,
      html: html_final,
      text: text_rendered,
      attachments: resolvedAttachments,
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
