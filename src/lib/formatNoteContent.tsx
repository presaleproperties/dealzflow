import { ReactNode } from 'react';

/**
 * Parses messy imported notes (Zapier "WEBSITE BEHAVIOR SUMMARY",
 * Lofty "system auto-updated lead info..." dumps) into clean
 * label/value pairs. Falls back to plain text when no structure detected.
 */

export interface ParsedNote {
  kind: 'website_behavior' | 'lead_inquiry' | 'plain';
  title?: string;
  source?: string;
  fields: { label: string; value: string }[];
  body?: string;
}

const SKIP_LABELS = new Set([
  '',
  'visitor id',
  'utm source',
  'utm medium',
  'utm campaign',
  'utm content',
  'utm term',
  'gclid',
  'fbclid',
]);

function cleanValue(v: string): string {
  return v.replace(/\s+/g, ' ').trim();
}

function splitKeyValueBlock(text: string): { label: string; value: string }[] {
  // Imported notes often lose newlines: "Name: FooEmail: bar@x.comPhone: ..."
  // We split on "<Word(s)>:" boundaries — capturing the label.
  const parts = text.split(/(?=\b[A-Z][A-Za-z0-9 _\/\-#]{0,40}:\s)/g);
  const out: { label: string; value: string }[] = [];
  for (const part of parts) {
    const m = part.match(/^([A-Z][A-Za-z0-9 _\/\-#]{0,40}):\s*(.*)$/s);
    if (!m) continue;
    const label = m[1].trim();
    const value = cleanValue(m[2]);
    if (!value) continue;
    if (SKIP_LABELS.has(label.toLowerCase())) continue;
    out.push({ label, value });
  }
  return out;
}

export function parseNoteContent(raw: string): ParsedNote {
  const text = (raw ?? '').trim();
  if (!text) return { kind: 'plain', fields: [], body: '' };

  // Website behavior summary (Zapier import)
  if (/website behavior summary/i.test(text)) {
    const body = text
      .replace(/^zapier:\s*/i, '')
      .replace(/=+\s*website behavior summary\s*=+/i, '')
      .trim();
    const fields = splitKeyValueBlock(body)
      .map(f => ({
        ...f,
        value: f.value.replace(/T(\d{2}:\d{2}):\d{2}\.[\d+:-]+/, ' $1'),
      }))
      .filter(f => f.value && f.value !== '-' && f.value !== ',');
    return { kind: 'website_behavior', title: 'Website behavior', source: 'PresaleProperties.com', fields };
  }

  // Lead inquiry / system auto-update
  if (/system auto-updated lead info|inquired on/i.test(text)) {
    const m = text.match(/inquired on\s+([A-Za-z0-9.\-]+)/i);
    const source = m?.[1];
    const fields = splitKeyValueBlock(text).filter(f => {
      const l = f.label.toLowerCase();
      return !['the system', 'system'].includes(l);
    });
    return { kind: 'lead_inquiry', title: 'New inquiry', source, fields };
  }

  return { kind: 'plain', fields: [], body: text };
}

export function formatNoteContent(raw: string): { parsed: ParsedNote; isStructured: boolean } {
  const parsed = parseNoteContent(raw);
  return { parsed, isStructured: parsed.kind !== 'plain' && parsed.fields.length > 0 };
}
