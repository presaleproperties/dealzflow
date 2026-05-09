/**
 * MobileChatSendView
 * ------------------
 * Native chat-style replacement for the rich SMS composer when sending to a
 * single recipient on mobile. Recent thread history renders as bubbles, and
 * a pinned composer sits at the bottom with auto-grow textarea.
 *
 * Layout cues borrowed from the user's iPhone reference (Lofty/Apple Messages
 * style): left-aligned header with avatar+name+segment+status pill, no loud
 * channel toggle (lives in the More menu), a muted From/To info row above the
 * composer, and a pill-shaped composer with an outboard "+" attach button.
 *
 * Intentionally minimal — no templates, no schedule, no variables. Those live
 * in the full composer (Mass send + desktop). The "..." menu jumps to the
 * full composer if the agent needs them.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Loader2,
  Phone,
  MoreHorizontal,
  Sparkles,
  MessagesSquare,
  ArrowUp,
  Check,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AttachMenu } from '@/components/crm/shared/AttachMenu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

/** Pretty-prints a North-American number — falls back to the raw value. */
function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
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
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [taHeight, setTaHeight] = useState(36);
  const [moreOpen, setMoreOpen] = useState(false);

  // Show oldest → newest in the scroll view (chat order).
  const messages = useMemo(
    () => [...smsLog].reverse().filter((m) => m.channel === channel || (channel === 'sms' && !m.channel)),
    [smsLog, channel],
  );

  // Last outbound from-number is our active Twilio caller-ID for the From row.
  const fromNumber = useMemo(() => {
    const lastOut = smsLog.find((m) => m.direction === 'outbound' && m.from_number);
    return lastOut?.from_number ?? null;
  }, [smsLog]);

  // Auto-scroll to bottom on mount + when messages/sending changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, sending]);

  // Focus the textarea on mount unless the recipient opted out, so the
  // keyboard surfaces immediately like a native chat thread.
  useEffect(() => {
    if (isOptedOut) return;
    const id = window.setTimeout(() => taRef.current?.focus({ preventScroll: true }), 80);
    return () => window.clearTimeout(id);
  }, [isOptedOut]);

  // Auto-grow textarea up to ~5 lines.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(140, Math.max(36, ta.scrollHeight));
    ta.style.height = `${next}px`;
    setTaHeight(next);
  }, [body]);

  // Cmd/Ctrl+Enter from anywhere in the composer triggers send.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canSend && !sending) onSend();
    }
  };

  const fullName =
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
    contact.phone ||
    'Lead';
  const initials =
    `${(contact.first_name?.[0] || '').toUpperCase()}${(contact.last_name?.[0] || '').toUpperCase()}` ||
    (contact.phone?.replace(/\D/g, '').slice(-2) ?? '?');
  const segmentLabel = contact.status || contact.lead_type || 'Contact';

  const showSendBtn = body.trim().length > 0 || mediaUrls.length > 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      {/* Header — left-aligned, Lofty/Messages-style.
          Back, avatar, name + segment subtitle, status pill. Right side keeps
          a slim Call + More so power actions are still one tap away. */}
      <header
        data-composer-header="true"
        className="sticky top-0 z-20 flex items-center gap-1.5 px-1 border-b border-border/40 shrink-0 bg-background/95 backdrop-blur-md transition-[padding] duration-150 ease-out"
        style={{ paddingBottom: '6px' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to leads"
          className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full text-foreground active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.25} aria-hidden />
        </button>
        <Avatar className="h-8 w-8 shrink-0" aria-hidden>
          <AvatarFallback className="text-[11px] font-semibold bg-primary/15 text-primary">
            {initials || '?'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 flex flex-col leading-[1.15] pr-1">
          <span className="text-[15px] font-semibold tracking-tight text-foreground truncate">
            {fullName}
          </span>
          <span className="text-[11px] text-muted-foreground truncate mt-px">
            {[segmentLabel, channel === 'whatsapp' ? 'WhatsApp' : null].filter(Boolean).join(' · ')}
          </span>
        </div>
        <button
          type="button"
          onClick={() => contact.phone && dialer.startCall({ contact: { id: contact.id, name: fullName, phone: contact.phone }, number: contact.phone })}
          aria-label={contact.phone ? `Call ${fullName}` : 'No phone number on file'}
          disabled={!contact.phone}
          className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full text-primary active:opacity-60 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Phone className="h-[17px] w-[17px]" aria-hidden />
        </button>
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className="inline-flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-60 p-1">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onClose();
                navigate(`/crm/chats/${contact.id}`);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] hover:bg-muted text-left"
            >
              <MessagesSquare className="h-4 w-4 text-primary" />
              <span className="flex-1">Open full conversation</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onChannelChange(channel === 'sms' ? 'whatsapp' : 'sms');
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] hover:bg-muted text-left"
            >
              <span className={cn('h-4 w-4 rounded-full inline-flex items-center justify-center', channel === 'whatsapp' ? 'bg-emerald-500/20 text-emerald-600' : 'bg-primary/15 text-primary')}>
                {channel === 'whatsapp' ? <Check className="h-3 w-3" /> : <span className="text-[10px] font-bold">S</span>}
              </span>
              <span className="flex-1">{channel === 'whatsapp' ? 'Switch to SMS' : 'Switch to WhatsApp'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onOpenAdvanced();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] hover:bg-muted text-left"
            >
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">Templates, schedule, variables</span>
            </button>
          </PopoverContent>
        </Popover>
      </header>

      {/* Conversation scroll area */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Conversation with ${fullName}`}
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
                <div className="text-center text-[11px] text-muted-foreground/70 my-3 tracking-wide font-medium">
                  {formatBubbleTime(m.sent_at || m.created_at)}
                </div>
              )}
              <div className={cn('flex w-full items-end gap-1.5', isOut ? 'justify-end' : 'justify-start')}>
                {!isOut && (
                  <Avatar className="h-6 w-6 shrink-0 mb-0.5">
                    <AvatarFallback className="text-[9px] font-semibold bg-primary/15 text-primary">
                      {initials || '?'}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    'max-w-[78%] px-3.5 py-2 text-[14.5px] leading-snug rounded-2xl whitespace-pre-wrap break-words',
                    isOut
                      ? 'bg-primary/12 text-foreground rounded-br-md'
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

      {/* From / To info strip — hairline row above the composer, like the reference */}
      <div className="shrink-0 px-3 py-1.5 border-t border-border/40 flex items-center gap-3 text-[11px] text-muted-foreground bg-background">
        <span className="flex-1 min-w-0 flex items-baseline gap-1 truncate">
          <span className="text-muted-foreground/60 uppercase tracking-wider text-[9.5px] font-semibold shrink-0">From</span>
          <span className="text-foreground/80 font-medium tabular-nums truncate">
            {fromNumber ? formatPhone(fromNumber) : 'Default'}
          </span>
        </span>
        <span className="h-3 w-px bg-border shrink-0" aria-hidden />
        <span className="flex-1 min-w-0 flex items-baseline gap-1 justify-end truncate">
          <span className="text-muted-foreground/60 uppercase tracking-wider text-[9.5px] font-semibold shrink-0">To</span>
          <span
            className={cn(
              'font-medium tabular-nums truncate',
              isOptedOut ? 'text-destructive' : 'text-foreground/80',
            )}
          >
            {isOptedOut && '⊘ '}{contact.phone ? formatPhone(contact.phone) : 'No number'}
          </span>
        </span>
      </div>

      {/* Composer — pill input with outboard "+" attach. Send arrow appears
          inside the pill once there's content, mirroring iMessage. */}
      <div
        className="shrink-0 bg-background/95 backdrop-blur-md px-2.5 pt-1.5 flex items-end gap-2 transition-[padding] duration-150 ease-out"
        style={{ paddingBottom: 'calc(var(--composer-safe-bottom, 0px) + 6px)' }}
      >
        <AttachMenu
          variant="icon"
          uploading={uploading}
          onFiles={onFiles}
          className="h-9 w-9 rounded-full border border-border/70 text-muted-foreground active:scale-95 transition-transform shrink-0"
        />
        <div className="flex-1 min-w-0 flex items-end rounded-full border border-border/70 bg-muted/40 pl-4 pr-1 py-0.5">
          <textarea
            ref={taRef}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              // When the keyboard opens, push the conversation up so the
              // latest messages remain visible just above the composer.
              const el = scrollRef.current;
              if (!el) return;
              window.setTimeout(() => {
                el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
              }, 220);
            }}
            placeholder={isOptedOut ? 'This number opted out' : 'Message'}
            disabled={isOptedOut}
            rows={1}
            aria-label={`Message ${fullName} via ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            aria-multiline="true"
            enterKeyHint="send"
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            style={{ height: taHeight }}
            className="flex-1 min-w-0 resize-none bg-transparent border-0 outline-none text-[15px] leading-snug py-2 placeholder:text-muted-foreground/55 disabled:opacity-50 max-h-[140px] focus-visible:outline-none"
          />
          {showSendBtn && (
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend || sending}
              aria-label={sending ? 'Sending message' : 'Send message'}
              aria-busy={sending || undefined}
              aria-keyshortcuts="Meta+Enter Control+Enter"
              title="Send (⌘/Ctrl + Enter)"
              className={cn(
                'shrink-0 ml-1 mb-0.5 h-8 w-8 rounded-full inline-flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                canSend && !sending
                  ? 'bg-primary text-primary-foreground active:scale-95'
                  : 'bg-muted-foreground/20 text-muted-foreground',
              )}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
