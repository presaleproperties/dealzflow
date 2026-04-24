import { ReactNode, useEffect, useState } from 'react';
import { ExternalLink, Globe, Link2, Lock, ShieldAlert } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  getTimelineLinkBehavior,
  subscribeTimelineLinkBehavior,
  type TimelineLinkBehavior,
} from '@/lib/timelineLinkPref';

/* ──────────────────────────────────────────────────────────────────
   URL / email detection
   ──────────────────────────────────────────────────────────────────
   Handles:
   - http:// and https:// URLs
   - Bare www.* URLs (no protocol)
   - Bare domain URLs like "example.com/foo" — only when the TLD is in
     a known allowlist, to avoid false positives (e.g. "node.js", "v2.0").
   - mailto: links
   - Plain email addresses (rendered as mailto)
   - Trailing punctuation stripped: . , ; : ! ? ) ] } ' " > and
     unmatched closing parens like in "(see foo.com/bar)".
   ────────────────────────────────────────────────────────────────── */

// TLDs we'll auto-link without a protocol. Keep conservative — common ones
// plus the most likely real-estate / business TLDs we encounter.
const BARE_DOMAIN_TLDS = [
  'com', 'org', 'net', 'io', 'co', 'ca', 'us', 'uk', 'eu', 'au', 'nz',
  'app', 'dev', 'ai', 'me', 'tv', 'xyz', 'info', 'biz', 'gov', 'edu',
  'realtor', 'realestate', 'properties', 'homes', 'house',
];
const TLD_GROUP = BARE_DOMAIN_TLDS.join('|');

// Combined matcher. Order matters: specific protocols first, then bare URLs,
// then emails. We use named alternatives so we can dispatch on type.
const TOKEN_REGEX = new RegExp(
  [
    // mailto:user@host
    String.raw`\bmailto:[^\s<>"'()]+`,
    // Full http(s) URLs
    String.raw`\bhttps?:\/\/[^\s<>"'()]+`,
    // www.* bare URLs
    String.raw`\bwww\.[^\s<>"'()]+`,
    // Bare domain URLs (e.g. example.com/foo?x=1) — TLD allowlist
    String.raw`\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:` + TLD_GROUP + String.raw`)\b(?:[\/?#][^\s<>"'()]*)?`,
    // Plain emails
    String.raw`\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b`,
  ].join('|'),
  'gi',
);

const TRAILING_PUNCT = /[.,;:!?'"`>\]}]+$/;

/** Strip trailing punctuation and unmatched closing parens from a captured URL. */
function trimUrlBoundary(raw: string): { value: string; trailing: string } {
  let url = raw;
  let trailing = '';
  // 1) plain trailing punctuation
  const m = url.match(TRAILING_PUNCT);
  if (m) {
    trailing = m[0] + trailing;
    url = url.slice(0, -m[0].length);
  }
  // 2) unmatched closing parens (e.g. "(see foo.com/bar)")
  while (url.endsWith(')')) {
    const opens = (url.match(/\(/g) || []).length;
    const closes = (url.match(/\)/g) || []).length;
    if (closes <= opens) break;
    trailing = ')' + trailing;
    url = url.slice(0, -1);
  }
  // 3) re-check punctuation after paren stripping
  const m2 = url.match(TRAILING_PUNCT);
  if (m2) {
    trailing = m2[0] + trailing;
    url = url.slice(0, -m2[0].length);
  }
  return { value: url, trailing };
}

type LinkKind = 'url' | 'email';

function classifyToken(raw: string): LinkKind {
  const lower = raw.toLowerCase();
  if (lower.startsWith('mailto:')) return 'email';
  // Plain email: contains "@" but no "/" before it
  if (/^[^\/\s]+@[^\/\s]+\.[a-z]{2,}$/i.test(raw)) return 'email';
  return 'url';
}

function normalizeHref(raw: string, kind: LinkKind = 'url'): string {
  if (kind === 'email') {
    return raw.toLowerCase().startsWith('mailto:') ? raw : `mailto:${raw}`;
  }
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function prettyHost(raw: string, kind: LinkKind = 'url'): string {
  if (kind === 'email') {
    return raw.replace(/^mailto:/i, '');
  }
  try {
    const u = new URL(normalizeHref(raw));
    return (u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '')).replace(/\/$/, '');
  } catch {
    return raw;
  }
}

function parseUrlMeta(raw: string) {
  try {
    const u = new URL(normalizeHref(raw));
    const params = Array.from(u.searchParams.entries()).slice(0, 8);
    return {
      host: u.hostname.replace(/^www\./, ''),
      path: u.pathname || '/',
      protocol: u.protocol.replace(':', ''),
      isSecure: u.protocol === 'https:',
      params,
      full: u.toString(),
    };
  } catch {
    return null;
  }
}

export interface LinkContext {
  contactId?: string | null;
  noteId?: string | null;
  source?: string | null;
}

async function trackClick(url: string, ctx?: LinkContext) {
  try {
    await supabase.rpc('log_timeline_link_click' as any, {
      _url: url,
      _contact_id: ctx?.contactId ?? null,
      _note_id: ctx?.noteId ?? null,
      _source: ctx?.source ?? null,
    });
  } catch {
    // best-effort, never block navigation
  }
}

function useTimelineLinkBehavior(): TimelineLinkBehavior {
  const [behavior, setBehavior] = useState<TimelineLinkBehavior>(() => getTimelineLinkBehavior());
  useEffect(() => subscribeTimelineLinkBehavior(setBehavior), []);
  return behavior;
}

function LinkPreview({ url, label, ctx }: { url: string; label: string; ctx?: LinkContext }) {
  const meta = parseUrlMeta(url);
  const href = normalizeHref(url);
  const behavior = useTimelineLinkBehavior();

  // Direct-open mode: skip the popover entirely.
  if (behavior === 'open') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.stopPropagation();
          trackClick(href, ctx);
        }}
        className="inline-flex items-center gap-1 max-w-full align-baseline text-primary hover:text-primary/80 underline decoration-primary/40 hover:decoration-primary underline-offset-2 break-all"
        title={url}
      >
        <span className="truncate">{label}</span>
        <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
      </a>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 max-w-full align-baseline text-primary hover:text-primary/80 underline decoration-primary/40 hover:decoration-primary underline-offset-2 break-all"
          title={url}
        >
          <span className="truncate">{label}</span>
          <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        align="start"
      >
        <div className="bg-muted/40 p-3 border-b">
          <div className="flex items-start gap-2">
            <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate">{meta?.host || url}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                {meta?.isSecure ? (
                  <><Lock className="h-3 w-3" /> Secure (HTTPS)</>
                ) : (
                  <><ShieldAlert className="h-3 w-3 text-amber-500" /> Not secure</>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="p-3 space-y-2 text-xs">
          {meta?.path && meta.path !== '/' && (
            <div>
              <div className="text-muted-foreground uppercase tracking-wide text-[10px] mb-0.5">Path</div>
              <div className="font-mono break-all">{meta.path}</div>
            </div>
          )}
          {meta && meta.params.length > 0 && (
            <div>
              <div className="text-muted-foreground uppercase tracking-wide text-[10px] mb-0.5">Query</div>
              <div className="space-y-0.5">
                {meta.params.map(([k, v], i) => (
                  <div key={i} className="flex gap-2 font-mono">
                    <span className="text-muted-foreground shrink-0">{k}:</span>
                    <span className="break-all truncate">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-muted-foreground uppercase tracking-wide text-[10px] mb-0.5 flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Full URL
            </div>
            <div className="font-mono break-all text-[11px] bg-muted/40 p-2 rounded">{href}</div>
          </div>
        </div>
        <div className="p-2 border-t flex gap-2">
          <Button size="sm" className="flex-1" asChild>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => { trackClick(href, ctx); }}
            >
              <ExternalLink className="h-3 w-3 mr-1" /> Open in new tab
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(href);
              trackClick(href, { ...ctx, source: (ctx?.source ?? '') + ':copy' });
            }}
          >
            Copy
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Renders text with auto-detected URLs as clickable chips that open
 * a metadata preview popover before navigating away.
 * Pass `context` to attribute clicks to a specific lead/note in analytics.
 */
export function LinkifiedText({
  text,
  className,
  context,
}: {
  text: string;
  className?: string;
  context?: LinkContext;
}): JSX.Element {
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

    nodes.push(<LinkPreview key={`lnk-${key++}`} url={url} label={prettyHost(url)} ctx={context} />);

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
