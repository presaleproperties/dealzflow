import { useMemo, useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ArrowDownLeft, ArrowUpRight, Eye, MousePointerClick, Mail, Reply } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';

/**
 * One row from `crm_email_log` (shape is intentionally permissive — the
 * activity timeline merges in some virtual fields, and not every column
 * is guaranteed to exist on every row).
 */
export type EmailLogRow = {
  id: string;
  subject?: string | null;
  body?: string | null;       // HTML body (server stores rendered HTML here)
  body_html?: string | null;
  body_text?: string | null;
  direction?: 'inbound' | 'outbound' | string | null;
  sent_at?: string | null;
  created_at?: string | null;
  from_email?: string | null;
  to_email?: string | null;
  cc?: string | null;
  bcc?: string | null;
  open_count?: number | null;
  click_count?: number | null;
  last_opened_at?: string | null;
  last_clicked_at?: string | null;
  tracking_id?: string | null;
  sent_by?: string | null;
};

interface Props {
  email: EmailLogRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lead's email — used as a sensible default for inbound "from" / outbound "to". */
  contactEmail?: string | null;
  /** When provided, renders a "Reply" button that hands back the email so the
   *  parent can pop the full ComposeEmailDialog pre-filled with Re:/quoted body.
   *  Used for Presale-pushed auto-responses that aren't in `crm_email_log`. */
  onReply?: (email: EmailLogRow) => void;
}

const BASE_STYLES = `
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, "Plus Jakarta Sans", Roboto, sans-serif;
    font-size: 15px;
    line-height: 1.65;
    color: #1a1a1a;
    padding: 28px 32px;
    word-wrap: break-word;
    overflow-wrap: anywhere;
    -webkit-font-smoothing: antialiased;
  }
  p { margin: 0 0 14px; }
  a { color: hsl(220 90% 50%); text-decoration: underline; text-underline-offset: 2px; }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  table { max-width: 100% !important; border-collapse: collapse; }
  td, th { padding: 4px 8px; }
  h1,h2,h3,h4 { line-height: 1.3; margin: 20px 0 10px; font-weight: 600; }
  blockquote { border-left: 3px solid #d4d4d8; margin: 12px 0; padding: 4px 14px; color: #555; background: #fafafa; }
  ul, ol { padding-left: 22px; margin: 0 0 14px; }
  hr { border: 0; border-top: 1px solid #eee; margin: 18px 0; }
  pre, code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 13px; }
  pre { background: #f6f7f9; padding: 10px 12px; border-radius: 6px; overflow-x: auto; }
  details.quoted { margin-top: 16px; }
  details.quoted > summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #6b7280; padding: 6px 12px; border-radius: 999px; background: #f3f4f6; user-select: none; }
  details.quoted > summary::-webkit-details-marker { display: none; }
  details.quoted > summary:hover { background: #e5e7eb; color: #111827; }
  details.quoted[open] > summary { margin-bottom: 12px; }
  .quoted-body { border-left: 3px solid #e5e7eb; padding: 10px 16px; color: #6b7280; background: #fafafa; border-radius: 0 8px 8px 0; }
  .quoted-body p { margin: 0 0 10px; font-size: 14px; line-height: 1.55; }
`;

/**
 * Split plain-text email into "new" content vs "quoted history".
 * Heuristics: an "On <date>... wrote:" attribution OR lines starting with `>`
 * (possibly nested `> > >`) mark the boundary.
 */
function splitPlainTextReply(plain: string): { fresh: string; quoted: string } {
  const lines = plain.split(/\r?\n/);
  const attributionRe = /^\s*(on\s+.+?\bwrote:|-{2,}\s*original message\s*-{2,}|from:\s+.+@.+)/i;
  const quoteRe = /^\s*(>\s*)+/;
  let cutIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (attributionRe.test(lines[i]) || quoteRe.test(lines[i])) { cutIdx = i; break; }
  }
  if (cutIdx === -1) {
    // Mid-paragraph attribution (no preceding newline)
    const m = plain.match(/\bon\s+\w{3},?\s+\w{3}\s+\d{1,2},?\s+\d{4}[^.]*?\bwrote:/i);
    if (m && m.index !== undefined) {
      return { fresh: plain.slice(0, m.index).trimEnd(), quoted: plain.slice(m.index).trim() };
    }
    return { fresh: plain.trim(), quoted: '' };
  }
  return {
    fresh: lines.slice(0, cutIdx).join('\n').trim(),
    quoted: lines.slice(cutIdx).join('\n').trim(),
  };
}

function plainBlockToHtml(text: string, opts?: { stripQuoteMarks?: boolean }): string {
  if (!text) return '';
  const cleaned = opts?.stripQuoteMarks
    ? text.split(/\r?\n/).map(l => l.replace(/^\s*(>\s*)+/, '')).join('\n')
    : text;
  return cleaned
    .split(/\n{2,}/)
    .map(p => `<p>${linkify(escapeHtml(p)).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

export function EmailPreviewDialog({ email, open, onOpenChange, contactEmail, onReply }: Props) {
  const isInbound = email?.direction === 'inbound';
  const rawBody = (email?.body_html || email?.body || '').trim();
  const plainBody = (email?.body_text || '').trim();

  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(rawBody);
  const html = looksLikeHtml ? rawBody : '';
  const plain = looksLikeHtml ? plainBody : (rawBody || plainBody);

  const srcDoc = useMemo(() => {
    const styleTag = `<style>${BASE_STYLES}</style>`;
    if (html) {
      if (/<html[\s>]/i.test(html)) {
        if (/<head[\s>]/i.test(html)) {
          return html.replace(/<head([^>]*)>/i, `<head$1>${styleTag}`);
        }
        return html.replace(/<html([^>]*)>/i, `<html$1><head>${styleTag}</head>`);
      }
      return `<!DOCTYPE html><html><head><meta charset="utf-8">${styleTag}</head><body>${html}</body></html>`;
    }
    if (plain) {
      const { fresh, quoted } = splitPlainTextReply(plain);
      const freshHtml = plainBlockToHtml(fresh || plain);
      const quotedHtml = quoted ? plainBlockToHtml(quoted, { stripQuoteMarks: true }) : '';
      const body = quotedHtml
        ? `${freshHtml}<details class="quoted"><summary>··· Show quoted history</summary><div class="quoted-body">${quotedHtml}</div></details>`
        : freshHtml;
      return `<!DOCTYPE html><html><head><meta charset="utf-8">${styleTag}</head><body>${body}</body></html>`;
    }
    return `<!DOCTYPE html><html><head>${styleTag}</head><body><p style="color:#888">(No body recorded for this email.)</p></body></html>`;
  }, [html, plain]);

  if (!email) return null;

  const ts = email.sent_at || email.created_at;
  const dateLabel = ts ? format(parseISO(ts), 'EEE, MMM d, yyyy · h:mm a') : '';

  const fromAddr = email.from_email || (isInbound ? contactEmail : 'You');
  const toAddr = email.to_email || (isInbound ? 'You' : contactEmail);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60 space-y-3 shrink-0">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
                isInbound ? 'bg-blue-500/10 border-blue-500/30' : 'bg-primary/10 border-primary/30'
              }`}
            >
              {isInbound
                ? <ArrowDownLeft className="w-4 h-4 text-blue-600" />
                : <ArrowUpRight className="w-4 h-4 text-primary" />
              }
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                  {isInbound ? 'Received' : 'Sent'}
                </Badge>
                {!isInbound && (email.open_count ?? 0) > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-500/10 text-emerald-600 inline-flex items-center gap-1"
                    title={email.last_opened_at ? `Last opened ${format(parseISO(email.last_opened_at), 'MMM d, h:mm a')}` : 'Opened'}
                  >
                    <Eye className="w-3 h-3" />
                    {email.open_count} open{(email.open_count ?? 0) === 1 ? '' : 's'}
                  </span>
                )}
                {!isInbound && (email.click_count ?? 0) > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-500/10 text-purple-600 inline-flex items-center gap-1"
                    title={email.last_clicked_at ? `Last clicked ${format(parseISO(email.last_clicked_at), 'MMM d, h:mm a')}` : 'Clicked'}
                  >
                    <MousePointerClick className="w-3 h-3" />
                    {email.click_count} click{(email.click_count ?? 0) === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <DialogTitle className="text-base font-semibold leading-snug break-words">
                {email.subject || '(no subject)'}
              </DialogTitle>
            </div>
          </div>

          <div className="grid grid-cols-[60px_1fr] gap-x-3 gap-y-1 text-[12px] pl-12">
            <span className="text-muted-foreground uppercase tracking-wider text-[10px] pt-0.5">From</span>
            <span className="text-foreground break-all">{fromAddr || '—'}</span>

            <span className="text-muted-foreground uppercase tracking-wider text-[10px] pt-0.5">To</span>
            <span className="text-foreground break-all">{toAddr || '—'}</span>

            {email.cc && (
              <>
                <span className="text-muted-foreground uppercase tracking-wider text-[10px] pt-0.5">CC</span>
                <span className="text-foreground break-all">{email.cc}</span>
              </>
            )}
            {email.bcc && (
              <>
                <span className="text-muted-foreground uppercase tracking-wider text-[10px] pt-0.5">BCC</span>
                <span className="text-foreground break-all">{email.bcc}</span>
              </>
            )}

            {dateLabel && (
              <>
                <span className="text-muted-foreground uppercase tracking-wider text-[10px] pt-0.5">Date</span>
                <span className="text-muted-foreground">{dateLabel}</span>
              </>
            )}
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-auto bg-muted/20 p-3 sm:p-5">
          <div className="bg-white rounded-lg border border-border/40 overflow-hidden shadow-sm">
            {html || plain ? (
              <AutoSizingFrame key={email.id} srcDoc={srcDoc} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                <Mail className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No body recorded for this email.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AutoSizingFrame({ srcDoc }: { srcDoc: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let ro: ResizeObserver | null = null;
    const onLoad = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        const measure = () => {
          const h = Math.max(
            doc.body?.scrollHeight ?? 0,
            doc.documentElement?.scrollHeight ?? 0,
          );
          if (h > 0) setHeight(h + 8);
        };
        measure();
        if ('ResizeObserver' in window && doc.body) {
          ro = new ResizeObserver(() => measure());
          ro.observe(doc.body);
        }
        // Re-measure once images load
        const imgs = doc.querySelectorAll('img');
        imgs.forEach((img) => {
          if (!(img as HTMLImageElement).complete) {
            img.addEventListener('load', measure, { once: true });
            img.addEventListener('error', measure, { once: true });
          }
        });
      } catch {
        /* cross-origin srcDoc shouldn't happen, ignore */
      }
    };
    frame.addEventListener('load', onLoad);
    return () => {
      frame.removeEventListener('load', onLoad);
      ro?.disconnect();
    };
  }, [srcDoc]);

  return (
    <iframe
      ref={ref}
      title="Email body"
      srcDoc={srcDoc}
      className="w-full border-0 block"
      style={{ height: `${height}px`, minHeight: '320px' }}
      sandbox="allow-same-origin allow-popups"
    />
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function linkify(s: string) {
  // Operates on already-escaped text — looks for http(s) URLs only.
  return s.replace(/(https?:\/\/[^\s<]+)/g, (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer">${m}</a>`);
}
