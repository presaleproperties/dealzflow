import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, CornerUpLeft, CornerUpRight, Forward, MoreHorizontal, Paperclip, Mail } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { Button } from '@/components/ui/button';

/**
 * Gmail/Superhuman-style email message view.
 *
 * Renders one message in a card with:
 *  - From / To / Subject header (collapsible details on click)
 *  - HTML body sandboxed in an auto-sizing iframe (so styles can't leak
 *    and remote images/CSS render natively, not as raw text)
 *  - Plain text fallback when the message has no HTML
 *  - Quoted-reply chain auto-collapsed behind a "..." toggle
 *  - Attachment chips (filename + size, click opens)
 *  - Reply / Reply All / Forward action row on the latest message
 *
 * Used inside CrmChatThreadPage for `channel === 'email'`.
 */
export interface EmailAttachment {
  name: string;
  size?: number | null;
  url?: string | null;
  contentType?: string | null;
}

export interface EmailMessageViewProps {
  /** Stable message id (used for iframe key and shortcuts). */
  id: string;
  direction: 'inbound' | 'outbound';
  /** Display name of the sender, e.g. "Uzair Muhammad" or your own name. */
  fromName: string;
  fromEmail?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  /** ISO timestamp. */
  createdAt: string;
  /** Raw HTML body, if any. Will be sandboxed. */
  html?: string | null;
  /** Plain text body, used when html is missing. */
  text?: string | null;
  attachments?: EmailAttachment[];
  /** Whether to expand the message body by default. Latest message: true. */
  defaultExpanded?: boolean;
  /** Controlled expansion — when provided, overrides internal state. */
  expanded?: boolean;
  /** Called when the user toggles the header. Pair with `expanded` for full control. */
  onExpandedChange?: (next: boolean) => void;
  /** Optional action row — only show on latest message. */
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  /** Optional avatar bg color */
  accentColor?: string;
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (isToday(d))     return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday, h:mm a`.replace('h:mm a', format(d, 'h:mm a'));
  return format(d, 'MMM d, yyyy · h:mm a');
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function fmtBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Heuristic: looks like HTML if it has at least one tag-ish token. */
function looksLikeHtml(s: string | null | undefined): boolean {
  if (!s) return false;
  // Real tags
  if (/<\/?[a-z][\s\S]*?>/i.test(s)) return true;
  // HTML-entity-encoded markup ("&lt;p&gt;hello") — common when synced through
  // some inbound webhooks that JSON-escape the body.
  if (/&lt;\/?[a-z][\s\S]*?&gt;/i.test(s)) return true;
  return false;
}

/** Decode HTML entities so encoded markup ("&lt;p&gt;") becomes real HTML. */
function decodeHtmlEntities(s: string): string {
  if (!/&(?:lt|gt|amp|quot|#39|nbsp|#x?\d+);/i.test(s)) return s;
  const ta = document.createElement('textarea');
  ta.innerHTML = s;
  return ta.value;
}

/** True when the string is a full HTML document (has <html>...</html>). */
function isFullHtmlDocument(s: string): boolean {
  return /<html[\s>]/i.test(s) && /<\/html\s*>/i.test(s);
}

/** Strip <script> and on*= handlers as a defense-in-depth before iframe srcdoc. */
function sanitizeForIframe(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    // Strip javascript: URIs in href/src
    .replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");
}

/**
 * Split the body into "main" + "quoted" so we can collapse the chain.
 * Heuristics that work for Gmail / Outlook / Apple Mail / our own replies:
 *   - "On <date>, X <email> wrote:"
 *   - blockquote with class="gmail_quote"
 *   - "-----Original Message-----"
 *   - "From: ... Sent: ... To: ... Subject:"
 *   - leading "> " quoted lines (plain text)
 */
function splitQuoted(html: string): { main: string; quoted: string | null } {
  const markers = [
    /<blockquote[^>]*(?:gmail_quote|class="gmail_quote")[\s\S]*$/i,
    /<div[^>]*(?:gmail_quote|class="gmail_quote")[\s\S]*$/i,
    /<div[^>]*OutlookMessageHeader[\s\S]*$/i,
    /On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s\S]{1,200}wrote:[\s\S]*$/i,
    /-{2,}\s*Original Message\s*-{2,}[\s\S]*$/i,
    /<hr[^>]*>\s*From:[\s\S]*Subject:[\s\S]*$/i,
  ];
  for (const re of markers) {
    const m = html.match(re);
    if (m && m.index !== undefined && m.index > 20) {
      return { main: html.slice(0, m.index), quoted: html.slice(m.index) };
    }
  }
  return { main: html, quoted: null };
}

function splitQuotedText(text: string): { main: string; quoted: string | null } {
  const lines = text.split('\n');
  // Find first contiguous run of quoted lines (>= 2 lines starting with ">")
  for (let i = 1; i < lines.length; i++) {
    if (/^>\s?/.test(lines[i]) && /^>\s?/.test(lines[i + 1] ?? '')) {
      return { main: lines.slice(0, i).join('\n').trimEnd(), quoted: lines.slice(i).join('\n') };
    }
    if (/^On\s.+wrote:\s*$/i.test(lines[i])) {
      return { main: lines.slice(0, i).join('\n').trimEnd(), quoted: lines.slice(i).join('\n') };
    }
    if (/^-{2,}\s*Original Message\s*-{2,}\s*$/i.test(lines[i])) {
      return { main: lines.slice(0, i).join('\n').trimEnd(), quoted: lines.slice(i).join('\n') };
    }
  }
  return { main: text, quoted: null };
}

/** Wrap user HTML in a minimal document so the iframe inherits sane defaults.
 *  When the source is already a full <html>…</html> document (most marketing
 *  emails), use it verbatim — only injecting <base target="_blank"> so links
 *  open in a new tab and a small reset to keep table-based layouts fluid.
 */
function buildSrcDoc(html: string): string {
  const baseAndReset = `
    <base target="_blank"/>
    <style>
      html,body{margin:0;padding:0;background:transparent}
      img,table{max-width:100% !important;height:auto}
      [width],[style*="width"]{max-width:100% !important}
      a{color:#1a73e8}
    </style>`;

  if (isFullHtmlDocument(html)) {
    // Inject <base> + reset just before </head>; if no <head>, add one.
    if (/<head[\s>]/i.test(html)) {
      return html.replace(/<\/head\s*>/i, `${baseAndReset}</head>`);
    }
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${baseAndReset}</head>`);
  }

  return `<!doctype html><html><head><meta charset="utf-8"/>${baseAndReset}
  <style>
    html,body{color:#1a1a1a;
      font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
      word-wrap:break-word;overflow-wrap:anywhere}
    table{border-collapse:collapse}
    blockquote{margin:0 0 0 8px;padding:0 0 0 12px;border-left:3px solid #e0e0e0;color:#5f6368}
    pre{white-space:pre-wrap;word-break:break-word}
  </style></head><body>${html}</body></html>`;
}

/** Iframe that auto-resizes to fit its rendered HTML. */
function HtmlBodyFrame({ html, messageId }: { html: string; messageId: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState<number>(80);
  const srcDoc = useMemo(() => buildSrcDoc(sanitizeForIframe(decodeHtmlEntities(html))), [html]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const measure = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        const h = Math.max(
          doc.documentElement?.scrollHeight ?? 0,
          doc.body?.scrollHeight ?? 0,
        );
        if (h > 0 && Math.abs(h - height) > 2) setHeight(h);
      } catch { /* cross-origin (won't happen with srcdoc) */ }
    };
    const onLoad = () => {
      measure();
      // Watch for late-loading images to reflow
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        const imgs = doc.querySelectorAll('img');
        imgs.forEach((img) => {
          if (!(img as HTMLImageElement).complete) {
            img.addEventListener('load', measure, { once: true });
            img.addEventListener('error', measure, { once: true });
          }
        });
        // Resize observer on body for dynamic content
        const ro = new ResizeObserver(measure);
        if (doc.body) ro.observe(doc.body);
        (frame as any).__ro = ro;
      } catch { /* noop */ }
    };
    frame.addEventListener('load', onLoad);
    return () => {
      frame.removeEventListener('load', onLoad);
      const ro = (frame as any).__ro as ResizeObserver | undefined;
      try { ro?.disconnect(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcDoc]);

  return (
    <iframe
      key={messageId}
      ref={ref}
      title="Email message body"
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups"
      className="w-full block bg-transparent"
      style={{ height, border: 0 }}
    />
  );
}

export function EmailMessageView({
  id, direction, fromName, fromEmail, toEmail, subject, createdAt,
  html, text, attachments = [], defaultExpanded = true,
  expanded: controlledExpanded, onExpandedChange,
  onReply, onReplyAll, onForward, accentColor = 'hsl(220 75% 55%)',
}: EmailMessageViewProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = controlledExpanded !== undefined;
  const expanded = isControlled ? !!controlledExpanded : internalExpanded;
  const setExpanded = (next: boolean | ((p: boolean) => boolean)) => {
    const value = typeof next === 'function' ? (next as (p: boolean) => boolean)(expanded) : next;
    if (!isControlled) setInternalExpanded(value);
    onExpandedChange?.(value);
  };
  const [showQuoted, setShowQuoted] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);

  const isHtml = looksLikeHtml(html) || looksLikeHtml(text);
  const rawBody = (html && html.trim()) ? html : (text ?? '');
  const { main, quoted } = useMemo(() => {
    if (!rawBody) return { main: '', quoted: null as string | null };
    return looksLikeHtml(rawBody) ? splitQuoted(rawBody) : splitQuotedText(rawBody);
  }, [rawBody]);

  const stamp = formatStamp(createdAt);
  const subjectLine = (subject || '').replace(/^(re:|fwd?:)\s*/i, (m) => m.toUpperCase());

  // Collapsed preview: first ~120 chars of plaintext
  const previewText = useMemo(() => {
    if (!rawBody) return '';
    const tmp = looksLikeHtml(rawBody) ? rawBody.replace(/<[^>]+>/g, ' ') : rawBody;
    return tmp.replace(/\s+/g, ' ').trim().slice(0, 140);
  }, [rawBody]);

  return (
    <article className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      {/* Header row */}
      <header
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-semibold shrink-0 ring-1 ring-white/10 shadow-sm"
          style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor} 100%)`, opacity: 0.92 }}
        >
          {initialsOf(fromName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-foreground truncate">{fromName}</span>
            {fromEmail && (
              <span className="text-[12px] text-muted-foreground truncate">&lt;{fromEmail}&gt;</span>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">{stamp}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowHeaders((v) => !v); }}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
              aria-label="Toggle full headers"
            >
              {showHeaders ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span>to {toEmail || 'me'}</span>
            </button>
            {attachments.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Paperclip className="w-3 h-3" />
                {attachments.length}
              </span>
            )}
            {!expanded && previewText && (
              <span className="text-[12px] text-muted-foreground/80 truncate ml-2 flex-1 min-w-0">
                {previewText}
              </span>
            )}
          </div>
          {showHeaders && (
            <dl className="mt-2 grid grid-cols-[60px_1fr] gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <dt className="font-medium">From</dt>
              <dd className="truncate text-foreground/80">{fromName} {fromEmail ? `<${fromEmail}>` : ''}</dd>
              <dt className="font-medium">To</dt>
              <dd className="truncate text-foreground/80">{toEmail || '—'}</dd>
              {subjectLine && (
                <>
                  <dt className="font-medium">Subject</dt>
                  <dd className="truncate text-foreground/80">{subjectLine}</dd>
                </>
              )}
              <dt className="font-medium">Date</dt>
              <dd className="text-foreground/80">{format(new Date(createdAt), "EEE, MMM d, yyyy · h:mm a")}</dd>
            </dl>
          )}
        </div>
      </header>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-3">
          {subjectLine && (
            <h2 className="text-[15px] font-semibold text-foreground mb-2 leading-tight tracking-tight">
              {subjectLine}
            </h2>
          )}

          {!rawBody ? (
            <p className="text-[13px] italic text-muted-foreground">(empty message)</p>
          ) : isHtml && looksLikeHtml(main) ? (
            <HtmlBodyFrame html={main} messageId={id} />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed text-foreground/90 m-0">
              {main}
            </pre>
          )}

          {quoted && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowQuoted((v) => !v)}
                className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-muted/60 hover:bg-muted text-muted-foreground text-[14px] leading-none"
                aria-label={showQuoted ? 'Hide quoted text' : 'Show quoted text'}
                title={showQuoted ? 'Hide quoted text' : 'Show quoted text'}
              >
                · · ·
              </button>
              {showQuoted && (
                <div className="mt-2 border-l-2 border-border/60 pl-3">
                  {looksLikeHtml(quoted) ? (
                    <HtmlBodyFrame html={quoted} messageId={`${id}-q`} />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-muted-foreground m-0">
                      {quoted}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <a
                  key={i}
                  href={a.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted text-[12px] text-foreground/90 transition-colors max-w-[260px]"
                >
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{a.name}</span>
                  {a.size ? <span className="text-muted-foreground tabular-nums shrink-0">{fmtBytes(a.size)}</span> : null}
                </a>
              ))}
            </div>
          )}

          {(onReply || onReplyAll || onForward) && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {onReply && (
                <Button variant="outline" size="sm" className="rounded-full h-8" onClick={onReply}>
                  <CornerUpLeft className="w-3.5 h-3.5 mr-1.5" /> Reply
                </Button>
              )}
              {onReplyAll && (
                <Button variant="outline" size="sm" className="rounded-full h-8" onClick={onReplyAll}>
                  <CornerUpLeft className="w-3.5 h-3.5 mr-1.5" /> Reply all
                </Button>
              )}
              {onForward && (
                <Button variant="outline" size="sm" className="rounded-full h-8" onClick={onForward}>
                  <Forward className="w-3.5 h-3.5 mr-1.5" /> Forward
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/** Build a Gmail-style quoted reply prefix to inject into the composer body. */
export function buildReplyQuote(opts: {
  fromName: string;
  fromEmail?: string | null;
  createdAt: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
}): string {
  const dateLine = format(new Date(opts.createdAt), "EEE, MMM d, yyyy 'at' h:mm a");
  const who = opts.fromEmail ? `${opts.fromName} <${opts.fromEmail}>` : opts.fromName;
  const inner = (opts.bodyHtml && opts.bodyHtml.trim())
    ? opts.bodyHtml
    : (opts.bodyText ?? '').replace(/[&<>]/g, (c) => (
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'
    )).replace(/\n/g, '<br/>');
  return [
    '<p><br/></p>',
    `<p style="color:#5f6368;font-size:12px;margin:8px 0">On ${dateLine}, ${who} wrote:</p>`,
    `<blockquote style="margin:0 0 0 8px;padding:0 0 0 12px;border-left:3px solid #e0e0e0;color:#5f6368">${inner}</blockquote>`,
  ].join('');
}

export function buildForwardQuote(opts: {
  fromName: string;
  fromEmail?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  createdAt: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
}): string {
  const dateLine = format(new Date(opts.createdAt), "EEE, MMM d, yyyy 'at' h:mm a");
  const inner = (opts.bodyHtml && opts.bodyHtml.trim())
    ? opts.bodyHtml
    : (opts.bodyText ?? '').replace(/[&<>]/g, (c) => (
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'
    )).replace(/\n/g, '<br/>');
  return [
    '<p><br/></p>',
    '<p style="color:#5f6368;font-size:12px;margin:8px 0">---------- Forwarded message ----------</p>',
    `<p style="color:#5f6368;font-size:12px;margin:2px 0"><strong>From:</strong> ${opts.fromName}${opts.fromEmail ? ` &lt;${opts.fromEmail}&gt;` : ''}</p>`,
    `<p style="color:#5f6368;font-size:12px;margin:2px 0"><strong>Date:</strong> ${dateLine}</p>`,
    opts.subject ? `<p style="color:#5f6368;font-size:12px;margin:2px 0"><strong>Subject:</strong> ${opts.subject}</p>` : '',
    opts.toEmail ? `<p style="color:#5f6368;font-size:12px;margin:2px 0"><strong>To:</strong> ${opts.toEmail}</p>` : '',
    `<div style="margin-top:8px">${inner}</div>`,
  ].filter(Boolean).join('');
}

export default EmailMessageView;
