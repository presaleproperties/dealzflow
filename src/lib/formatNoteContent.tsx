import { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

// Matches http(s) URLs and bare www.* URLs. Trailing punctuation is trimmed.
const URL_REGEX = /(\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+)/gi;
const TRAILING_PUNCT = /[.,;:!?)\]]+$/;

function normalizeHref(raw: string): string {
  return raw.startsWith('http') ? raw : `https://${raw}`;
}

function prettyHost(raw: string): string {
  try {
    const u = new URL(normalizeHref(raw));
    return (u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '')).replace(/\/$/, '');
  } catch {
    return raw;
  }
}

/**
 * Renders text with auto-detected URLs as clickable chips.
 * Use anywhere note/body/field text is rendered.
 */
export function LinkifiedText({ text, className }: { text: string; className?: string }): JSX.Element {
  if (!text) return <span className={className} />;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;
  let key = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    let url = match[0];
    const trailing = url.match(TRAILING_PUNCT)?.[0] ?? '';
    if (trailing) url = url.slice(0, -trailing.length);
    const start = match.index;
    const end = start + url.length;

    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    nodes.push(
      <a
        key={`lnk-${key++}`}
        href={normalizeHref(url)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 max-w-full align-baseline text-primary hover:text-primary/80 underline decoration-primary/40 hover:decoration-primary underline-offset-2 break-all"
        title={url}
      >
        <span className="truncate">{prettyHost(url)}</span>
        <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
      </a>
    );

    if (trailing) nodes.push(trailing);
    lastIndex = end + trailing.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  return <span className={className}>{nodes}</span>;
}

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
