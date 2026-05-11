/**
 * Parses presale-ingest auto-notes into a clean key/value structure.
 *
 * Bridge ingest writes a single concatenated string like:
 *   "The system auto-updated lead info because Uzair inquired on
 *    PresaleProperties.comName: Uzair MuhammadEmail: muzair93@hotmail.com
 *    Phone: CA +17782313592 (Primary) | Mobile|Valid Number|User consent
 *    Lead Type: Buyer, Agent, OtherStage: New LeadsSource: PresaleProperties.com
 *    Owner: Uzair …"
 *
 * Field labels are jammed against the previous value with no separator.
 * We split on a known set of labels and return a tidy list. Free-form notes
 * that don't match any label fall through and are returned as a single
 * `intro` string so the caller can render them as-is.
 */

const LABELS = [
  'Name',
  'Email',
  'Phone',
  'Mobile',
  'Lead Type',
  'Stage',
  'Status',
  'Source',
  'Owner',
  'Tags',
  'Project',
  'Message',
  'Notes',
  'Form',
  'Landing Page',
  'UTM Source',
  'UTM Medium',
  'UTM Campaign',
  'Persona',
] as const;

export interface ParsedLeadNote {
  /** Free-form sentence(s) before the first detected label. */
  intro: string;
  /** Ordered key/value pairs detected in the note. */
  fields: Array<{ label: string; value: string }>;
  /** True if at least one labeled field was detected. */
  isStructured: boolean;
}

export function parseLeadNote(raw: string | null | undefined): ParsedLeadNote {
  const empty: ParsedLeadNote = { intro: '', fields: [], isStructured: false };
  if (!raw) return empty;

  const text = String(raw).trim();
  if (!text) return empty;

  // Build a regex that matches any label followed by ":" with optional space.
  // We capture both the label and where it starts so we can slice values.
  const labelPattern = new RegExp(
    `(${LABELS.map((l) => l.replace(/ /g, '\\s?')).join('|')})\\s*:\\s*`,
    'gi',
  );

  const matches: Array<{ label: string; start: number; valueStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = labelPattern.exec(text)) !== null) {
    matches.push({
      label: normalizeLabel(m[1]),
      start: m.index,
      valueStart: m.index + m[0].length,
    });
  }

  if (matches.length === 0) {
    return { intro: text, fields: [], isStructured: false };
  }

  const intro = text.slice(0, matches[0].start).trim().replace(/[.,;:\s]+$/, '');

  const fields: Array<{ label: string; value: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const end = next ? next.start : text.length;
    let value = text.slice(cur.valueStart, end).trim();

    // Strip trailing pipe-junk like " | Mobile|Valid Number|User consent" off
    // a phone value when those tokens then appear as their own fields.
    value = value.replace(/\s*\|\s*$/, '');

    if (value) fields.push({ label: cur.label, value });
  }

  return { intro, fields, isStructured: true };
}

function normalizeLabel(label: string): string {
  const cleaned = label.replace(/\s+/g, ' ').trim();
  // Title-case multi-word labels
  return cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
