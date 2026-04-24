import DOMPurify from 'dompurify';
import { z } from 'zod';

/**
 * Email-signature sanitization profile.
 *
 * Allows the tag/attribute set commonly used in HTML email signatures
 * (tables, inline styles, anchors, images), and forbids anything that
 * could execute or exfiltrate (script, iframe, form, on* handlers,
 * javascript: URLs, data: URLs except images).
 */
const SIGNATURE_ALLOWED_TAGS = [
  'a', 'b', 'br', 'div', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'li', 'ol', 'p', 'small', 'span', 'strong', 'sub', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'center',
];

const SIGNATURE_ALLOWED_ATTRS = [
  'href', 'src', 'alt', 'title', 'style', 'class', 'width', 'height',
  'align', 'valign', 'border', 'cellpadding', 'cellspacing', 'colspan',
  'rowspan', 'bgcolor', 'color', 'face', 'size', 'target', 'rel',
];

export type SanitizeResult = {
  html: string;
  removedTags: string[];
  removedAttrs: string[];
  warnings: string[];
};

/**
 * Sanitize HTML for use as an email signature.
 *
 * - Strips disallowed tags (script, iframe, object, embed, form, link,
 *   meta, style — inline styles via attribute are allowed; <style> blocks
 *   are not, since most email clients ignore them and they're a vector).
 * - Strips event handler attributes (onload, onclick, etc.)
 * - Forces target=_blank links to include rel="noopener noreferrer"
 * - Reports what was removed so we can show a transparent diff to the user.
 */
export function sanitizeSignatureHtml(input: string): SanitizeResult {
  const removedTags = new Set<string>();
  const removedAttrs = new Set<string>();
  const warnings: string[] = [];

  // DOMPurify hooks to record removals
  DOMPurify.addHook('uponSanitizeElement', (_node, data) => {
    if (data.allowedTags && !data.allowedTags[data.tagName]) {
      removedTags.add(data.tagName);
    }
  });
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (!data.allowedAttributes || !data.allowedAttributes[data.attrName]) {
      // Track interesting removals (skip ARIA/data-* noise)
      if (
        !data.attrName.startsWith('data-') &&
        !data.attrName.startsWith('aria-') &&
        data.attrName !== 'xmlns'
      ) {
        removedAttrs.add(data.attrName);
      }
    }
  });

  let clean: string;
  try {
    clean = DOMPurify.sanitize(input, {
      ALLOWED_TAGS: SIGNATURE_ALLOWED_TAGS,
      ALLOWED_ATTR: SIGNATURE_ALLOWED_ATTRS,
      ALLOW_DATA_ATTR: false,
      // Block javascript:/vbscript: URLs entirely; allow http(s), mailto, tel,
      // and data: only for images.
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,|#|\/)/i,
      RETURN_TRUSTED_TYPE: false,
      KEEP_CONTENT: true,
    }) as string;
  } finally {
    DOMPurify.removeAllHooks();
  }

  // Post-pass: ensure all anchors with target=_blank have safe rel
  if (typeof window !== 'undefined') {
    const tmp = document.createElement('div');
    tmp.innerHTML = clean;
    tmp.querySelectorAll('a[target="_blank"]').forEach((a) => {
      const rel = a.getAttribute('rel') || '';
      if (!/noopener/.test(rel) || !/noreferrer/.test(rel)) {
        a.setAttribute('rel', `${rel} noopener noreferrer`.trim());
      }
    });
    clean = tmp.innerHTML;

    // Warn on http: images (they'll be blocked in many clients)
    const httpImg = /(<img[^>]+src\s*=\s*["']http:\/\/)/i.test(clean);
    if (httpImg) {
      warnings.push('Some images use http:// — many email clients block insecure images. Consider https://.');
    }
  }

  if (removedTags.size > 0) {
    warnings.push(`Removed unsafe tags: ${[...removedTags].join(', ')}`);
  }
  if (removedAttrs.size > 0) {
    warnings.push(`Removed unsafe attributes: ${[...removedAttrs].join(', ')}`);
  }

  return {
    html: clean,
    removedTags: [...removedTags],
    removedAttrs: [...removedAttrs],
    warnings,
  };
}

/**
 * Schema for the import form.
 * - 200KB upper bound covers even bloated Outlook signatures with embedded MSO conditionals.
 * - Name 1–80 chars.
 */
export const signatureImportSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Give this signature a name' })
    .max(80, { message: 'Name must be 80 characters or fewer' }),
  html: z
    .string()
    .trim()
    .min(1, { message: 'Paste your HTML signature' })
    .max(200_000, { message: 'Signature is too large (limit 200 KB)' }),
});

export type SignatureImportInput = z.infer<typeof signatureImportSchema>;
