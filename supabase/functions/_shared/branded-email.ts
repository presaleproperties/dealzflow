// Shared brand shell for ALL outbound CRM emails (single, mass, scheduled,
// Zara drafts, transactional follow-ups). The ONLY exception is project
// templates pulled from Presale via render-and-send — those come back as a
// full <html> document already, so this wrapper detects that and skips.
//
// One marker comment is injected so downstream calls (e.g. bridge → queue →
// worker) never wrap twice.

const BRAND_MARKER = "<!-- presale-brand-shell-v1 -->";

export function isAlreadyBranded(html: string): boolean {
  if (!html) return true;
  if (html.includes(BRAND_MARKER)) return true;
  // Any full HTML document (project templates from Presale, custom builder
  // exports, Zara-rendered drafts) keeps its own chrome.
  if (/<html[\s>]/i.test(html)) return true;
  return false;
}

export interface BrandShellOpts {
  signatureHtml?: string | null;
  brandLogoUrl?: string | null;
  brandLogoAlt?: string | null;
  unsubscribeUrl?: string | null;
  preheader?: string | null;
}

/**
 * Wrap a fragment of email body HTML in the unified Presale Properties brand
 * shell. Idempotent — calling on already-branded HTML returns it unchanged.
 */
export function wrapInBrandShell(bodyHtml: string, opts: BrandShellOpts = {}): string {
  if (isAlreadyBranded(bodyHtml)) return bodyHtml;

  const sig = (opts.signatureHtml ?? "").trim();
  const logoUrl = (opts.brandLogoUrl ?? "").trim();
  const logoAlt = (opts.brandLogoAlt ?? "The Presale Properties Group").replace(/[<>"']/g, "");
  const preheader = (opts.preheader ?? "").replace(/[<>]/g, "").slice(0, 140);
  const unsub = (opts.unsubscribeUrl ?? "{{unsubscribe}}").trim();

  const header = logoUrl && /^https:\/\//i.test(logoUrl)
    ? `<tr><td style="background:#14181F;padding:18px 24px;text-align:center;">
         <img src="${logoUrl}" alt="${logoAlt}" style="display:inline-block;max-height:48px;max-width:220px;height:auto;width:auto;border:0;outline:none;text-decoration:none;" />
       </td></tr>`
    : `<tr><td style="background:#14181F;padding:22px 24px;text-align:center;">
         <div style="color:#D7A542;font-size:12px;letter-spacing:0.28em;font-weight:700;text-transform:uppercase;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">The Presale Properties Group</div>
       </td></tr>`;

  const sigBlock = sig
    ? `<tr><td style="padding:0 32px 28px 32px;border-top:1px solid #ececec;">
         <div style="padding-top:20px;">${sig}</div>
       </td></tr>`
    : "";

  const preheaderBlock = preheader
    ? `<div style="display:none;font-size:1px;color:#f4f5f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>`
    : "";

  return `${BRAND_MARKER}
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;">
${preheaderBlock}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:0;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;margin:0 auto;border-radius:6px;overflow:hidden;box-shadow:0 1px 2px rgba(20,24,31,0.04);">
${header}
<tr><td style="padding:32px 32px 24px 32px;color:#1a1a2e;font-size:15px;line-height:1.65;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
${bodyHtml}
</td></tr>
${sigBlock}
<tr><td style="background:#0f1018;padding:16px 24px;text-align:center;color:rgba(255,255,255,0.55);font-size:11px;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<a href="https://presaleproperties.com" style="color:rgba(255,255,255,0.7);text-decoration:none;">presaleproperties.com</a>
&nbsp;·&nbsp;<a href="${unsub}" style="color:rgba(255,255,255,0.55);text-decoration:underline;">unsubscribe</a>
</td></tr>
</table></td></tr></table>
</body></html>`;
}
