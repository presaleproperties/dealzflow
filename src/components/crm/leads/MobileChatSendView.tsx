/**
 * MobileChatSendView
 * ------------------
 * Native chat-style replacement for the rich SMS composer when sending to a
 * single recipient on mobile. Recent thread history renders as bubbles, and
 * a pinned iMessage-style composer sits at the bottom with auto-grow textarea.
 *
 * Intentionally minimal — no templates, no schedule, no variables. Those live
 * in the full composer (Mass send + desktop). The "..." menu jumps to the
 * full composer if the agent needs them.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Phone, MoreHorizontal, Sparkles, Plus } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AttachMenu } from '@/components/crm/shared/AttachMenu';
import { useCrmContactSmsLog } from '@/hooks/useCrmContactSmsLog';
import { useDialer } from '@/hooks/useDialer';
import type { CrmContact } from '@/hooks/useCrmContacts';
import type { MessagingChannel } from '@/hooks/useSms';

interface Props {
  contact: CrmContact;
  channel: MessagingChannel;
  onChannelChange: (c: MessagingChannel) => void;
  body: string;
  onBodyChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  canSend: boolean;
  onClose: () => void;
  onOpenAdvanced: () => void;
  uploading: boolean;
  onFiles: (f: File[]) => void;
  isOptedOut?: boolean;
  mediaUrls: string[];
  onRemoveMedia: (url: string) => void;
}

function formatBubbleTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
  return format(d, 'MMM d, h:mm a');
}

export function MobileChatSendView({
  contact,
  channel,
  onChannelChange,
  body,
  onBodyChange,
  onSend,
  sending,
  canSend,
  onClose,
  onOpenAdvanced,
  uploading,
  onFiles,
  isOptedOut,
  mediaUrls,
  onRemoveMedia,
}: Props) {
  const { data: smsLog = [] } = useCrmContactSmsLog(contact.id);
  const dialer = useDialer();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [taHeight, setTaHeight] = useState(38);

  // Show oldest → newest in the scroll view (chat order).
  const messages = useMemo(
    () => [...smsLog].reverse().filter((m) => m.channel === channel || (channel === 'sms' && !m.channel)),
    [smsLog, channel],
  );

  // Auto-scroll to bottom on mount + when messages/sending changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, sending]);

  // Auto-grow textarea up to ~5 lines.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(140, Math.max(38, ta.scrollHeight));
    ta.style.height = `${next}px`;
    setTaHeight(next);
  }, [body]);

  const fullName =
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
    contact.phone ||
    'Lead';
  const initials =
    `${(contact.first_name?.[0] || '').toUpperCase()}${(contact.last_name?.[0] || '').toUpperCase()}` ||
    (contact.phone?.replace(/\D/g, '').slice(-2) ?? '?');

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      {/* Chat header — Messages-app style: back, avatar+name centred, call/more on right */}
      <header
        className="flex items-center gap-2 px-2 border-b border-border/40 shrink-0"
        style={{ paddingTop: '0.375rem', paddingBottom: '0.375rem' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="inline-flex items-center justify-center h-9 w-9 rounded-full text-primary active:opacity-60"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 flex flex-col items-center min-w-0 -ml-9">
          <Avatar className="h-8 w-8 mb-0.5">
            <AvatarFallback className="text-[11px] font-semibold bg-muted">
              {initials || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[12px] font-semibold tracking-tight truncate max-w-[60vw]">
              {fullName}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {channel === 'whatsapp' ? 'WhatsApp' : 'iMessage'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => contact.phone && dialer.startCall({ contact: { id: contact.id, name: fullName, phone: contact.phone }, number: contact.phone })}
          aria-label="Call"
          disabled={!contact.phone}
          className="inline-flex items-center justify-center h-9 w-9 rounded-full text-primary active:opacity-60 disabled:opacity-30"
        >
          <Phone className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={onOpenAdvanced}
          aria-label="More"
          className="inline-flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground active:opacity-60"
          title="Templates, schedule, variables"
        >
          <MoreHorizontal className="h-[18px] w-[18px]" />
        </button>
      </header>

      {/* Channel toggle — slim chip row, only shown when WhatsApp is an option */}
      <div className="flex justify-center gap-1 px-2 py-1.5 border-b border-border/30 shrink-0 bg-background">
        <button
          type="button"
          onClick={() => onChannelChange('sms')}
          className={cn(
            'px-3 py-0.5 rounded-full text-[10.5px] font-semibold uppercase tracking-wider transition-colors',
            channel === 'sms' ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
          )}
        >
          SMS
        </button>
        <button
          type="button"
          onClick={() => onChannelChange('whatsapp')}
          className={cn(
            'px-3 py-0.5 rounded-full text-[10.5px] font-semibold uppercase tracking-wider transition-colors flex items-center gap-1',
            channel === 'whatsapp' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> WhatsApp
        </button>
      </div>

      {/* Conversation scroll area */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-1.5"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-1.5 text-muted-foreground">
            <Sparkles className="h-5 w-5 opacity-40" />
            <p className="text-[12px]">No history yet — say hello.</p>
          </div>
        )}
        {messages.map((m, i) => {
          const isOut = m.direction === 'outbound';
          const prev = messages[i - 1];
          const showTime =
            !prev ||
            new Date(m.sent_at || m.created_at).getTime() -
              new Date(prev.sent_at || prev.created_at).getTime() >
              10 * 60 * 1000;
          return (
            <div key={m.id}>
              {showTime && (
                <div className="text-center text-[10px] text-muted-foreground/70 my-2 tracking-wide">
                  {formatBubbleTime(m.sent_at || m.created_at)}
                </div>
              )}
              <div className={cn('flex w-full', isOut ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[78%] px-3.5 py-2 text-[14px] leading-snug rounded-2xl whitespace-pre-wrap break-words',
                    isOut
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md',
                  )}
                >
                  {m.body}
                  {m.media_urls && m.media_urls.length > 0 && (
                    <div className="mt-1.5 grid grid-cols-2 gap-1">
                      {m.media_urls.map((u) => (
                        <img
                          key={u}
                          src={u}
                          alt=""
                          className="rounded-md max-h-32 object-cover w-full"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pending media strip */}
      {mediaUrls.length > 0 && (
        <div className="flex gap-1.5 px-3 pb-1.5 overflow-x-auto shrink-0 border-t border-border/30 pt-2">
          {mediaUrls.map((u) => (
            <div key={u} className="relative shrink-0">
              <img src={u} alt="" className="h-14 w-14 rounded-lg object-cover border border-border/60" />
              <button
                type="button"
                onClick={() => onRemoveMedia(u)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-foreground text-background text-[10px] font-bold inline-flex items-center justify-center"
                aria-label="Remove attachment"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* iMessage-style composer — pinned to bottom */}
      <div
        className="shrink-0 border-t border-border/40 bg-background/95 backdrop-blur-md px-2 pt-2 flex items-end gap-1.5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)' }}
      >
        <AttachMenu
          variant="icon"
          uploading={uploading}
          onFiles={onFiles}
          className="h-9 w-9 rounded-full bg-muted/60 active:scale-95 transition-transform shrink-0"
        />
        <div className="flex-1 min-w-0 flex items-end rounded-3xl border border-border/70 bg-muted/30 pl-3.5 pr-1 py-1">
          <textarea
            ref={taRef}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder={isOptedOut ? 'This number opted out' : `${channel === 'whatsapp' ? 'WhatsApp' : 'Text'} message`}
            disabled={isOptedOut}
            rows={1}
            style={{ height: taHeight }}
            className="flex-1 min-w-0 resize-none bg-transparent border-0 outline-none text-[15px] leading-snug py-1.5 placeholder:text-muted-foreground/60 disabled:opacity-50 max-h-[140px]"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send"
            className={cn(
              'shrink-0 ml-1 h-7 w-7 rounded-full inline-flex items-center justify-center transition-all',
              canSend
                ? 'bg-primary text-primary-foreground active:scale-95'
                : 'bg-muted-foreground/20 text-muted-foreground',
            )}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className="text-[16px] leading-none -mt-0.5">↑</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
