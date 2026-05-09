import { ArrowDownLeft, ArrowUpRight, MessageSquare, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CrmSmsLogRow } from '@/hooks/useCrmContactSmsLog';
import { AgentBadge } from './detail/AgentBadge';

interface Props {
  message: CrmSmsLogRow;
  onOpen?: () => void;
}

/**
 * SMS / WhatsApp entry in the lead activity timeline.
 * Mirrors EmailNoteCard's editorial language so each channel reads at a glance.
 */
export function SmsNoteCard({ message, onOpen }: Props) {
  const isInbound = message.direction === 'inbound';
  const ts = message.sent_at || message.created_at;
  const time = format(parseISO(ts), 'h:mm a');
  const dateLabel = format(parseISO(ts), 'MMM d');

  const channel = message.channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
  // Channel-specific accent: WhatsApp = green, SMS = sky.
  const tint = message.channel === 'whatsapp' ? '142 70% 45%' : '198 90% 50%';

  const failed =
    message.status === 'failed' ||
    message.status === 'undelivered' ||
    !!message.error_message;

  const counterpart = isInbound ? message.from_number : message.to_number;
  const mediaCount = (message.media_urls ?? []).length;
  const body = (message.body ?? '').trim();

  return (
    <div className="group relative flex gap-3">
      {/* Timeline dot */}
      <div
        className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0 border bg-background"
        style={{
          borderColor: `hsl(${tint} / 0.5)`,
          background: `hsl(${tint} / 0.1)`,
        }}
      >
        <MessageSquare className="w-3.5 h-3.5" strokeWidth={2} style={{ color: `hsl(${tint})` }} />
      </div>

      {/* Card */}
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className={cn(
          'flex-1 min-w-0 text-left rounded-lg border bg-card pl-3 pr-3 py-2.5 md:pl-3.5 md:pr-3.5 md:py-3 transition-all',
          'border-border/50 border-l-[3px]',
          onOpen && 'active:bg-muted/40 md:hover:border-primary/40 md:hover:bg-muted/20 cursor-pointer',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        )}
        style={{ borderLeftColor: `hsl(${tint})` }}
      >
        {/* Meta row */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0 flex-wrap">
            <span
              className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.08em] text-[10px]"
              style={{ color: `hsl(${tint})` }}
            >
              {isInbound ? <ArrowDownLeft className="w-2.5 h-2.5" /> : <ArrowUpRight className="w-2.5 h-2.5" />}
              {channel} · {isInbound ? 'In' : 'Out'}
            </span>
            <Sep />
            <span className="shrink-0 tabular-nums text-[11px]">
              <span className="md:hidden">{time}</span>
              <span className="hidden md:inline">{dateLabel} · {time}</span>
            </span>
            {!isInbound && message.user_id && (
              <>
                <Sep />
                <AgentBadge userId={message.user_id} prefix="by" />
              </>
            )}
            {failed && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1 text-destructive text-[11px] font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  Failed
                </span>
              </>
            )}
          </div>
          {onOpen && (
            <span className="hidden md:inline text-[11px] text-primary font-medium shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              Open →
            </span>
          )}
        </div>

        {/* Body */}
        <div className="min-w-0">
          {body ? (
            <p className="text-[13px] md:text-[13.5px] text-foreground leading-relaxed whitespace-pre-wrap break-words line-clamp-3">
              {body}
            </p>
          ) : (
            <p className="text-[12.5px] md:text-[13px] text-muted-foreground italic">
              {mediaCount > 0 ? `${mediaCount} attachment${mediaCount === 1 ? '' : 's'}` : '(empty message)'}
            </p>
          )}
          {mediaCount > 0 && body && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <ImageIcon className="w-3 h-3" />
              {mediaCount} attachment{mediaCount === 1 ? '' : 's'}
            </p>
          )}
          {failed && message.error_message && (
            <p className="mt-1.5 text-[11.5px] text-destructive/90 leading-snug">
              {message.error_message}
            </p>
          )}
          {counterpart && (
            <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
              <span className="text-muted-foreground/70">{isInbound ? 'From' : 'To'}</span>{' '}
              <span className="text-foreground/80">{counterpart}</span>
            </p>
          )}
        </div>
      </button>
    </div>
  );
}

function Sep() {
  return <span className="text-muted-foreground/40">·</span>;
}
