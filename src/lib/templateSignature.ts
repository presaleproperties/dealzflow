/**
 * Template signature helpers — keeps brand identity consistent across
 * agents by stamping the agent's Presale-synced signature (or local
 * email-settings signature as a fallback) onto every saved template.
 *
 * The signature is appended via a sentinel comment so we can detect it
 * later and avoid double-injection on edits / re-saves.
 */

export const SIGNATURE_OPEN = '<!-- DEALZFLOW_SIGNATURE_START -->';
export const SIGNATURE_CLOSE = '<!-- DEALZFLOW_SIGNATURE_END -->';

/** True if the html already contains a stamped signature block. */
export function hasSignatureBlock(html: string): boolean {
  return typeof html === 'string' && html.includes(SIGNATURE_OPEN);
}

/** Strip any previously-stamped signature block (idempotent). */
export function stripSignatureBlock(html: string): string {
  if (!hasSignatureBlock(html)) return html;
  const re = new RegExp(`${SIGNATURE_OPEN}[\\s\\S]*?${SIGNATURE_CLOSE}`, 'g');
  return html.replace(re, '').trimEnd();
}

/** Replace any stamped signature block with the new one (or append it). */
export function applySignatureBlock(html: string, signatureHtml: string): string {
  const trimmedSig = (signatureHtml || '').trim();
  const stripped = stripSignatureBlock(html || '');
  if (!trimmedSig) return stripped;
  const block = `\n${SIGNATURE_OPEN}\n<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#14181F;">\n${trimmedSig}\n</div>\n${SIGNATURE_CLOSE}\n`;
  return `${stripped}${block}`;
}
