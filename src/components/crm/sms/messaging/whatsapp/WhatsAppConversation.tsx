import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { haptic } from '@/lib/native';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
  ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  Search, Send, ArrowLeft, Phone, Video, MoreVertical, Smile,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Bell, BellOff, Mail, Archive, ArchiveRestore, Trash2,
  Reply, Sparkles, Paperclip, Calendar as CalendarIcon, X,
  Check, CheckCheck, Clock, AlertCircle, FileText, Mic, Volume2, VolumeX,
} from 'lucide-react';
import { format, formatDistanceToNow, differenceInMinutes, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { type MessagingChannel, type SmsLogRow } from '@/hooks/useSms';
import { useThreadState } from '@/hooks/useThreadState';
import { isMessagingMuted, setMessagingMuted } from '@/lib/messagingSound';
import { toast } from 'sonner';
import { initialsFor, nameFor, parseQuoted, REACTION_EMOJIS, type Thread, type QuotedRef } from '../shared/types';
import { HighlightedText } from '../shared/HighlightedText';
import { PopoverMenuItem } from '../shared/UiBits';
import { WhatsAppTemplatePicker } from '@/components/crm/sms/WhatsAppTemplatePicker';

const channel: MessagingChannel = 'whatsapp';

interface Props {
  thread: Thread;
  visibleMessages: SmsLogRow[];
  highlight: string;
  threadState: ReturnType<typeof useThreadState>;
  composeBody: string;
  onComposeChange: (v: string) => void;
  onSend: () => Promise<void> | void;
  sending: boolean;
  pendingMedia: File[];
  onMediaChange: (f: File[]) => void;
  scheduledFor: string;
  onScheduledChange: (v: string) => void;
  quotedRef: QuotedRef | null;
  onQuote: (m: SmsLogRow) => void;
  onClearQuote: () => void;
  onDeleteMessage: (id: string) => void;
  templates: Array<{ id: string; name: string; body: string }>;
  isMobile: boolean;
  leftCollapsed: boolean;
  onToggleLeft: () => void;
  rightCollapsed: boolean;
  hasContactDetails: boolean;
  onToggleRight: () => void;
  onBack: () => void;
  onOpenLead: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
  showConvoSearch: boolean;
  onToggleConvoSearch: () => void;
  convoSearch: string;
  onConvoSearchChange: (v: string) => void;
  lastInboundAt: string | null;
}

export function WhatsAppConversation(props: Props) {
  const {
    thread, visibleMessages, highlight, threadState, composeBody, onComposeChange,
    onSend, sending, pendingMedia, onMediaChange, scheduledFor, onScheduledChange,
    quotedRef, onQuote, onClearQuote, onDeleteMessage, templates,
    isMobile, leftCollapsed, onToggleLeft, rightCollapsed, hasContactDetails, onToggleRight,
    onBack, onOpenLead, onToggleMute, onToggleArchive, onMarkUnread, onDelete,
    showConvoSearch, onToggleConvoSearch, convoSearch, onConvoSearchChange, lastInboundAt,
  } = props;
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const muted = threadState.isMuted(channel, thread.key);
  const archived = threadState.isArchived(channel, thread.key);

  // "online" / "last seen"
  const lastSeen = useMemo(() => {
    if (!lastInboundAt) return 'tap to view info';
    const d = new Date(lastInboundAt);
    const mins = (Date.now() - d.getTime()) / 60000;
    if (mins < 5) return 'online';
    return `last seen ${format(d, 'h:mm a')}`;
  }, [lastInboundAt]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visibleMessages.length, thread.key]);

  return (
    <div className="flex flex-col h-full wa-font">
      {/* ===== Teal header ===== */}
      <div className="wa-header px-3 py-2 flex items-center gap-2 native-safe-top">
        {isMobile ? (
          <Button size="icon" variant="ghost" className="h-9 w-9 text-white hover:bg-white/10 -ml-1" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full text-white/80 hover:bg-white/10 hover:text-white -ml-1"
                  onClick={onToggleLeft}
                >
                  {leftCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{leftCollapsed ? 'Show chats' : 'Hide chats'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <button onClick={onOpenLead} className="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-90 text-left">
          <Avatar className="h-9 w-9 ring-1 ring-white/20">
            <AvatarFallback className="text-[11px] font-semibold bg-emerald-700/40 text-white">
              {initialsFor(thread.contact, thread.phone)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-[15px] font-medium truncate flex items-center gap-1.5 text-white">
              {nameFor(thread.contact, thread.phone)}
              {muted && <BellOff className="w-3 h-3 opacity-70" />}
            </div>
            <div className="text-[11.5px] text-white/70 truncate">{lastSeen}</div>
          </div>
        </button>

        <div className="flex items-center gap-1">
          {!isMobile && <SoundToggle dark />}
          <TooltipProvider>
            {!isMobile && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full text-white/85 hover:bg-white/10 hover:text-white">
                      <Video className="w-[18px] h-[18px]" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Video call</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full text-white/85 hover:bg-white/10 hover:text-white">
                      <Phone className="w-[17px] h-[17px]" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Voice call</TooltipContent>
                </Tooltip>
              </>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon" variant="ghost"
                  className={cn('h-9 w-9 rounded-full text-white/85 hover:bg-white/10 hover:text-white',
                    showConvoSearch && 'bg-white/15')}
                  onClick={onToggleConvoSearch}
                >
                  <Search className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Search messages</TooltipContent>
            </Tooltip>
            {!isMobile && hasContactDetails && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon" variant="ghost"
                    className="h-9 w-9 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                    onClick={onToggleRight}
                  >
                    {rightCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{rightCollapsed ? 'Show details' : 'Hide details'}</TooltipContent>
              </Tooltip>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full text-white/85 hover:bg-white/10 hover:text-white">
                  <MoreVertical className="w-[18px] h-[18px]" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1">
                {thread.contact && (
                  <PopoverMenuItem icon={<span className="w-3.5 h-3.5 rounded-full bg-emerald-500" />}
                    onClick={() => navigate(`/crm/leads/${thread.contact!.id}`)}>
                    View lead profile
                  </PopoverMenuItem>
                )}
                <PopoverMenuItem
                  icon={muted ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                  onClick={onToggleMute}
                >
                  {muted ? 'Unmute notifications' : 'Mute notifications'}
                </PopoverMenuItem>
                <PopoverMenuItem icon={<Mail className="w-3.5 h-3.5" />} onClick={onMarkUnread}>
                  Mark as unread
                </PopoverMenuItem>
                <PopoverMenuItem
                  icon={archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  onClick={onToggleArchive}
                >
                  {archived ? 'Unarchive chat' : 'Archive chat'}
                </PopoverMenuItem>
                <div className="my-1 border-t border-border" />
                <PopoverMenuItem icon={<Trash2 className="w-3.5 h-3.5" />} destructive onClick={onDelete}>
                  Delete chat
                </PopoverMenuItem>
              </PopoverContent>
            </Popover>
          </TooltipProvider>
        </div>
      </div>

      {showConvoSearch && (
        <div className="px-4 py-2 border-b border-border bg-muted/20 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Input
            autoFocus value={convoSearch} onChange={(e) => onConvoSearchChange(e.target.value)}
            placeholder="Search messages…"
            className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-0 flex-1 min-w-0"
          />
          {convoSearch && (
            <span className="text-[10.5px] text-muted-foreground whitespace-nowrap shrink-0">
              {visibleMessages.length} match{visibleMessages.length === 1 ? '' : 'es'}
            </span>
          )}
          <Button
            size="icon" variant="ghost" className="h-6 w-6 shrink-0"
            onClick={() => { if (convoSearch) onConvoSearchChange(''); else onToggleConvoSearch(); }}
            aria-label={convoSearch ? 'Clear search' : 'Close search'}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* ===== Doodle background message canvas ===== */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-12 py-4 wa-bg">
        <WhatsAppList
          messages={visibleMessages}
          highlight={highlight}
          threadState={threadState}
          onReply={onQuote}
          onDeleteMessage={onDeleteMessage}
        />
      </div>

      {/* ===== Composer ===== */}
      <WhatsAppComposer
        value={composeBody}
        onChange={onComposeChange}
        onSend={onSend}
        sending={sending}
        templates={templates}
        pendingMedia={pendingMedia}
        onMediaChange={onMediaChange}
        scheduledFor={scheduledFor}
        onScheduledChange={onScheduledChange}
        quotedRef={quotedRef}
        onClearQuote={onClearQuote}
        lastInboundAt={lastInboundAt}
      />
    </div>
  );
}

function SoundToggle({ dark }: { dark?: boolean }) {
  const [muted, setMuted] = useState(isMessagingMuted());
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon" variant="ghost"
          className={cn('h-9 w-9 rounded-full',
            dark ? 'text-white/85 hover:bg-white/10 hover:text-white' : 'text-muted-foreground hover:text-foreground')}
          onClick={() => { const v = !muted; setMessagingMuted(v); setMuted(v); }}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{muted ? 'Sounds off' : 'Sounds on'}</TooltipContent>
    </Tooltip>
  );
}

// ════════════════════════════════════════════════════════════════════
// Message list — WhatsApp day separator chips
// ════════════════════════════════════════════════════════════════════

interface ListProps {
  messages: SmsLogRow[];
  highlight: string;
  threadState: ReturnType<typeof useThreadState>;
  onReply: (m: SmsLogRow) => void;
  onDeleteMessage: (id: string) => void;
}

function WhatsAppList({ messages, highlight, threadState, onReply, onDeleteMessage }: ListProps) {
  if (messages.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground py-12">
        {highlight ? `No matches for "${highlight}"` : 'No messages yet — start the conversation 👋'}
      </div>
    );
  }
  return (
    <div className="space-y-[2px] max-w-3xl mx-auto">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const date = new Date(m.sent_at);
        const showDayChip = !prev || !sameDay(date, new Date(prev.sent_at));
        const isOutbound = m.direction === 'outbound';
        const sameAsPrev = prev && prev.direction === m.direction
          && sameDay(date, new Date(prev.sent_at))
          && differenceInMinutes(date, new Date(prev.sent_at)) < 3;
        const sameAsNext = next && next.direction === m.direction
          && sameDay(date, new Date(next.sent_at))
          && differenceInMinutes(new Date(next.sent_at), date) < 3;
        const isFirstInRun = !sameAsPrev;

        return (
          <div key={m.id}>
            {showDayChip && (
              <div className="flex justify-center py-3">
                <span className="px-3 py-1 rounded-md bg-white/85 dark:bg-[#182229] text-[12px] font-medium text-[#54656f] dark:text-[#aebac1] shadow-sm">
                  {dayChipLabel(date)}
                </span>
              </div>
            )}
            <WhatsAppBubble
              m={m}
              isOutbound={isOutbound}
              isFirstInRun={!!isFirstInRun}
              sameAsPrev={!!sameAsPrev}
              sameAsNext={!!sameAsNext}
              highlight={highlight}
              threadState={threadState}
              onReply={onReply}
              onDeleteMessage={onDeleteMessage}
            />
          </div>
        );
      })}
    </div>
  );
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayChipLabel(d: Date) {
  if (isToday(d)) return 'TODAY';
  if (isYesterday(d)) return 'YESTERDAY';
  return format(d, 'MMMM d, yyyy').toUpperCase();
}

// ════════════════════════════════════════════════════════════════════
// Bubble
// ════════════════════════════════════════════════════════════════════

interface BubbleProps {
  m: SmsLogRow;
  isOutbound: boolean;
  isFirstInRun: boolean;
  sameAsPrev: boolean;
  sameAsNext: boolean;
  highlight: string;
  threadState: ReturnType<typeof useThreadState>;
  onReply: (m: SmsLogRow) => void;
  onDeleteMessage: (id: string) => void;
}

function WhatsAppBubble({
  m, isOutbound, isFirstInRun, sameAsPrev, sameAsNext, highlight, threadState, onReply, onDeleteMessage,
}: BubbleProps) {
  const reaction = threadState.getReaction(m.id);
  const isOptimistic = m.id.startsWith('optimistic-');
  const isScheduled = m.status === 'scheduled';
  const { quote, text } = parseQuoted(m.body);
  const time = format(new Date(m.sent_at), 'h:mm a');

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn('flex group', isOutbound ? 'justify-end pr-2' : 'justify-start pl-2', sameAsPrev ? 'mt-[2px]' : 'mt-1.5')}>
          <div className="relative max-w-[85%] sm:max-w-[72%] lg:max-w-[65%] min-w-0">
            <div
              className={cn(
                'relative px-2.5 pt-2 pb-1.5 text-[14.5px] leading-[1.45] msg-pop-in',
                isOutbound ? 'wa-bubble-out' : 'wa-bubble-in',
                // WhatsApp tail goes on the FIRST bubble in a run (top corner) — opposite of iMessage
                isOutbound
                  ? cn('rounded-[14px]', isFirstInRun ? 'rounded-tr-[2px]' : 'rounded-tr-[14px]')
                  : cn('rounded-[14px]', isFirstInRun ? 'rounded-tl-[2px]' : 'rounded-tl-[14px]'),
                (isOptimistic || isScheduled) && 'opacity-70',
              )}
              style={{ minWidth: 80 }}
            >
              {/* Shark-fin tail (only on first-in-run) */}
              {isFirstInRun && (
                isOutbound ? (
                  <svg viewBox="0 0 8 13" className="absolute -right-[7px] top-0 w-2 h-3.5 pointer-events-none" aria-hidden>
                    <path d="M0 0 L8 0 L0 13 Z" className="fill-[#d9fdd3] dark:fill-[#005c4b]" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 8 13" className="absolute -left-[7px] top-0 w-2 h-3.5 pointer-events-none" aria-hidden>
                    <path d="M8 0 L0 0 L8 13 Z" className="fill-white dark:fill-[#202c33]" />
                  </svg>
                )
              )}

              {/* Quoted reply */}
              {quote && (
                <div className={cn(
                  'mb-1 rounded-md pl-2 pr-2 py-1 text-[12.5px] line-clamp-2',
                  isOutbound
                    ? 'bg-emerald-700/15 dark:bg-emerald-900/40 border-l-[3px] border-emerald-700 dark:border-emerald-400'
                    : 'bg-black/5 dark:bg-white/5 border-l-[3px] border-emerald-600',
                )}>
                  {quote}
                </div>
              )}

              <div className="min-w-0 max-w-full whitespace-pre-wrap break-words break-all [overflow-wrap:anywhere] [word-break:break-word] hyphens-auto pr-[64px]">
                <HighlightedText text={text} query={highlight} />
              </div>

              {m.media_urls && m.media_urls.length > 0 && (
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  {m.media_urls.map((u: string, idx: number) => {
                    const isImg = /\.(jpe?g|png|gif|webp|heic)$|image%2F/i.test(u);
                    if (isImg) {
                      return (
                        <a key={idx} href={u} target="_blank" rel="noreferrer">
                          <img src={u} className="rounded-md max-h-40 object-cover" alt="attachment" />
                        </a>
                      );
                    }
                    return (
                      <a key={idx} href={u} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-md bg-black/10 hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/15">
                        <FileText className="w-3 h-3" /> Attachment
                      </a>
                    );
                  })}
                </div>
              )}

              {/* In-bubble timestamp + checks (WA signature placement) */}
              <div className={cn(
                'absolute bottom-1 right-2 flex items-center gap-1',
                isOutbound ? 'wa-meta-out' : 'wa-meta',
              )}>
                <span className="text-[10.5px] leading-none">{time}</span>
                {isOutbound && <WaStatusTicks status={m.status} />}
              </div>
            </div>

            {/* Reaction */}
            {reaction && (
              <div
                className={cn(
                  'absolute -bottom-3 px-1.5 py-0.5 rounded-full bg-white dark:bg-[#202c33] border border-black/10 dark:border-white/10 shadow text-[12px] cursor-pointer',
                  isOutbound ? '-left-1' : '-right-1',
                )}
                onClick={() => threadState.setReaction(m.id, null)}
              >
                {reaction}
              </div>
            )}

            {/* Hover quick-react */}
            <div className={cn(
              'absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10',
              isOutbound ? '-left-9' : '-right-9',
            )}>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full bg-white dark:bg-[#202c33] border border-black/10 dark:border-white/10 shadow-sm">
                    <Smile className="w-3.5 h-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="center" className="w-auto p-1.5 rounded-2xl">
                  <div className="flex gap-0.5">
                    {REACTION_EMOJIS.map(e => (
                      <button
                        key={e}
                        onClick={() => threadState.setReaction(m.id, e === reaction ? null : e)}
                        className={cn('h-9 w-9 rounded-full hover:bg-muted text-base hover:scale-110 transition-transform',
                          reaction === e && 'bg-emerald-500/15')}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={() => onReply(m)} className="gap-2">
          <Reply className="w-3.5 h-3.5" /> Reply
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <Smile className="w-3.5 h-3.5" /> React
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {REACTION_EMOJIS.map(e => (
              <ContextMenuItem
                key={e}
                onClick={() => threadState.setReaction(m.id, e === reaction ? null : e)}
                className="text-base"
              >
                {e}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(m.body)} className="gap-2">
          📋 Copy text
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={isOptimistic}
          onClick={() => onDeleteMessage(m.id)}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete message
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function WaStatusTicks({ status }: { status: string }) {
  if (status === 'scheduled') return <CalendarIcon className="w-3 h-3" />;
  if (status === 'failed' || status === 'undelivered') return <AlertCircle className="w-3 h-3 text-destructive" />;
  if (status === 'queued' || status === 'sending' || status === 'pending') return <Clock className="w-3 h-3" />;
  if (status === 'read') return <CheckCheck className="w-[14px] h-[14px] text-[#53bdeb]" />;
  if (status === 'delivered') return <CheckCheck className="w-[14px] h-[14px]" />;
  if (status === 'sent') return <Check className="w-[13px] h-[13px]" />;
  return <Check className="w-[13px] h-[13px] opacity-50" />;
}

// ════════════════════════════════════════════════════════════════════
// Composer
// ════════════════════════════════════════════════════════════════════

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => Promise<void> | void;
  sending: boolean;
  templates: Array<{ id: string; name: string; body: string }>;
  pendingMedia: File[];
  onMediaChange: (f: File[]) => void;
  scheduledFor: string;
  onScheduledChange: (v: string) => void;
  quotedRef: QuotedRef | null;
  onClearQuote: () => void;
  lastInboundAt: string | null;
}

function WhatsAppComposer({
  value, onChange, onSend, sending, templates,
  pendingMedia, onMediaChange, scheduledFor, onScheduledChange,
  quotedRef, onClearQuote, lastInboundAt,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const outsideWaWindow = useMemo(() => {
    if (!lastInboundAt) return true;
    return Date.now() - new Date(lastInboundAt).getTime() > 24 * 60 * 60 * 1000;
  }, [lastInboundAt]);
  const canSend = (value.trim().length > 0 || pendingMedia.length > 0) && !sending && !outsideWaWindow;

  const defaultScheduled = useMemo(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return d.toISOString().slice(0, 16);
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    if (pendingMedia.length + arr.length > 10) {
      toast.error('Max 10 attachments per message');
      return;
    }
    onMediaChange([...pendingMedia, ...arr]);
  };

  // Wraps the parent's onSend with a native haptic so iOS / Android users feel
  // the same little "thump" they'd get in WhatsApp.
  const onSendWithHaptic = useCallback(async () => {
    haptic('light');
    await onSend();
  }, [onSend]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Enter sends; Shift+Enter inserts a newline (standard chat behavior).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSendWithHaptic();
    }
  };

  return (
    <div className="wa-composer-bar px-3 py-2 wa-font native-safe-bottom native-kb-lift">
      <div className="max-w-3xl mx-auto space-y-1.5">
        {quotedRef && (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-white dark:bg-[#202c33] border-l-[3px] border-emerald-600 shadow-sm">
            <Reply className="w-3 h-3 text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                Replying to {quotedRef.direction === 'outbound' ? 'yourself' : 'them'}
              </div>
              <div className="truncate">{quotedRef.body}</div>
            </div>
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={onClearQuote}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        {pendingMedia.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg bg-white/60 dark:bg-[#202c33]/60 border border-dashed border-border">
            {pendingMedia.map((f, idx) => {
              const isImg = f.type.startsWith('image/');
              return (
                <div key={idx} className="relative group">
                  {isImg ? (
                    <img src={URL.createObjectURL(f)} alt={f.name} className="h-14 w-14 object-cover rounded-md border border-border" />
                  ) : (
                    <div className="h-14 w-14 rounded-md border border-border bg-background flex flex-col items-center justify-center text-[9px] text-muted-foreground p-1">
                      <FileText className="w-4 h-4 mb-0.5" />
                      <span className="truncate max-w-full">{f.name.split('.').pop()?.toUpperCase()}</span>
                    </div>
                  )}
                  <button
                    onClick={() => onMediaChange(pendingMedia.filter((_, i) => i !== idx))}
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}
            <span className="text-[10.5px] text-muted-foreground ml-1">
              {pendingMedia.length}/10 · {(pendingMedia.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)}MB
            </span>
          </div>
        )}

        {scheduledFor && (
          <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            <CalendarIcon className="w-3 h-3" />
            <span className="flex-1">
              Sending {format(new Date(scheduledFor), "MMM d 'at' h:mm a")} ({formatDistanceToNow(new Date(scheduledFor), { addSuffix: true })})
            </span>
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => onScheduledChange('')}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        {outsideWaWindow && (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            WhatsApp blocks free-form sends outside the 24-hour reply window. Have the lead reply first, or send by SMS.
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,application/pdf"
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />

          {/* Emoji (placeholder — opens templates) */}
          {templates.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full shrink-0 text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5">
                  <Sparkles className="w-5 h-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">Quick replies</div>
                <div className="max-h-72 overflow-y-auto">
                  {templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => onChange(t.body)}
                      className="w-full text-left px-2 py-2 rounded-md hover:bg-muted text-xs"
                    >
                      <div className="font-medium text-foreground">{t.name}</div>
                      <div className="text-muted-foreground line-clamp-2 mt-0.5">{t.body}</div>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Attach */}
          <Button
            size="icon" variant="ghost"
            className="h-10 w-10 rounded-full shrink-0 text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5"
            onClick={() => fileInputRef.current?.click()}
            title="Attach"
          >
            <Paperclip className="w-5 h-5 -rotate-45" />
          </Button>

          {/* WA template picker (24h window) */}
          <WhatsAppTemplatePicker
            outsideWindow={outsideWaWindow}
            onPick={(body) => onChange(value ? `${value}\n${body}` : body)}
          />

          {/* Schedule */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon" variant="ghost"
                className={cn('h-10 w-10 rounded-full shrink-0',
                  scheduledFor ? 'text-emerald-600' : 'text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5')}
                title="Schedule send"
              >
                <CalendarIcon className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3 space-y-2">
              <div className="text-xs font-semibold">Schedule send</div>
              <Input
                type="datetime-local"
                value={scheduledFor || defaultScheduled}
                min={new Date(Date.now() + 60 * 1000).toISOString().slice(0, 16)}
                onChange={(e) => onScheduledChange(new Date(e.target.value).toISOString())}
                className="text-xs h-8"
              />
              {scheduledFor && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => onScheduledChange('')}>
                  Clear schedule
                </Button>
              )}
            </PopoverContent>
          </Popover>

          {/* Input pill */}
          <div className="wa-composer-input flex-1 px-4 py-1.5 shadow-sm">
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={outsideWaWindow ? 'Waiting for a WhatsApp reply window…' : 'Type a message'}
              rows={1}
              className="w-full min-h-[28px] max-h-40 resize-none border-0 bg-transparent px-0 py-0.5 text-[15px] focus-visible:ring-0 focus-visible:border-0 shadow-none placeholder:text-muted-foreground/70"
            />
          </div>

          {/* Send / Mic */}
          <Button
            size="icon"
            onClick={canSend ? onSendWithHaptic : undefined}
            disabled={sending}
            className={cn(
              'h-11 w-11 rounded-full shrink-0 transition-all native-press',
              canSend
                ? 'wa-send shadow-md hover:shadow-lg active:scale-95'
                : 'wa-send opacity-90',
            )}
            title={outsideWaWindow ? 'WhatsApp send locked outside the 24h window' : canSend ? 'Send' : 'Voice message'}
          >
            {canSend
              ? (scheduledFor ? <CalendarIcon className="w-5 h-5" /> : <Send className="w-[18px] h-[18px]" />)
              : <Mic className="w-5 h-5" />}
          </Button>
        </div>

        <div className="flex items-center justify-between mt-1 px-2 text-[10.5px] text-muted-foreground">
          <span>WhatsApp Business · via Twilio{outsideWaWindow ? ' · outside 24h window' : ''}</span>
          <span className="opacity-70">↵ send · ⇧↵ newline</span>
        </div>
      </div>
    </div>
  );
}
