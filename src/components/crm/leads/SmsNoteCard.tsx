import { ArrowDownLeft, ArrowUpRight, MessageSquare, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CrmSmsLogRow } from '@/hooks/useCrmContactSmsLog';

interface Props {
  message: CrmSmsLogRow;
  onOpen?: () => void;
}

/**
 * Activity-timeline card for a single SMS / WhatsApp message.
 * Mirrors the EmailNoteCard visual language so messages feel native to the
 * lead activity feed.
 */
export function SmsNoteCard({ message, onOpen }: Props) {
  const isInbound = message.direction === 'inbound';
  const ts = message.sent_at || message.created_at;
  const time = format(parseISO(ts), 'h:mm a');
  const dateLabel = format(parseISO(ts), 'MMM d, yyyy');

  const channel = message.channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
  // Channel-specific accent: WhatsApp = green, SMS = sky blue
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
          borderColor: `hsl(${tint} / 0.45)`,
          background: `hsl(${tint} / 0.10)`,
        }}
      >
        {isInbound
          ? <ArrowDownLeft className="w-3.5 h-3.5" strokeWidth={2} style={{ color: `hsl(${tint})` }} />
          : <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2} style={{ color: `hsl(${tint})` }} />
        }
      </div>

      {/* Card */}
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className={cn(
          'flex-1 min-w-0 text-left rounded-lg border bg-card px-3.5 py-3 transition-all',
          'border-border/50',
          onOpen && 'hover:border-primary/40 hover:bg-muted/30 cursor-pointer',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        )}
      >
        {/* Meta row */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground min-w-0 flex-wrap">
            <span
              className="font-semibold px-1.5 py-0.5 rounded text-[10px]"
              style={{
                background: `hsl(${tint} / 0.12)`,
                color: `hsl(${tint})`,
              }}
            >
              {channel} · {isInbound ? 'Received' : 'Sent'}
            </span>
            <span className="opacity-30">·</span>
            <span className="shrink-0 normal-case tracking-normal text-xs">{dateLabel} · {time}</span>
            {failed && (
              <>
                <span className="opacity-30">·</span>
                <span className="inline-flex items-center gap-1 text-destructive normal-case tracking-normal text-xs">
                  <AlertTriangle className="w-3 h-3" />
                  Failed
                </span>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex items-start gap-2">
          <MessageSquare className="w-4 h-4 text-foreground/50 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            {body ? (
              <p className="text-[13.5px] text-foreground leading-relaxed whitespace-pre-wrap break-words line-clamp-4">
                {body}
              </p>
            ) : (
              <p className="text-[13px] text-muted-foreground italic">
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
              <p className="text-[11.5px] text-muted-foreground mt-1.5 truncate">
                <span className="text-muted-foreground/70">{isInbound ? 'From' : 'To'}</span>{' '}
                <span className="text-foreground/80">{counterpart}</span>
              </p>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
