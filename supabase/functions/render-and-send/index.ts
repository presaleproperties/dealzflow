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
const BRIDGE_SECRET = Deno.env.get("BRIDGE_SECRET") ?? Deno.env.get("PRESALE_BRIDGE_SECRET");
const PRESALE_ANON_KEY = Deno.env.get("PRESALE_ANON_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ───────── Helpers ─────────────────────────────────────────────────────────
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render the agent's personal note as a styled block. Returns "" if blank.
 *  Designed to feel integrated with the project hero card below it — soft
 *  warm tint, no harsh rail, eyebrow label "A note from {first name}", and
 *  a -8px bottom margin so it visually connects to the hero image.
 */
function renderPersonalNoteBlock(note: string | null | undefined, agentFirstName?: string | null): string {
  const clean = (note ?? "").trim();
  if (!clean) return "";
  // Strip any HTML the agent might have pasted, keep paragraph breaks.
  const stripped = clean
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  const paragraphs = stripped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 10px;line-height:1.6;color:#1f2937;font-size:15px;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("")
    .replace(/<p([^>]*)>(?![\s\S]*<p)/, '<p$1 style="margin:0;line-height:1.6;color:#1f2937;font-size:15px;">'); // last <p> no bottom margin
  const eyebrow = agentFirstName
    ? `A note from ${escapeHtml(agentFirstName)}`
    : `A personal note`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 -10px;">
    <tr><td style="background:#FBF8F2;border:1px solid #EFE6D2;border-bottom:none;border-radius:10px 10px 0 0;padding:18px 22px 22px;font-family:Helvetica,Arial,sans-serif;">
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9A7A2E;font-weight:600;margin:0 0 8px;">${eyebrow}</div>
      ${paragraphs}
    </td></tr>
  </table>`;
}

/** Inject the personal-note block into the rendered email HTML.
 *  Placement contract: after the project hero + body copy, immediately
 *  before the first CTA-bearing table (View Project Details / Call Now /
 *  Brochure / Floor Plans / Pricing / Calendly / Book). Falls back to the
 *  legacy "before first table" behavior if no CTA table is found. */
const CTA_HREF_RE = /(?:^tel:|presaleproperties\.com\/projects?\/|calendly\.com|\/(brochure|floor[-_ ]?plan|pricing|book)|\.pdf(?:$|\?))/i;
const CTA_LABEL_RE = /(view\s+project\s+details?|call\s+now|view\s+brochure|view\s+floor\s*plans?|view\s+pricing|book\s+(a\s+)?(call|tour|meeting)|schedule)/i;

function findFirstCtaTableIdx(html: string): number {
  const lower = html.toLowerCase();
  let cursor = 0;
  while (cursor < lower.length) {
    const tOpen = lower.indexOf("<table", cursor);
    if (tOpen < 0) return -1;
    // Find matching </table> respecting nesting.
    let depth = 0;
    let i = tOpen;
    let end = -1;
    while (i < lower.length) {
      const nextOpen = lower.indexOf("<table", i + 1);
      const nextClose = lower.indexOf("</table>", i + 1);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) { depth++; i = nextOpen; }
      else {
        if (depth === 0) { end = nextClose + "</table>".length; break; }
        depth--; i = nextClose;
      }
    }
    if (end < 0) return -1;
    const block = html.slice(tOpen, end);
    const aRe = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = aRe.exec(block)) !== null) {
      const href = m[1];
      const label = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (CTA_HREF_RE.test(href) || CTA_LABEL_RE.test(label)) return tOpen;
    }
    cursor = end;
  }
  return -1;
}

function injectPersonalNote(html: string, noteHtml: string): string {
  if (!noteHtml) return html;
  const ctaIdx = findFirstCtaTableIdx(html);
  if (ctaIdx > 0) {
    return html.slice(0, ctaIdx) + noteHtml + html.slice(ctaIdx);
  }
  // Fallback: before first table inside <body> (legacy behavior).
  const bodyOpen = html.search(/<body[^>]*>/i);
  if (bodyOpen >= 0) {
    const afterBodyOpen = html.indexOf(">", bodyOpen) + 1;
    const tableIdx = html.toLowerCase().indexOf("<table", afterBodyOpen);
    if (tableIdx > 0) return html.slice(0, tableIdx) + noteHtml + html.slice(tableIdx);
    return html.slice(0, afterBodyOpen) + noteHtml + html.slice(afterBodyOpen);
  }
  return noteHtml + html;
}

/** Convert HTML → plain text for multipart fallback. Preserves links as
 *  "text (url)" and keeps paragraph breaks. */
/** Remove the smallest <table>…</table> block that contains an <a> whose
 *  href OR inner text matches the predicate. Used to strip CTA buttons
 *  (Project Details / Call Now / etc.) when toggled off in the composer. */
function stripButtonBy(
  html: string,
  match: (href: string, label: string) => boolean,
): string {
  let result = html;
  for (let pass = 0; pass < 8; pass++) {
    const lower = result.toLowerCase();
    const aRe = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    let removedThisPass = false;
    while ((m = aRe.exec(result)) !== null) {
      const href = m[1];
      const label = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (!match(href, label)) continue;
      const aStart = m.index;
      const tableOpenIdx = lower.lastIndexOf("<table", aStart);
      if (tableOpenIdx < 0) continue;
      let depth = 0;
      let i = tableOpenIdx;
      let end = -1;
      while (i < lower.length) {
        const nextOpen = lower.indexOf("<table", i + 1);
        const nextClose = lower.indexOf("</table>", i + 1);
        if (nextClose < 0) break;
        if (nextOpen >= 0 && nextOpen < nextClose) { depth++; i = nextOpen; }
        else {
          if (depth === 0) { end = nextClose + "</table>".length; break; }
          depth--; i = nextClose;
        }
      }
      if (end < 0) continue;
      result = result.slice(0, tableOpenIdx) + result.slice(end);
      removedThisPass = true;
      break;
    }
    if (!removedThisPass) break;
  }
  return result;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<a [^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, txt) => {
      const cleanTxt = txt.replace(/<[^>]+>/g, "").trim();
      return cleanTxt && cleanTxt !== href ? `${cleanTxt} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    ctas?: { brochure?: boolean; project_details?: boolean; call_now?: boolean };
    cta_overrides?: { brochure_url?: string | null; project_details_url?: string | null };
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
    ctas = {},
    cta_overrides = {},
    subject_override = null,
    personal_note = null,
  } = body;
  const ctaBrochure = ctas.brochure !== false;
  const ctaProjectDetails = ctas.project_details !== false;
  const ctaCallNow = ctas.call_now !== false;
  const sanitizeUrl = (u: unknown): string | null => {
    if (typeof u !== "string") return null;
    const t = u.trim();
    if (!t) return null;
    if (!/^https?:\/\//i.test(t)) return null;
    return t;
  };
  const brochureUrlOverride = sanitizeUrl(cta_overrides.brochure_url);
  const projectDetailsUrlOverride = sanitizeUrl(cta_overrides.project_details_url);

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
  // Email → Presale agent_slug map (per Presale auto-templates spec).
  // Used as a safety net so the auto-template signature is always the
  // correct agent even if presale_snapshot.slug isn't seeded yet.
  const EMAIL_TO_PRESALE_SLUG: Record<string, string> = {
    "info@meetuzair.com": "uzair-muhammad-prec",
    "ravish@presaleproperties.com": "ravish-passy",
    "sarb@presaleproperties.com": "sarb-grewal",
    "admin@presaleproperties.com": "zara-malik",
  };
  const senderEmailLc = (
    (typeof presaleSnapshot.email === "string" && presaleSnapshot.email) ||
    teamAgent?.email ||
    teamAgent?.gmail_address ||
    user.email ||
    ""
  ).toLowerCase();
  const agentSlug =
    (typeof presaleSnapshot.slug === "string" && presaleSnapshot.slug) ||
    teamAgent?.slug ||
    EMAIL_TO_PRESALE_SLUG[senderEmailLc] ||
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

  // (b) template — auto-templates served by Presale do NOT live in
  // crm_email_templates (they're rendered remotely). For everything else
  // we need the local row for subject/body fallbacks.
  const AUTO_TEMPLATE_SLUGS = new Set([
    "auto_project_details_docs",
    "auto_agent_followup",
  ]);
  const isAutoTemplate = AUTO_TEMPLATE_SLUGS.has(template_slug);

  let template: { id?: string; name?: string; subject?: string | null; body_html?: string | null; merge_tags?: unknown } | null = null;
  if (!isAutoTemplate) {
    const { data: tpl, error: templateErr } = await supabase
      .from("crm_email_templates")
      .select("id, name, subject, body_html, merge_tags")
      .eq("slug", template_slug)
      .maybeSingle();
    if (templateErr || !tpl) return json({ error: "template_not_found" }, 404);
    template = tpl;
  }

  // Pull richer project metadata for auto-templates AND for bridge fallback.
  const { data: projectRow } = await supabase
    .from("crm_projects")
    .select("slug, presale_slug, name, city, developer, price_from, completion_date, website_url, marketing_url, brochure_url, floor_plans_url, pricing_url")
    .or(`slug.eq.${project_slug},presale_slug.eq.${project_slug}`)
    .maybeSingle();

  let bridgeProjectSlug = project_slug;
  if (projectRow?.presale_slug) {
    bridgeProjectSlug = projectRow.presale_slug;
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

  // ───────── Branch A: Presale "auto-response" templates ─────────────────
  // These mirror the emails leads receive when they sign up on
  // presaleproperties.com — admin-managed, identical branding.
  if (isAutoTemplate) {
    const formatPrice = (n: number | null | undefined) =>
      typeof n === "number" && n > 0 ? `From $${n.toLocaleString("en-CA")}` : null;
    const completionYear = projectRow?.completion_date
      ? new Date(projectRow.completion_date as string).getUTCFullYear().toString()
      : null;

    // Fetch richer project data (hero image, deposit, completion month/year,
    // developer) from the Presale bridge so the rendered email matches the
    // version leads receive when they sign up on presaleproperties.com.
    let bridgeProject: Record<string, any> = {};
    if (bridgeProjectSlug) {
      try {
        const r = await fetch(`${BRIDGE_URL}/bridge-get-project?slug=${encodeURIComponent(bridgeProjectSlug)}`, {
          method: "GET",
          headers: {
            "x-bridge-secret": BRIDGE_SECRET,
            "Authorization": `Bearer ${PRESALE_ANON_KEY}`,
            "apikey": PRESALE_ANON_KEY,
          },
        });
        if (r.ok) {
          const j = await r.json();
          bridgeProject = (j?.project ?? j ?? {}) as Record<string, any>;
        }
      } catch (e) {
        console.warn("[render-and-send] bridge-get-project failed", (e as Error).message);
      }
    }

    const heroImage =
      bridgeProject.featured_image ||
      bridgeProject.hero_image ||
      (Array.isArray(bridgeProject.gallery_images) ? bridgeProject.gallery_images[0] : null) ||
      undefined;

    const monthName = (m: number) => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1] ?? "";
    const completionStr =
      bridgeProject.completion_month && bridgeProject.completion_year
        ? `${monthName(Number(bridgeProject.completion_month))} ${bridgeProject.completion_year}`
        : (bridgeProject.completion_year ? String(bridgeProject.completion_year) : completionYear ?? undefined);

    const startingPrice =
      formatPrice(bridgeProject.starting_price as number | null) ||
      formatPrice(projectRow?.price_from as number | null) ||
      undefined;

    const autoBody = {
      template_id: template_slug,
      recipient_name: contact.first_name || "there",
      agent_slug: agentSlug ?? undefined,
      agent: agentSlug
        ? undefined
        : {
            full_name: agentName || undefined,
            email: agentEmail || undefined,
          },
      project: {
        projectName: bridgeProject.name || projectRow?.name || project_slug,
        city: bridgeProject.city || projectRow?.city || undefined,
        developerName: bridgeProject.developer_name || (bridgeProject.developer as any)?.name || projectRow?.developer || undefined,
        startingPrice,
        deposit: bridgeProject.deposit_structure || undefined,
        completion: completionStr,
        heroImage,
        projectUrl:
          projectDetailsUrlOverride ||
          projectRow?.marketing_url ||
          projectRow?.website_url ||
          (bridgeProjectSlug
            ? `https://presaleproperties.com/projects/${bridgeProjectSlug}`
            : undefined),
        brochureUrl: attachments.brochure
          ? (brochureUrlOverride || resolvedAttachmentsForBridge.brochure?.url || bridgeProject.first_brochure_url || projectRow?.brochure_url || undefined)
          : (brochureUrlOverride || undefined),
        floorplanUrl: attachments.floor_plans
          ? (resolvedAttachmentsForBridge.floor_plans?.url || bridgeProject.first_floorplan_url || projectRow?.floor_plans_url || undefined)
          : undefined,
        pricingUrl: attachments.pricing
          ? (resolvedAttachmentsForBridge.pricing?.url || bridgeProject.first_pricing_sheet_url || projectRow?.pricing_url || undefined)
          : undefined,
      },
    };

    try {
      renderRes = await fetch(
        "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1/serve-auto-templates",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-bridge-secret": BRIDGE_SECRET,
          },
          body: JSON.stringify(autoBody),
        },
      );
      renderText = await renderRes.text();
    } catch (e) {
      console.error("[render-and-send] auto-template fetch threw", e);
      return json({ error: "bridge_unreachable", detail: (e as Error).message }, 502);
    }
  } else {
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
          template_key: template_slug,
          template_slug: template_slug,
          preset: template_slug,
          template: {
            key: template_slug,
            slug: template_slug,
            name: template?.name,
            subject: template?.subject,
          },
          subject: template?.subject,
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
  }
  let rendered: { ok?: boolean; subject_rendered?: string; html_rendered?: string; text_rendered?: string; subject?: string; html?: string; text?: string; error?: string } = {};
  try { rendered = renderText ? JSON.parse(renderText) : {}; } catch { /* */ }
  const subject_rendered = rendered.subject_rendered || rendered.subject || template?.subject || "";
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
  // and the inline agent block.
  // We post-process to inject the agent's personal note as a styled block
  // above the project card, and to honor the agent's optional subject
  // override from the composer.
  const agentFirstName = (agentName || "").trim().split(/\s+/)[0] || null;
  const noteHtml = renderPersonalNoteBlock(personal_note, agentFirstName);
  let html_final = html_rendered;
  if (noteHtml) {
    html_final = injectPersonalNote(html_final, noteHtml);
  }
  // Strip CTA buttons the agent toggled off in the composer.
  // Match by button label (Presale buttons use predictable copy) AND by
  // href shape, so this works regardless of underlying URL pattern.
  if (!ctaProjectDetails) {
    html_final = stripButtonBy(html_final, (href, label) => {
      const lbl = label.toLowerCase();
      if (/view\s+project\s+details?/.test(lbl)) return true;
      if (/presaleproperties\.com\/projects?\//i.test(href)) return true;
      // marketing_url is also the projectUrl we passed to bridge
      if (projectDetailsUrlOverride && href === projectDetailsUrlOverride) return true;
      return false;
    });
  }
  if (!ctaCallNow) {
    html_final = stripButtonBy(html_final, (href, label) => {
      if (/^tel:/i.test(href)) return true;
      if (/^call\s+now$/i.test(label)) return true;
      return false;
    });
  }
  // Note: brochure / floor plans / pricing buttons are controlled by the
  // Attachments toggles, which decide whether we even pass the URL to the
  // bridge — no post-strip needed.

  // ─── Click + open tracking ───────────────────────────────────────────────
  const TRACK_BASE = `${SUPABASE_URL}/functions/v1/crm-email-track`;
  const trackingId = crypto.randomUUID();
  const classifyButton = (href: string, label: string): string => {
    const h = href.toLowerCase();
    const l = label.toLowerCase();
    if (h.startsWith("tel:") || /^call\s+now$/.test(l)) return "call";
    if (/floor[-_]?plan/.test(h) || /floor\s*plan/.test(l)) return "floor_plans";
    if (/(price|pricing)/.test(h) || /pricing/.test(l)) return "pricing";
    if (/brochure/.test(l) || /brochure/.test(h)) return "brochure";
    if (/project\s+details?/.test(l) || /presaleproperties\.com\/projects?\//.test(h)) return "project_details";
    if (/\.pdf(\?|$)/.test(h)) return "brochure";
    return "link";
  };

  // Click rewrite — match the full <a>…</a> so we can use button label for
  // accurate per-button classification. Skip already-tracked links.
  html_final = html_final.replace(
    /<a\b([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>([\s\S]*?)<\/a>/gi,
    (_m, preAttrs, q, href, postAttrs, inner) => {
      if (href.includes("/crm-email-track")) return _m;
      const label = String(inner).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const btn = classifyButton(href, label);
      const tracked = `${TRACK_BASE}?a=click&t=${encodeURIComponent(trackingId)}&b=${encodeURIComponent(btn)}&u=${encodeURIComponent(href)}`;
      return `<a${preAttrs}href=${q}${tracked}${q}${postAttrs}>${inner}</a>`;
    },
  );
  // Open pixel
  const pixel = `<img src="${TRACK_BASE}?a=open&t=${encodeURIComponent(trackingId)}" width="1" height="1" alt="" style="display:block;border:0;outline:none;width:1px;height:1px" />`;
  html_final = /<\/body>/i.test(html_final)
    ? html_final.replace(/<\/body>/i, `${pixel}</body>`)
    : html_final + pixel;

  const subject_final = (subject_override?.trim() || subject_rendered || "").trim();

  // Plain-text fallback — generated from the final HTML so links + the
  // personal note are preserved. Improves deliverability + Apple Mail
  // privacy-preview accuracy.
  const text_final = text_rendered && text_rendered.trim().length > 0
    ? text_rendered
    : htmlToPlainText(html_final);

  // (d) dry run — preview only
  if (dry_run) {
    return json({
      ok: true,
      subject: subject_final,
      html: html_final,
      text: text_final,
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
        subject: subject_final,
        body_html: html_final,
        body_text: text_final,
        // Force replies to land in the agent's CRM inbox (so threads show
        // up in the Lead detail), even when Gmail is connected to a
        // different mailbox alias.
        reply_to_override: agentEmail || undefined,
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
      subject: `[FAILED] ${subject_final}`,
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
      subject: subject_final,
      body: html_final,
      sent_at: new Date().toISOString(),
      direction: "outbound",
      gmail_message_id,
      gmail_thread_id,
      tracking_id: trackingId,
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

  // (h) optional follow-up enrollment — uses crm_automation_enrollments so
  //     process-automations actually fires subsequent steps. Step 1 of every
  //     Presale funnel has delay_hours=0 and matches the email we just sent,
  //     so we advance the enrollment to step 2 immediately to avoid
  //     duplicating the initial email when the cron picks it up.
  let enrolled = false;
  if (enroll_followup_slug) {
    // Prefer slug column; fall back to legacy name-based match for older rows.
    const { data: automation } = await supabase
      .from("crm_automations")
      .select("id, is_active")
      .or(
        `slug.eq.${enroll_followup_slug},name.eq.${enroll_followup_slug},name.ilike.${enroll_followup_slug.replace(/-/g, " ")}`,
      )
      .limit(1)
      .maybeSingle();

    if (automation?.id && automation.is_active !== false) {
      // Use the canonical RPC so trigger logic + dedupe (active uniq index)
      // are honored.
      const { data: enrollmentId, error: enrollErr } = await supabase.rpc(
        "enroll_in_automation",
        {
          p_automation_id: automation.id,
          p_contact_id: contact_id,
          p_trigger_data: {
          project_slug: projectRow?.slug || project_slug,
            template_slug,
            enrolled_via: "render-and-send",
            initial_email_sent_at: new Date().toISOString(),
          },
        } as never,
      );

      if (!enrollErr && enrollmentId) {
        // Update enrollment to skip step 1 (already sent) and schedule step 2.
        const { data: step2 } = await supabase
          .from("crm_automation_steps")
          .select("step_order, delay_hours")
          .eq("automation_id", automation.id)
          .gt("step_order", 1)
          .order("step_order", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (step2) {
          // delay_hours on step 2 is measured from step 1 (which fired now)
          const dueAt = new Date(
            Date.now() + (step2.delay_hours ?? 0) * 3600_000,
          ).toISOString();
          await supabase
            .from("crm_automation_enrollments")
            .update({
              current_step_order: step2.step_order,
              next_step_due_at: dueAt,
              project_slug: project_slug ?? null,
            })
            .eq("id", enrollmentId as unknown as string);
        } else {
          // Single-step funnel: nothing more to do; mark complete.
          await supabase
            .from("crm_automation_enrollments")
            .update({
              status: "completed",
              exited_at: new Date().toISOString(),
              exit_reason: "single_step_funnel",
              project_slug: project_slug ?? null,
            })
            .eq("id", enrollmentId as unknown as string);
        }

        enrolled = true;
        // Mirror to legacy log table for analytics.
        await supabase.from("crm_automation_logs").insert({
          automation_id: automation.id,
          contact_id,
          trigger_data: {
          project_slug: projectRow?.slug || project_slug,
            template_slug,
            enrolled_via: "render-and-send",
            enrollment_id: enrollmentId,
          },
        }).catch(() => {});
      } else if (enrollErr) {
        console.warn("[render-and-send] enroll_in_automation failed", enrollErr);
      }
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
