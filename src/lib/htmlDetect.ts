/**
 * Detect whether a string contains "rich" HTML that a plain rich-text editor
 * (e.g. Tiptap StarterKit) would flatten or strip.
 *
 * Rich = anything beyond simple paragraph/inline markup: tables, inline styles,
 * full document tags, font/center, image attributes, MSO/Outlook conditionals.
 */
export function isRichHtml(input: string): boolean {
  if (!input) return false;
  const s = input.trim();
  if (!s) return false;

  // Full email document markup
  if (/<(html|head|body|meta|style|center|font)[\s>]/i.test(s)) return true;

  // Tables — the #1 indicator of an HTML email signature
  if (/<(table|thead|tbody|tr|td|th|colgroup)[\s>]/i.test(s)) return true;

  // Inline styles on common containers
  if (/<(div|span|p|a|img|td|table)[^>]+style\s*=/i.test(s)) return true;

  // Outlook / MSO conditionals
  if (/<!--\s*\[if\s+(mso|gte mso|IE)/i.test(s)) return true;

  // Image with width/height/style attributes (typical signature avatar/logo)
  if (/<img[^>]+(width|height|style|class)\s*=/i.test(s)) return true;

  return false;
}
