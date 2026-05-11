// Strip embedded "team" agent signature block(s) from a template body and
// append a fresh signature for the duplicating agent.

const NEEDLES = [
  'avatars/team/',                  // shared Presale agent avatar path
  'info@presaleproperties.com',     // owner inbox in canonical footer
  'presalewithuzair.com',           // Uzair's personal site link in footer
];

/**
 * Remove the outermost <table>…</table> block(s) whose inner HTML matches any
 * of `needles`. Walks the string with a simple depth counter so nested tables
 * are handled correctly.
 */
function stripTableContaining(html: string, needles: string[], maxRemovals = 3): string {
  let out = html;
  for (let n = 0; n < maxRemovals; n++) {
    const lower = out.toLowerCase();
    let removed = false;
    let cursor = 0;

    while (cursor < out.length) {
      const open = lower.indexOf('<table', cursor);
      if (open === -1) break;

      // Walk to find the matching </table>
      let depth = 0;
      let j = open + 6;
      let close = -1;
      while (j < out.length) {
        const nextOpen = lower.indexOf('<table', j);
        const nextClose = lower.indexOf('</table>', j);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          j = nextOpen + 6;
        } else {
          if (depth === 0) { close = nextClose; break; }
          depth--;
          j = nextClose + 8;
        }
      }
      if (close === -1) break;

      const block = out.slice(open, close + 8);
      if (needles.some((needle) => block.toLowerCase().includes(needle.toLowerCase()))) {
        out = out.slice(0, open) + out.slice(close + 8);
        removed = true;
        break;
      }
      cursor = close + 8;
    }

    if (!removed) break;
  }
  return out;
}

/**
 * Insert the new signature HTML before any closing </body> if present,
 * otherwise append to the end.
 */
function appendSignature(html: string, signatureHtml: string): string {
  if (!signatureHtml.trim()) return html;
  const wrapped = `\n<div data-agent-signature="1" style="margin-top:24px;">${signatureHtml}</div>\n`;
  const lower = html.toLowerCase();
  const closeBody = lower.lastIndexOf('</body>');
  if (closeBody !== -1) {
    return html.slice(0, closeBody) + wrapped + html.slice(closeBody);
  }
  return html + wrapped;
}

/**
 * Swap any embedded "team" signature in `bodyHtml` for the duplicating agent's
 * own signature. If `signatureHtml` is empty, the original signature is still
 * stripped (so it doesn't impersonate the original author).
 */
export function swapTemplateSignature(bodyHtml: string, signatureHtml: string | null | undefined): string {
  const stripped = stripTableContaining(bodyHtml, NEEDLES);
  return appendSignature(stripped, signatureHtml ?? '');
}
