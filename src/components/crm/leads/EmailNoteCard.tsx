import { ArrowDownLeft, ArrowUpRight, Eye, MailOpen, Paperclip } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { EmailLogRow } from './EmailPreviewDialog';
import { AgentBadge } from './detail/AgentBadge';

interface Props {
  email: EmailLogRow & { sent_by?: string | null };
  onOpen: () => void;
  contactEmail?: string | null;
}

/**
 * Premium activity-timeline card for an email.
 * Replaces the generic NoteCard rendering for virtual email entries so the
 * subject reads as a real title (not a "run-on sentence" of merged fields).
 */
export function EmailNoteCard({ email, onOpen, contactEmail }: Props) {
  const isInbound = email.direction === 'inbound';
  const ts = email.sent_at || email.created_at || new Date().toISOString();
  const time = format(parseISO(ts), 'h:mm a');
  const dateLabel = format(parseISO(ts), 'MMM d, yyyy');

  const fromAddr = email.from_email || (isInbound ? contactEmail : 'You');
  const toAddr = email.to_email || (isInbound ? 'You' : contactEmail);
  const counterpart = isInbound ? fromAddr : toAddr;

  // Plain-text preview from whichever body field exists. Strip HTML tags,
  // strip out quoted reply history (everything after "On ... wrote:" or `>` lines),
  // collapse whitespace, then truncate.
  const rawBody = email.body_html || email.body || email.body_text || '';
  const stripped = rawBody
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  // Cut at the first attribution line / quote marker
  const attribCut = stripped.search(/\bon\s+\w{3},?\s+\w{3}\s+\d{1,2},?\s+\d{4}[^.]*?\bwrote:/i);
  const quoteCut = stripped.search(/(^|\s)>+\s*\S/);
  const cuts = [attribCut, quoteCut].filter((n) => n >= 0);
  const cutAt = cuts.length ? Math.min(...cuts) : -1;
  const fresh = (cutAt > 20 ? stripped.slice(0, cutAt) : stripped);
  const preview = fresh.replace(/\s+/g, ' ').trim().slice(0, 180);

  const opens = email.open_count ?? 0;
  const tint = isInbound ? '210 90% 55%' : '45 90% 55%';

  return (
    <div className="group relative flex gap-2.5 md:gap-3">
      {/* Timeline dot */}
      <div
        className="relative z-10 flex items-center justify-center w-6 h-6 md:w-7 md:h-7 rounded-full flex-shrink-0 border bg-background"
        style={{
          borderColor: `hsl(${tint} / 0.45)`,
          background: `hsl(${tint} / 0.10)`,
        }}
      >
        {isInbound
          ? <ArrowDownLeft className="w-3 h-3 md:w-3.5 md:h-3.5" strokeWidth={2} style={{ color: `hsl(${tint})` }} />
          : <ArrowUpRight className="w-3 h-3 md:w-3.5 md:h-3.5" strokeWidth={2} style={{ color: `hsl(${tint})` }} />
        }
      </div>

      {/* Card */}
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex-1 min-w-0 text-left rounded-xl md:rounded-lg border bg-card px-3 py-2.5 md:px-3.5 md:py-3 transition-all',
          'border-border/50 active:bg-muted/40 md:hover:border-primary/40 md:hover:bg-muted/30 cursor-pointer',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        )}
      >
        {/* Meta row — denser on mobile (date hidden, day header shows it) */}
        <div className="flex items-center justify-between gap-2 mb-1.5 md:mb-2">
          <div className="flex items-center gap-1.5 md:gap-2 text-[11px] uppercase tracking-wider text-muted-foreground min-w-0">
            <span
              className="font-semibold px-1.5 py-0.5 rounded text-[10px]"
              style={{
                background: `hsl(${tint} / 0.12)`,
                color: `hsl(${tint})`,
              }}
            >
              {isInbound ? 'Received' : 'Sent'}
            </span>
            <span className="opacity-30">·</span>
            <span className="shrink-0 normal-case tracking-normal text-[11px] md:text-xs tabular-nums">
              <span className="md:hidden">{time}</span>
              <span className="hidden md:inline">{dateLabel} · {time}</span>
            </span>
            {!isInbound && email.sent_by && (
              <span className="hidden md:inline-flex items-center gap-2">
                <span className="opacity-30">·</span>
                <AgentBadge userId={email.sent_by} prefix="by" />
              </span>
            )}
            {opens > 0 && !isInbound && (
              <>
                <span className="opacity-30">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 normal-case tracking-normal text-[11px] md:text-xs">
                  <Eye className="w-3 h-3" />
                  {opens}
                </span>
              </>
            )}
          </div>
          <span className="hidden md:inline text-[11px] text-primary font-medium shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            Open →
          </span>
        </div>

        {/* Subject — no leading icon on mobile (saves a column) */}
        <div className="flex items-start gap-2">
          <MailOpen className="hidden md:block w-4 h-4 text-primary/70 shrink-0 mt-0.5" />
          <h4
            className={cn(
              'text-[13.5px] md:text-[14px] font-semibold leading-snug break-words line-clamp-2 flex-1',
              'text-foreground md:text-primary md:underline md:decoration-primary/30 md:underline-offset-[3px] md:decoration-[1.5px]',
              'group-hover:decoration-primary group-hover:text-primary transition-colors',
            )}
          >
            {email.subject || '(no subject)'}
          </h4>
          {(email as any).has_attachments && (
            <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
          )}
        </div>

        {/* Counterparty */}
        {counterpart && (
          <p className="text-[11.5px] md:text-[12px] text-muted-foreground mt-1 md:ml-6 truncate">
            <span className="text-muted-foreground/70">{isInbound ? 'From' : 'To'}</span>{' '}
            <span className="text-foreground/80">{counterpart}</span>
          </p>
        )}

        {/* Preview snippet */}
        {preview && (
          <p className="text-[12.5px] md:text-[13px] text-muted-foreground mt-1.5 md:mt-2 md:ml-6 leading-relaxed line-clamp-2">
            {preview}
          </p>
        )}
      </button>
    </div>
  );
}
