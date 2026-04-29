/**
 * Presale Properties signature builders
 * ──────────────────────────────────────────────────────────────────────────
 * Two presets, ported 1:1 from the Presale Properties project so emails sent
 * from DealsFlow / CommissionIQ look identical to emails sent from Presale's
 * own composer:
 *
 *   1. buildPresaleCardSignature  — Rich "agent card" (photo + name + title
 *      + phone + email + Presale Properties brand logo). Best for HTML
 *      campaigns and 1:1 sends from Gmail / Outlook.
 *
 *   2. buildPresaleLoftySignature — Lightweight, inline-style only,
 *      Lofty-safe (no <style> block, no media queries). Best for the Lofty
 *      CRM composer and any tool that strips <style> blocks.
 *
 * Source of truth:
 *   - Presale `src/lib/emailSignature.ts`       (Card)
 *   - Presale `src/components/admin/AiEmailTemplate.tsx` agent block (Lofty)
 */

export interface PresaleSignatureAgent {
  full_name?: string | null;
  title?: string | null;
  photo_url?: string | null;
  phone?: string | null;
  email?: string | null;
  website_url?: string | null;
  calendly_url?: string | null;
  brokerage?: string | null;
  license_no?: string | null;
  instagram_url?: string | null;
}

const LOGO_EMAIL_URL =
  "https://thvlisplwqhtjpzpedhq.supabase.co/storage/v1/object/public/avatars/brand%2Flogo-email.png";
const ACCENT = "#C9A55A";
const DARK = "#111111";
const F = "'Plus Jakarta Sans','DM Sans',Helvetica,Arial,sans-serif";

const FALLBACK_PHONE = "(672) 258-1100";
const FALLBACK_EMAIL = "info@presaleproperties.com";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Rich Presale agent card (for full HTML email clients). */
export function buildPresaleCardSignature(agent: PresaleSignatureAgent): string {
  const name = agent.full_name || "Presale Properties Team";
  const title = agent.title || "Presale Specialist";
  const phone = agent.phone || FALLBACK_PHONE;
  const email = agent.email || FALLBACK_EMAIL;
  const photo = agent.photo_url || "";
  const websiteUrl = agent.website_url || "";
  const cleanPhone = phone.replace(/\D/g, "");

  return `
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;background:#ffffff;border-top:2px solid ${ACCENT};">
  ${photo ? `
  <tr>
    <td align="center" style="padding:24px 24px 12px;">
      ${websiteUrl ? `<a href="${esc(websiteUrl)}" target="_blank" style="text-decoration:none;">` : ""}<img src="${esc(photo)}" alt="${esc(name)}" width="80" height="80" style="display:inline-block;width:80px;height:80px;border-radius:50%;object-fit:cover;object-position:center top;border:3px solid ${ACCENT};-ms-interpolation-mode:bicubic;" />${websiteUrl ? `</a>` : ""}
    </td>
  </tr>` : ""}
  <tr>
    <td align="center" style="padding:0 24px 8px;text-align:center;">
      <p style="margin:0 0 4px 0;font-family:${F};font-size:18px;font-weight:800;color:${DARK};">${esc(name)}</p>
      <p style="margin:0 0 12px 0;font-family:${F};font-size:10px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:${ACCENT};">${esc(title)}</p>
      <p style="margin:0 0 4px 0;font-family:${F};font-size:14px;color:#555555;"><a href="tel:${cleanPhone}" style="color:#555555;text-decoration:none;">${esc(phone)}</a></p>
      <p style="margin:0;font-family:${F};font-size:13px;color:#8a7e6b;"><a href="mailto:${esc(email)}" style="color:#8a7e6b;text-decoration:none;">${esc(email)}</a></p>
      ${agent.calendly_url ? `<p style="margin:8px 0 0 0;font-family:${F};font-size:12px;"><a href="${esc(agent.calendly_url)}" style="color:${ACCENT};text-decoration:none;font-weight:600;">Book a call →</a></p>` : ""}
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 24px 24px;border-top:1px solid #e8e2d6;text-align:center;">
      <img src="${LOGO_EMAIL_URL}" alt="Presale Properties" width="110" style="display:inline-block;width:110px;height:auto;" />
      ${agent.brokerage || agent.license_no ? `
      <p style="margin:8px 0 0 0;font-family:${F};font-size:10px;color:#8a7e6b;letter-spacing:0.4px;">
        ${[agent.brokerage, agent.license_no ? `License #${agent.license_no}` : ""].filter(Boolean).map(esc).join(" · ")}
      </p>` : ""}
    </td>
  </tr>
</table>`.trim();
}

/**
 * Lofty-safe signature (inline styles only, no <style>, no media queries).
 * Mirrors the agent block used at the bottom of buildPitchDeckEmailHtmlLofty.
 */
export function buildPresaleLoftySignature(agent: PresaleSignatureAgent): string {
  const name = agent.full_name || "Presale Properties Team";
  const title = agent.title || "Presale Specialist";
  const phone = agent.phone || FALLBACK_PHONE;
  const email = agent.email || FALLBACK_EMAIL;
  const photo = agent.photo_url || "";
  const cleanPhone = phone.replace(/\D/g, "");

  const photoCell = photo
    ? `<img src="${esc(photo)}" alt="${esc(name)}" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:9999px;border:2px solid ${ACCENT};object-fit:cover;-ms-interpolation-mode:bicubic;" />`
    : `<div style="width:56px;height:56px;border-radius:9999px;background:${ACCENT};color:#ffffff;font-family:${F};font-weight:700;font-size:20px;text-align:center;line-height:56px;">${esc(name.charAt(0))}</div>`;

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-top:1px solid #e6e6e6;padding-top:16px;font-family:${F};">
  <tr>
    <td valign="top" style="padding-right:14px;vertical-align:top;">${photoCell}</td>
    <td valign="top" style="vertical-align:top;font-family:${F};color:${DARK};">
      <p style="margin:0;font-family:${F};font-size:14px;font-weight:700;color:${DARK};line-height:1.2;">${esc(name)}</p>
      <p style="margin:2px 0 0 0;font-family:${F};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${ACCENT};font-weight:600;">${esc(title)}</p>
      <p style="margin:8px 0 0 0;font-family:${F};font-size:13px;color:#444444;line-height:1.5;">
        <a href="tel:${cleanPhone}" style="color:#444444;text-decoration:none;">${esc(phone)}</a>
        &nbsp;·&nbsp;
        <a href="mailto:${esc(email)}" style="color:#444444;text-decoration:none;">${esc(email)}</a>
      </p>
      ${agent.calendly_url ? `<p style="margin:6px 0 0 0;font-family:${F};font-size:12px;"><a href="${esc(agent.calendly_url)}" style="color:${ACCENT};text-decoration:none;font-weight:600;">Book a call →</a></p>` : ""}
      ${agent.brokerage || agent.license_no ? `<p style="margin:8px 0 0 0;font-family:${F};font-size:11px;color:#888888;">${[agent.brokerage, agent.license_no ? `License #${agent.license_no}` : ""].filter(Boolean).map(esc).join(" · ")}</p>` : ""}
    </td>
  </tr>
</table>`.trim();
}

/**
 * Headshot-Left agent card — matches the Presale Properties Marketing Hub
 * "Headshot Left" preview exactly.
 *
 * Layout: square rounded headshot on the left with a gold accent border, then
 * a vertical gold divider, then a stacked block on the right:
 *   • Bold black name
 *   • Gold uppercase title · BROKERAGE
 *   • phone · email row
 *   • Gold website link + outlined Instagram pill
 */
export function buildPresaleHeadshotLeftSignature(agent: PresaleSignatureAgent): string {
  const name = agent.full_name || "Presale Properties Team";
  const title = agent.title || "Presale Specialist";
  const brokerage = agent.brokerage || "";
  const phone = agent.phone || FALLBACK_PHONE;
  const email = agent.email || FALLBACK_EMAIL;
  const photo = agent.photo_url || "";
  const websiteUrl = agent.website_url || "https://presaleproperties.com";
  const instagramUrl = agent.instagram_url || "";
  const cleanPhone = phone.replace(/\D/g, "");

  // Strip protocol for display only.
  const websiteDisplay = websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const titleLine = brokerage
    ? `${esc(title)} <span style="color:${ACCENT};">·</span> ${esc(brokerage.toUpperCase())}`
    : esc(title);

  const photoCell = photo
    ? `<img src="${esc(photo)}" alt="${esc(name)}" width="104" height="104" style="display:block;width:104px;height:104px;border-radius:14px;object-fit:cover;object-position:center top;border:2px solid ${ACCENT};-ms-interpolation-mode:bicubic;" />`
    : `<div style="width:104px;height:104px;border-radius:14px;background:${ACCENT};color:#ffffff;font-family:${F};font-weight:800;font-size:38px;text-align:center;line-height:104px;border:2px solid ${ACCENT};">${esc(name.charAt(0))}</div>`;

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;font-family:${F};border-collapse:collapse;">
  <tr>
    <td valign="top" style="padding:4px 18px 4px 0;vertical-align:top;">
      ${photoCell}
    </td>
    <td valign="top" style="padding:4px 0 4px 18px;vertical-align:top;border-left:2px solid ${ACCENT};">
      <p style="margin:0;font-family:${F};font-size:18px;font-weight:800;color:${DARK};line-height:1.15;letter-spacing:-0.2px;">${esc(name)}</p>
      <p style="margin:6px 0 0 0;font-family:${F};font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${ACCENT};line-height:1.3;">${titleLine}</p>
      <p style="margin:12px 0 0 0;font-family:${F};font-size:13px;color:#3a3a3a;line-height:1.5;">
        <a href="tel:${cleanPhone}" style="color:#3a3a3a;text-decoration:none;font-weight:600;">${esc(phone)}</a>
        <span style="color:${ACCENT};padding:0 8px;">|</span>
        <a href="mailto:${esc(email)}" style="color:#3a3a3a;text-decoration:none;">${esc(email)}</a>
      </p>
      <p style="margin:10px 0 0 0;font-family:${F};font-size:13px;line-height:1.4;">
        <a href="${esc(websiteUrl)}" target="_blank" style="color:${ACCENT};text-decoration:none;font-weight:700;">${esc(websiteDisplay)}</a>${instagramUrl ? `&nbsp;&nbsp;<a href="${esc(instagramUrl)}" target="_blank" style="display:inline-block;padding:4px 12px;border:1.5px solid ${ACCENT};border-radius:6px;color:${ACCENT};text-decoration:none;font-size:12px;font-weight:600;">Instagram</a>` : ""}
      </p>
      ${agent.license_no ? `<p style="margin:10px 0 0 0;font-family:${F};font-size:10px;color:#8a7e6b;letter-spacing:0.4px;">License #${esc(agent.license_no)}</p>` : ""}
    </td>
  </tr>
</table>`.trim();
}

export type PresaleSignaturePresetId = "presale_headshot_left" | "presale_card" | "presale_lofty";

export const PRESALE_SIGNATURE_PRESETS: Array<{
  id: PresaleSignaturePresetId;
  label: string;
  description: string;
  build: (agent: PresaleSignatureAgent) => string;
}> = [
  {
    id: "presale_headshot_left",
    label: "Headshot Left (recommended)",
    description:
      "Matches the Presale Properties Marketing Hub default — square headshot on the left, gold divider, bold name, contact line, website + Instagram. Best for Gmail / Outlook.",
    build: buildPresaleHeadshotLeftSignature,
  },
  {
    id: "presale_card",
    label: "Presale Card (centered)",
    description:
      "Centered agent card with circular headshot, contact info, and the Presale Properties brand logo footer.",
    build: buildPresaleCardSignature,
  },
  {
    id: "presale_lofty",
    label: "Lofty / Plain HTML",
    description:
      "Lightweight inline-styled signature. No <style> blocks or media queries — safe for Lofty CRM and any tool that strips embedded styles.",
    build: buildPresaleLoftySignature,
  },
];
