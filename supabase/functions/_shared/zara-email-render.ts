// Shared HTML renderer used by Zara email paths. Produces fully-branded
// email HTML by calling Presale Properties auto-templates only. Zara must
// never create, pick, or stitch local CRM email templates.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SB = ReturnType<typeof createClient>;

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

/**
 * Render a fully-branded HTML email body for a Zara draft.
 * Uses Presale Properties auto-templates only. No local template lookup,
 * no local scaffold fallback, and no CRM-side signature append.
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
  const { data: contact } = await sb.from("crm_contacts")
    .select("first_name,last_name,email,city,assigned_to").eq("id", opts.contactId).maybeSingle();

  let agentSlug: string | null = null;
  let agentName: string | null = null;
  let agentEmail: string | null = null;
  if (opts.userId) {
    try {
      const { data: teamRow } = await sb.from("crm_team")
        .select("presale_slug, slug, display_name, email")
        .eq("user_id", opts.userId)
        .maybeSingle();
      agentSlug = (teamRow as any)?.presale_slug ?? (teamRow as any)?.slug ?? null;
      agentName = (teamRow as any)?.display_name ?? null;
      agentEmail = (teamRow as any)?.email ?? null;
    } catch (_) { /* non-fatal */ }
  }

  const bridgeSecret = Deno.env.get("PRESALE_BRIDGE_SECRET") ?? Deno.env.get("BRIDGE_SECRET") ?? "";
  const bridgeBase = Deno.env.get("PRESALE_BRIDGE_URL") ?? "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1";
  if (!bridgeSecret) throw new Error("presale_bridge_secret_missing");

  const templateId = opts.intent === "send_project_details" || opts.intent === "project_match"
    ? "auto_project_details_docs"
    : "auto_agent_followup";
  const recipientName = (contact as any)?.first_name || "there";
  const cleanBody = String(opts.bodyText ?? "").trim();
  const fallbackHtml = paragraphsToHtml(cleanBody);
  const payload = {
    template_id: templateId,
    recipient_name: recipientName,
    subject: opts.subject ?? undefined,
    message: cleanBody,
    body: cleanBody,
    body_html: fallbackHtml,
    personal_note: cleanBody,
    cta: opts.cta_text && opts.cta_url ? { label: opts.cta_text, url: opts.cta_url } : undefined,
    agent_slug: agentSlug ?? undefined,
    agent: agentSlug ? undefined : { full_name: agentName ?? undefined, email: agentEmail ?? undefined },
    contact: {
      first_name: (contact as any)?.first_name ?? undefined,
      last_name: (contact as any)?.last_name ?? undefined,
      email: (contact as any)?.email ?? undefined,
      city: (contact as any)?.city ?? undefined,
    },
  };

  const res = await fetch(`${bridgeBase.replace(/\/$/, "")}/serve-auto-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bridge-secret": bridgeSecret },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let parsed: any = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { /* raw */ }
  const html = parsed.html_rendered || parsed.html;
  if (!res.ok || !html) {
    throw new Error(`presale_template_render_failed_${res.status}: ${String(parsed.error ?? raw).slice(0, 240)}`);
  }

  const subject = parsed.subject_rendered || parsed.subject || opts.subject || null;
  const text = parsed.text_rendered || parsed.text || htmlToPlain(html);
  return { html, text, subject, template_id_used: templateId };
}
