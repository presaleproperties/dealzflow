import { ArrowDownLeft, ArrowUpRight, Eye, Paperclip } from 'lucide-react';
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
 * Email entry in the lead activity timeline.
 *
 * Visual language (shared with SmsNoteCard / NoteCard):
 *   - Channel-tinted timeline dot on the rail
 *   - Card with a 3px tinted left rail so the channel is readable at a glance
 *     even when the user scrolls quickly past dense content
 *   - Single-line meta row: TYPE • DIRECTION • TIME • AGENT • OPENS
 *   - Subject as the primary heading, then counterparty + 2-line preview
 */
export function EmailNoteCard({ email, onOpen, contactEmail }: Props) {
  const isInbound = email.direction === 'inbound';
  const ts = email.sent_at || email.created_at || new Date().toISOString();
  const time = format(parseISO(ts), 'h:mm a');
  const dateLabel = format(parseISO(ts), 'MMM d');

  const fromAddr = email.from_email || (isInbound ? contactEmail : 'You');
  const toAddr = email.to_email || (isInbound ? 'You' : contactEmail);
  const counterpart = isInbound ? fromAddr : toAddr;

  // Plain-text preview from the body, stripped of HTML, quoted reply history,
  // and entities — then truncated for a 2-line snippet.
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
  const attribCut = stripped.search(/\bon\s+\w{3},?\s+\w{3}\s+\d{1,2},?\s+\d{4}[^.]*?\bwrote:/i);
  const quoteCut = stripped.search(/(^|\s)>+\s*\S/);
  const cuts = [attribCut, quoteCut].filter((n) => n >= 0);
  const cutAt = cuts.length ? Math.min(...cuts) : -1;
  const fresh = (cutAt > 20 ? stripped.slice(0, cutAt) : stripped);
  const preview = fresh.replace(/\s+/g, ' ').trim().slice(0, 200);

  const opens = email.open_count ?? 0;
  // Inbound = cool blue, Outbound = warm gold (brand primary).
  const tint = isInbound ? '210 90% 55%' : '45 88% 52%';

  return (
    <div className="group relative">
      {/* Card — colored left rail communicates channel. No dot needed. */}
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'w-full text-left rounded-lg border bg-card pl-3.5 pr-3 py-2.5 md:pl-4 md:pr-3.5 md:py-3 transition-all',
          'border-border/60 active:bg-muted/40 md:hover:border-primary/40 md:hover:bg-muted/20 cursor-pointer',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          'border-l-[3px]',
        )}
        style={{ borderLeftColor: `hsl(${tint})` }}
      >
        {/* Meta row */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
            <span
              className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.08em] text-[10px]"
              style={{ color: `hsl(${tint})` }}
            >
              {isInbound ? <ArrowDownLeft className="w-2.5 h-2.5" /> : <ArrowUpRight className="w-2.5 h-2.5" />}
              Email · {isInbound ? 'Received' : 'Sent'}
            </span>
            <Sep />
            <span className="shrink-0 tabular-nums text-[11px]">
              <span className="md:hidden">{time}</span>
              <span className="hidden md:inline">{dateLabel} · {time}</span>
            </span>
            {!isInbound && email.sent_by && (
              <>
                <Sep />
                <AgentBadge userId={email.sent_by} prefix="by" />
              </>
            )}
            {opens > 0 && !isInbound && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px] font-medium">
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

        {/* Subject */}
        <div className="flex items-start gap-2">
          <h4 className="text-[13.5px] md:text-[14px] font-semibold leading-snug break-words line-clamp-2 flex-1 text-foreground group-hover:text-primary transition-colors">
            {email.subject || '(no subject)'}
          </h4>
          {(email as any).has_attachments && (
            <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
          )}
        </div>

        {/* Counterparty */}
        {counterpart && (
          <p className="text-[11.5px] text-muted-foreground mt-1 truncate">
            <span className="text-muted-foreground/70">{isInbound ? 'From' : 'To'}</span>{' '}
            <span className="text-foreground/80">{counterpart}</span>
          </p>
        )}

        {/* Preview snippet */}
        {preview && (
          <p className="text-[12.5px] md:text-[13px] text-muted-foreground/90 mt-1.5 leading-relaxed line-clamp-2">
            {preview}
          </p>
        )}
      </button>
    </div>
  );
}

function Sep() {
  return <span className="text-muted-foreground/40">·</span>;
}
