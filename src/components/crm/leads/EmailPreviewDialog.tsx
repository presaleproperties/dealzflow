import { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ArrowDownLeft, ArrowUpRight, Eye, MousePointerClick, Mail } from 'lucide-react';
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
};

interface Props {
  email: EmailLogRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lead's email — used as a sensible default for inbound "from" / outbound "to". */
  contactEmail?: string | null;
}

export function EmailPreviewDialog({ email, open, onOpenChange, contactEmail }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isInbound = email?.direction === 'inbound';
  const html = email?.body_html || email?.body || '';
  const plain = (email?.body_text || '').trim();

  // Render the raw HTML into a sandboxed iframe so styles can't leak into
  // the app and scripts can't run. Mirrors the composer's preview pane.
  useEffect(() => {
    if (!open || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    if (html) {
      doc.write(html);
    } else if (plain) {
      doc.write(`<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap;padding:20px;color:#1a1a1a;">${escapeHtml(plain)}</pre>`);
    } else {
      doc.write('<p style="color:#888;font-family:sans-serif;padding:20px;">(No body recorded for this email.)</p>');
    }
    doc.close();
  }, [open, html, plain]);

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
        <div className="flex-1 overflow-hidden bg-muted/20 p-3 sm:p-5">
          <div className="h-full bg-white rounded-lg border border-border/40 overflow-hidden shadow-sm">
            {html || plain ? (
              <iframe
                ref={iframeRef}
                title="Email body"
                className="w-full h-full border-0 block"
                style={{ minHeight: '400px' }}
                sandbox="allow-same-origin"
              />
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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
