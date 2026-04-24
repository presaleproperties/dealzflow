/**
 * Clean and structure imported lead notes.
 * Imported notes from Lofty/Zapier often contain:
 *  - HTML entities (&nbsp;, &amp;, &#39;, etc.)
 *  - Multiple notes concatenated with inline `(Mon DD,YYYY at HH:MM:SS AM/PM)` timestamps
 *  - Auto-generated zapier/system blurbs mixed in
 *
 * We split on the timestamp pattern, strip noise, and return an array of
 * { text, timestamp } entries sorted newest-first.
 */

export interface NoteEntry {
  text: string;
  timestamp: string | null;
}

const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function decodeEntities(s: string): string {
  let out = s;
  for (const [k, v] of Object.entries(ENTITY_MAP)) {
    out = out.split(k).join(v);
  }
  // Numeric entities &#123;
  out = out.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  return out;
}

// Matches `(Mar 5,2026 at 06:31:09 PM)` or `(Mar 5, 2026 at 6:31 PM)`
const TIMESTAMP_RE = /\(([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)\)/gi;

export function parseImportedNotes(raw: string | null | undefined): NoteEntry[] {
  if (!raw) return [];
  const decoded = decodeEntities(raw).replace(/\r\n/g, '\n');

  const entries: NoteEntry[] = [];
  let lastIndex = 0;
  let lastText = '';

  // Walk through timestamps, slicing the preceding text into a note.
  const matches = Array.from(decoded.matchAll(TIMESTAMP_RE));

  if (matches.length === 0) {
    // No inline timestamps — return as a single entry.
    const cleaned = cleanText(decoded);
    return cleaned ? [{ text: cleaned, timestamp: null }] : [];
  }

  for (const m of matches) {
    const text = decoded.slice(lastIndex, m.index).trim();
    const ts = `${m[1]} ${m[2]}, ${m[3]} · ${m[4]}`;
    if (text) {
      entries.push({ text: cleanText(text), timestamp: ts });
    }
    lastIndex = (m.index ?? 0) + m[0].length;
    lastText = ts;
  }

  // Trailing text after the last timestamp (no timestamp of its own)
  const trailing = decoded.slice(lastIndex).trim();
  if (trailing) {
    const cleaned = cleanText(trailing);
    if (cleaned) entries.push({ text: cleaned, timestamp: null });
  }

  // Filter out empties produced by cleaning
  return entries.filter(e => e.text.length > 0);
}

function cleanText(s: string): string {
  return s
    // Strip "zapier:" prefixes that prepend syndicated blurbs
    .replace(/^zapier:\s*/i, '')
    // Collapse whitespace runs but preserve line breaks
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    // Insert a space when sentences run together with no space after period
    .replace(/([.!?])([A-Z])/g, '$1 $2')
    .trim();
}
