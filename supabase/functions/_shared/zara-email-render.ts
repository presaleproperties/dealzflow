// Shared HTML renderer used by zara-tool-execute (draft_email) and
// zara-send-project-details. Produces fully-branded email HTML using a
// matching row from crm_email_templates, with token interpolation and the
// actor agent's signature appended. SMS / WhatsApp drafts do NOT use this —
// they stay plain text.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SB = ReturnType<typeof createClient>;

const TEMPLATE_INTENT_MAP: Record<string, RegExp> = {
  // intent → regex matched against name+category of crm_email_templates
  greeting: /first.?touch|welcome|new.?project.?launch|intro/i,
  first_touch: /first.?touch|welcome|new.?project.?launch|intro/i,
  follow_up: /follow.?up|after.?showing/i,
  reactivation: /re.?engage|miss.?you|reactiv/i,
  neighborhood: /neighborhood|nurture/i,
  project_info: /neighborhood|nurture|project.?info/i,
  newsletter: /newsletter|monthly|market.?update/i,
  market_update: /newsletter|monthly|market.?update/i,
  project_match: /project.?showcase|project.?match|project.?launch/i,
  send_project_details: /project.?showcase/i,
};

export const INLINE_FALLBACK_TEMPLATE = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;margin:0 auto;">
<tr><td style="background:#1a1a2e;padding:24px;text-align:center;">
  <div style="color:#ffffff;font-size:13px;letter-spacing:0.22em;font-weight:700;text-transform:uppercase;">The Presale Properties Group</div>
</td></tr>
<tr><td style="padding:32px 28px 24px 28px;color:#444;font-size:15px;line-height:1.65;">{{body_html}}</td></tr>
{{cta_block}}
<tr><td style="padding:0 28px 28px 28px;border-top:1px solid #eee;"><div style="padding-top:20px;">{{signature_html}}</div></td></tr>
<tr><td style="background:#0f1018;padding:18px 24px;text-align:center;color:rgba(255,255,255,0.55);font-size:11px;">
  <a href="https://presaleproperties.com" style="color:rgba(255,255,255,0.7);text-decoration:none;">presaleproperties.com</a>
  &nbsp;·&nbsp;<a href="{{unsubscribe}}" style="color:rgba(255,255,255,0.55);text-decoration:underline;">unsubscribe</a>
</td></tr>
</table></td></tr></table>
</body></html>`;

const CTA_BLOCK = (text: string, url: string) => `<tr><td style="padding:0 28px 24px 28px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(text)}</a></td></tr>`;

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function paragraphsToHtml(input: string | string[] | undefined | null): string {
  if (!input) return "";
  const arr = Array.isArray(input)
    ? input
    : String(input).split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean);
  return arr.map((p) => `<p style="margin:0 0 14px 0;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`).join("");
}

export function htmlToPlain(html: string): string {
  return String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

export function interpolate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => vars[k] ?? "");
}

export async function pickTemplate(
  sb: SB,
  intent: string | null | undefined,
  fallbackId?: string | null,
): Promise<{ id: string; name: string; body_html: string; subject: string | null } | null> {
  if (fallbackId) {
    const { data } = await sb.from("crm_email_templates")
      .select("id, name, body_html, subject")
      .eq("id", fallbackId).maybeSingle();
    if (data && (data as any).body_html) return data as any;
  }
  const re = intent ? TEMPLATE_INTENT_MAP[intent] : null;
  const { data: rows } = await sb.from("crm_email_templates")
    .select("id, name, body_html, subject, category, is_active")
    .eq("is_active", true).limit(100);
  const list = (rows ?? []) as any[];
  if (re) {
    const match = list.find((t) => re.test(`${t.name ?? ""} ${t.category ?? ""}`));
    if (match) return match;
  }
  // settings fallback (workspace-wide zara_settings row, id=1)
  try {
    const { data: cfg } = await sb.from("zara_settings")
      .select("email_fallback_template_id").eq("id", 1).maybeSingle();
    const fid = (cfg as any)?.email_fallback_template_id;
    if (fid) {
      const m = list.find((t) => t.id === fid);
      if (m) return m;
    }
  } catch (_) { /* ignore */ }
  return null;
}

export async function resolveSignatureHtml(sb: SB, userId: string): Promise<string> {
  // Per-user signature (matches crm_email_signatures + crm_email_settings used by every composer)
  try {
    const { data: sig } = await sb.from("crm_email_signatures")
      .select("html").eq("user_id", userId).eq("is_default", true).maybeSingle();
    if ((sig as any)?.html) return String((sig as any).html);
  } catch (_) { /* ignore */ }
  try {
    const { data: settings } = await sb.from("crm_email_settings")
      .select("signature_html").eq("user_id", userId).maybeSingle();
    if ((settings as any)?.signature_html) return String((settings as any).signature_html);
  } catch (_) { /* ignore */ }
  return "";
}

export async function getZaraEmailPrefs(sb: SB): Promise<{
  use_scaffold: boolean;
  append_signature: boolean;
  fallback_template_id: string | null;
}> {
  try {
    const { data } = await sb.from("zara_settings")
      .select("email_use_template_scaffold, email_append_signature, email_fallback_template_id")
      .eq("id", 1).maybeSingle();
    const c = (data as any) ?? {};
    return {
      use_scaffold: c.email_use_template_scaffold !== false,
      append_signature: c.email_append_signature !== false,
      fallback_template_id: c.email_fallback_template_id ?? null,
    };
  } catch (_) {
    return { use_scaffold: true, append_signature: true, fallback_template_id: null };
  }
}

/**
 * Render a fully-branded HTML email body for a Zara draft.
 * Uses a matched template from crm_email_templates if available; otherwise
 * falls back to the inline navy/gold scaffold.
 */
export async function renderBrandedEmail(
  sb: SB,
  opts: {
    userId: string;
    contactId: string;
    intent: string | null | undefined;
    bodyText: string;          // raw model output (markdown/plain)
    subject?: string | null;
    cta_text?: string | null;
    cta_url?: string | null;
  },
): Promise<{
  html: string;
  text: string;
  subject: string | null;
  template_id_used: string | null;
}> {
  const prefs = await getZaraEmailPrefs(sb);

  const { data: contact } = await sb.from("crm_contacts")
    .select("first_name,last_name,email,city").eq("id", opts.contactId).maybeSingle();

  const sigHtml = prefs.append_signature ? await resolveSignatureHtml(sb, opts.userId) : "";

  const baseVars: Record<string, string> = {
    first_name: (contact as any)?.first_name ?? "there",
    last_name: (contact as any)?.last_name ?? "",
    name: [(contact as any)?.first_name, (contact as any)?.last_name].filter(Boolean).join(" ") || "there",
    city: (contact as any)?.city ?? "",
    unsubscribe: "{{unsubscribe}}", // server-side substitute happens at send time
    signature_html: sigHtml,
  };

  const bodyHtml = paragraphsToHtml(opts.bodyText);

  let template: { id: string; body_html: string; subject: string | null; name: string } | null = null;
  if (prefs.use_scaffold) {
    template = await pickTemplate(sb, opts.intent, prefs.fallback_template_id);
  }

  let scaffold = INLINE_FALLBACK_TEMPLATE;
  let template_id_used: string | null = null;
  let subject = opts.subject ?? null;

  if (template) {
    scaffold = template.body_html;
    template_id_used = template.id;
    if (!subject && template.subject) subject = template.subject;
  }

  // Build CTA block for inline scaffold (existing templates may already include their own).
  const ctaBlock = opts.cta_text && opts.cta_url ? CTA_BLOCK(opts.cta_text, opts.cta_url) : "";

  const vars: Record<string, string> = {
    ...baseVars,
    body_html: bodyHtml,
    intro_html: bodyHtml,
    cards_html: "",
    closing_html: "",
    cta_block: ctaBlock,
    subject: subject ?? "",
  };

  // First pass: token interpolation on the scaffold
  let html = interpolate(scaffold, vars);
  // Second pass: if scaffold uses {{signature_html}} placeholder we already
  // injected; if scaffold lacks one, append before </body>
  if (sigHtml && !/\{\{\s*signature_html\s*\}\}/.test(scaffold) && !html.includes(sigHtml)) {
    html = html.replace(/<\/body>/i, `<div style="padding:0 28px 28px 28px;border-top:1px solid #eee;"><div style="padding-top:20px;">${sigHtml}</div></div></body>`);
  }
  // Final subject interpolation
  if (subject) subject = interpolate(subject, vars);

  const text = htmlToPlain(html);

  return { html, text, subject, template_id_used };
}
