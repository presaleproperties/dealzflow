import { useMemo, useEffect, useRef } from 'react';
import { format, parseISO, isSameDay } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight, AlertTriangle, Image as ImageIcon, MessageSquare } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CrmSmsLogRow } from '@/hooks/useCrmContactSmsLog';
import type { CrmContact } from '@/hooks/useCrmContacts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: CrmContact;
  messages: CrmSmsLogRow[];
  /** Which message to scroll to / highlight on open. */
  initialMessageId?: string | null;
  /** Channel to display. SMS or WhatsApp. */
  channel?: 'sms' | 'whatsapp';
  /** Open the full chat surface for replying. */
  onReply?: () => void;
}

/**
 * In-place drawer that shows the full SMS / WhatsApp conversation with a
 * lead, grouped by day, with per-message timestamps and delivery status.
 * Opens from the right on desktop / bottom on mobile.
 */
export function SmsThreadDrawer({
  open, onOpenChange, contact, messages, initialMessageId, channel, onReply,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);

  // Filter to the requested channel (default: all messages).
  const filtered = useMemo(() => {
    const all = (messages ?? []).slice();
    const scoped = channel ? all.filter(m => (m.channel ?? 'sms') === channel) : all;
    return scoped.sort((a, b) => {
      const ta = new Date(a.sent_at || a.created_at).getTime();
      const tb = new Date(b.sent_at || b.created_at).getTime();
      return ta - tb;
    });
  }, [messages, channel]);

  // Group by day for "Today / Yesterday / Mar 4, 2026" headers.
  const groups = useMemo(() => {
    const out: { dateLabel: string; key: string; rows: CrmSmsLogRow[] }[] = [];
    for (const m of filtered) {
      const ts = m.sent_at || m.created_at;
      const d = parseISO(ts);
      const today = new Date();
      const isToday = isSameDay(d, today);
      const isYesterday = isSameDay(d, new Date(today.getTime() - 86400000));
      const dateLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : format(d, 'EEEE, MMM d, yyyy');
      const key = format(d, 'yyyy-MM-dd');
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(m);
      else out.push({ dateLabel, key, rows: [m] });
    }
    return out;
  }, [filtered]);

  // Scroll to bottom (or to the requested message) when opening.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (initialMessageId && targetRef.current) {
        targetRef.current.scrollIntoView({ behavior: 'auto', block: 'center' });
      } else if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [open, initialMessageId, filtered.length]);

  const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
  const counterpartName = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Lead';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] flex flex-col p-0 gap-0"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-[15px] font-semibold truncate">
                {channelLabel} with {counterpartName}
              </SheetTitle>
              <SheetDescription className="text-[11.5px] text-muted-foreground mt-0.5">
                {filtered.length} {filtered.length === 1 ? 'message' : 'messages'}
              </SheetDescription>
            </div>
            {onReply && (
              <Button size="sm" className="h-7 text-[11.5px] gap-1.5 shrink-0" onClick={onReply}>
                <MessageSquare className="w-3 h-3" /> Reply
              </Button>
            )}
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              No {channelLabel} messages yet.
            </p>
          )}

          {groups.map(group => (
            <section key={group.key} className="space-y-2">
              <div className="text-center">
                <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/80">
                  {group.dateLabel}
                </span>
              </div>
              <div className="space-y-1.5">
                {group.rows.map(m => {
                  const isInbound = m.direction === 'inbound';
                  const ts = m.sent_at || m.created_at;
                  const time = format(parseISO(ts), 'h:mm a');
                  const failed =
                    m.status === 'failed' ||
                    m.status === 'undelivered' ||
                    !!m.error_message;
                  const mediaCount = (m.media_urls ?? []).length;
                  const isTarget = initialMessageId && initialMessageId === m.id;
                  return (
                    <div
                      key={m.id}
                      ref={isTarget ? targetRef : undefined}
                      className={cn('flex flex-col', isInbound ? 'items-start' : 'items-end')}
                    >
                      <div
                        className={cn(
                          'max-w-[82%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug whitespace-pre-wrap break-words border',
                          isInbound
                            ? 'bg-muted/40 text-foreground border-border/60'
                            : 'bg-primary/15 text-foreground border-primary/30',
                          isTarget && 'ring-2 ring-primary/60',
                        )}
                      >
                        {m.body
                          ? m.body
                          : mediaCount === 0
                          ? <span className="italic text-muted-foreground">(no text)</span>
                          : null}
                        {mediaCount > 0 && (
                          <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <ImageIcon className="w-3 h-3" />
                            {mediaCount} attachment{mediaCount === 1 ? '' : 's'}
                          </div>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        {isInbound ? (
                          <ArrowDownLeft className="w-3 h-3" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3" />
                        )}
                        <span className="tabular-nums">{time}</span>
                        {!isInbound && m.status && (
                          <span className="opacity-70">· {m.status}</span>
                        )}
                        {failed && (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <AlertTriangle className="w-3 h-3" />
                            {m.error_message || 'failed'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
