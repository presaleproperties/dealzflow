import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
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
  if (isYesterday(d)) return `Yesterday, ${format(d, 'h:mm a')}`;
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

/**
 * Some inbound emails (esp. Apple Mail / Outlook marketing) leak the inner
 * contents of <style> / <script> blocks into the plain-text alternative.
 * Strip CSS rule blocks ("selector { … }"), MSO conditional comments, and
 * @-rules so they don't show up as visible text in the reading pane.
 */
function stripLeakedCss(s: string): string {
  if (!s) return s;
  let out = s;
  // Drop @media / @font-face / @import blocks (with their balanced braces).
  out = out.replace(/@[a-z-]+[^{};]*\{[\s\S]*?\}\s*\}?/gi, '');
  // Drop MSO conditional comments left behind as text.
  out = out.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '');
  // Drop CSS rule blocks: anything that looks like "selector { prop:value; … }"
  // We only strip when the block contains a CSS-like declaration to avoid
  // nuking JSON-y content. Run several passes for nested/sibling rules.
  const cssBlock = /(^|[\s,>+~}])([a-zA-Z#.\[\]:*\-_ ()="',\d>+~|^$]+)\{[^{}]*?:[^{}]*?\}/g;
  for (let i = 0; i < 4; i++) {
    const next = out.replace(cssBlock, '$1');
    if (next === out) break;
    out = next;
  }
  // Tidy up runs of blank lines left behind.
  out = out.replace(/\n{3,}/g, '\n\n').trimStart();
  return out;
}


/** True when the string is a full HTML document (has <html>...</html>). */
function isFullHtmlDocument(s: string): boolean {
  return /<html[\s>]/i.test(s) && /<\/html\s*>/i.test(s);
}

/** Auto-link URLs and email addresses inside plain-text bodies. */
const LINK_RE = /((?:https?:\/\/|www\.)[^\s<>()]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
function linkify(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const raw = m[0];
    const isEmail = raw.includes('@') && !/^https?:\/\//i.test(raw);
    const href = isEmail ? `mailto:${raw}` : (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    nodes.push(
      <a
        key={`l-${m.index}`}
        href={href}
        target={isEmail ? undefined : '_blank'}
        rel="noreferrer"
        className="text-[#1a73e8] underline underline-offset-2 break-all [overflow-wrap:anywhere]"
        onClick={(e) => e.stopPropagation()}
      >
        {raw}
      </a>,
    );
    last = m.index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * Sanitize email HTML before rendering inside an iframe srcdoc.
 * Uses DOMPurify with a permissive HTML profile so styled marketing emails
 * still look correct, while stripping <script>, on*= handlers, javascript:
 * URIs, and unsafe SVG/MathML constructs.
 */
function sanitizeForIframe(html: string): string {
  return DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'background', 'bgcolor', 'align', 'valign', 'border', 'cellpadding', 'cellspacing'],
    FORBID_TAGS: ['script', 'style', 'object', 'embed', 'iframe', 'form', 'input', 'button', 'meta', 'link'],
    FORBID_ATTR: ['srcdoc'],
    ALLOW_DATA_ATTR: false,
  });
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
    // Outlook-style header block ("From: …" optionally followed by Sent/To/Subject).
    if (/^\s*From:\s/i.test(lines[i])) {
      return { main: lines.slice(0, i).join('\n').trimEnd(), quoted: lines.slice(i).join('\n') };
    }
  }
  // Fallback: handle single-line dumps where the entire history was flattened
  // into one paragraph (no newlines). Cut at the first "From: … Sent: … To: … Subject:"
  // run or "On <date> … wrote:" inline marker.
  const inlineMarkers: RegExp[] = [
    /\s+From:\s+[^]+?\s+Sent:\s+[^]+?\s+To:\s+[^]+?\s+Subject:\s+/i,
    /\s+On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s\S]{1,200}wrote:\s+/i,
    /\s+-{2,}\s*Original Message\s*-{2,}\s+/i,
  ];
  for (const re of inlineMarkers) {
    const m = text.match(re);
    if (m && m.index !== undefined && m.index > 20) {
      return { main: text.slice(0, m.index).trimEnd(), quoted: text.slice(m.index).trimStart() };
    }
  }
  return { main: text, quoted: null };
}


/** Wrap user HTML in a minimal document so the iframe inherits sane defaults.
 *  When the source is already a full <html>…</html> document (most marketing
 *  emails), use it verbatim — only injecting <base target="_blank"> so links
 *  open in a new tab and a small reset to keep table-based layouts fluid.
 */
function buildSrcDoc(html: string, frameId: string): string {
  const baseAndReset = `
    <base target="_blank"/>
    <style>
      html,body{margin:0;padding:0;background:transparent}
      img,table{max-width:100% !important;height:auto}
      [width],[style*="width"]{max-width:100% !important}
      a{color:#1a73e8}
    </style>`;

  // Posted from inside the sandboxed (no allow-same-origin) iframe so the
  // parent can size the frame to fit its content. We control this script
  // entirely; user HTML cannot tamper with it because the parent matches
  // the frameId before accepting messages.
  const sizer = `
    <script>(function(){
      var id = ${JSON.stringify(frameId)};
      function send(){
        try{
          var h = Math.max(
            document.documentElement && document.documentElement.scrollHeight || 0,
            document.body && document.body.scrollHeight || 0
          );
          parent.postMessage({ __emailFrame: id, height: h }, '*');
        }catch(e){}
      }
      window.addEventListener('load', send);
      window.addEventListener('resize', send);
      try {
        var ro = new ResizeObserver(send);
        ro.observe(document.documentElement);
        if (document.body) ro.observe(document.body);
      } catch(e) {}
      var imgs = document.querySelectorAll('img');
      imgs.forEach(function(img){
        if(!img.complete){ img.addEventListener('load', send); img.addEventListener('error', send); }
      });
      setTimeout(send, 50);
      setTimeout(send, 400);
    })();</script>`;

  if (isFullHtmlDocument(html)) {
    let out = html;
    if (/<head[\s>]/i.test(out)) {
      out = out.replace(/<\/head\s*>/i, `${baseAndReset}</head>`);
    } else {
      out = out.replace(/<html([^>]*)>/i, `<html$1><head>${baseAndReset}</head>`);
    }
    if (/<\/body\s*>/i.test(out)) {
      out = out.replace(/<\/body\s*>/i, `${sizer}</body>`);
    } else {
      out += sizer;
    }
    return out;
  }

  return `<!doctype html><html><head><meta charset="utf-8"/>${baseAndReset}
  <style>
    html,body{color:#1a1a1a;
      font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
      word-wrap:break-word;overflow-wrap:anywhere}
    table{border-collapse:collapse}
    blockquote{margin:0 0 0 8px;padding:0 0 0 12px;border-left:3px solid #e0e0e0;color:#5f6368}
    pre{white-space:pre-wrap;word-break:break-word}
  </style></head><body>${html}${sizer}</body></html>`;
}

/** Iframe that auto-resizes via postMessage from a controlled sizer script.
 *  Sandbox INTENTIONALLY omits `allow-same-origin` — that combo with
 *  `allow-scripts` would let untrusted email content read parent cookies
 *  / localStorage. Our sizer only postMessages out; user JS is stripped
 *  by DOMPurify before render anyway. */
function HtmlBodyFrame({ html, messageId }: { html: string; messageId: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const frameId = useMemo(() => `emf-${messageId}`, [messageId]);
  const [height, setHeight] = useState<number>(120);
  const srcDoc = useMemo(
    () => buildSrcDoc(sanitizeForIframe(decodeHtmlEntities(html)), frameId),
    [html, frameId],
  );

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { __emailFrame?: string; height?: number } | null;
      if (!data || data.__emailFrame !== frameId) return;
      const h = Number(data.height) || 0;
      if (h > 0) setHeight((prev) => (Math.abs(prev - h) > 2 ? h : prev));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frameId]);

  return (
    <iframe
      key={messageId}
      ref={ref}
      title="Email message body"
      srcDoc={srcDoc}
      sandbox="allow-popups allow-scripts"
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

  // Decode entity-encoded markup so emails synced through JSON webhooks render
  // as real HTML instead of "&lt;p&gt;hello&lt;/p&gt;" text.
  const decodedHtml = useMemo(() => (html ? decodeHtmlEntities(html) : ''), [html]);
  const decodedText = useMemo(() => (text ? stripLeakedCss(decodeHtmlEntities(text)) : ''), [text]);
  const isHtml = looksLikeHtml(decodedHtml) || looksLikeHtml(decodedText);
  const rawBody = (decodedHtml && decodedHtml.trim()) ? decodedHtml : (decodedText ?? '');
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
              {linkify(main)}
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
                      {linkify(quoted)}
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
