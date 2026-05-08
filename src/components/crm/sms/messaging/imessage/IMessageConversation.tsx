import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { haptic } from '@/lib/native';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
  ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  Search, Send, ArrowLeft, Phone, Info, MoreHorizontal,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Bell, BellOff, Mail, Archive, ArchiveRestore, Trash2,
  Reply, Smile, Sparkles, Paperclip, Calendar as CalendarIcon, X,
  CheckCircle2, Clock, AlertCircle, FileText, Volume2, VolumeX,
  Camera, ChevronUp, Plus, AudioLines,
} from 'lucide-react';
import { format, formatDistanceToNow, isToday, isYesterday, differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  smsSegments, type MessagingChannel, type SmsLogRow,
} from '@/hooks/useSms';
import { useThreadState } from '@/hooks/useThreadState';
import { uploadSmsMedia } from '@/lib/smsMediaUpload';
import { isMessagingMuted, setMessagingMuted } from '@/lib/messagingSound';
import { toast } from 'sonner';
import { initialsFor, nameFor, parseQuoted, REACTION_EMOJIS, type Thread, type QuotedRef } from '../shared/types';
import { HighlightedText } from '../shared/HighlightedText';
import { PopoverMenuItem } from '../shared/UiBits';

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
  // header
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
}

const channel: MessagingChannel = 'sms';

export function IMessageConversation(props: Props) {
  const {
    thread, visibleMessages, highlight, threadState, composeBody, onComposeChange,
    onSend, sending, pendingMedia, onMediaChange, scheduledFor, onScheduledChange,
    quotedRef, onQuote, onClearQuote, onDeleteMessage, templates,
    isMobile, leftCollapsed, onToggleLeft, rightCollapsed, hasContactDetails, onToggleRight,
    onBack, onOpenLead, onToggleMute, onToggleArchive, onMarkUnread, onDelete,
    showConvoSearch, onToggleConvoSearch, convoSearch, onConvoSearchChange,
  } = props;
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const muted = threadState.isMuted(channel, thread.key);
  const archived = threadState.isArchived(channel, thread.key);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visibleMessages.length, thread.key]);

  return (
    <div className="flex flex-col h-full imsg-font">
      {/* ===== Frosted header (centered title, iMessage style) ===== */}
      <div className="imsg-header px-4 py-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-2 native-safe-top">
        {/* Left controls */}
        <div className="flex items-center gap-1">
          {isMobile ? (
            <Button size="icon" variant="ghost" className="h-8 w-8 -ml-1 text-[#007AFF]" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground -ml-1"
                    onClick={onToggleLeft}
                  >
                    {leftCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{leftCollapsed ? 'Show conversations' : 'Hide conversations'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Center: avatar stacked above name (true iMessage) */}
        <button
          onClick={onOpenLead}
          className="flex flex-col items-center gap-0.5 min-w-0 hover:opacity-80 transition-opacity"
        >
          <Avatar className="h-9 w-9 ring-1 ring-border/50">
            <AvatarFallback className="text-[11px] font-semibold bg-gradient-to-br from-[#3a3a3c] to-[#1c1c1e] text-white">
              {initialsFor(thread.contact, thread.phone)}
            </AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-1 max-w-full">
            <span className="text-[12px] font-medium truncate">
              {nameFor(thread.contact, thread.phone)}
            </span>
            {muted && <BellOff className="w-2.5 h-2.5 text-muted-foreground shrink-0" />}
            <ChevronUp className="w-3 h-3 text-muted-foreground rotate-90" />
          </div>
        </button>

        {/* Right action icons (FaceTime / info) — iOS blue */}
        <div className="flex items-center gap-1">
          <SoundToggle />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn('h-8 w-8 rounded-full text-[#007AFF] hover:bg-[#007AFF]/10',
                    showConvoSearch && 'bg-[#007AFF]/15')}
                  onClick={onToggleConvoSearch}
                >
                  <Search className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Find in conversation</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-[#007AFF] hover:bg-[#007AFF]/10">
                  <Phone className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>FaceTime audio</TooltipContent>
            </Tooltip>
            {thread.contact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-full text-[#007AFF] hover:bg-[#007AFF]/10"
                    onClick={() => navigate(`/crm/leads/${thread.contact!.id}`)}
                  >
                    <Info className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Lead info</TooltipContent>
              </Tooltip>
            )}
            {!isMobile && hasContactDetails && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
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
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-1">
                <PopoverMenuItem
                  icon={muted ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                  onClick={onToggleMute}
                >
                  {muted ? 'Unmute' : 'Hide alerts'}
                </PopoverMenuItem>
                <PopoverMenuItem
                  icon={archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                  onClick={onToggleArchive}
                >
                  {archived ? 'Unarchive' : 'Archive'}
                </PopoverMenuItem>
                <PopoverMenuItem icon={<Mail className="w-3.5 h-3.5" />} onClick={onMarkUnread}>
                  Mark as unread
                </PopoverMenuItem>
                <div className="my-1 border-t border-border" />
                <PopoverMenuItem icon={<Trash2 className="w-3.5 h-3.5" />} destructive onClick={onDelete}>
                  Delete conversation
                </PopoverMenuItem>
              </PopoverContent>
            </Popover>
          </TooltipProvider>
        </div>
      </div>

      {/* ===== In-conversation search ===== */}
      {showConvoSearch && (
        <div className="px-5 py-2 border-b border-border bg-muted/20 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={convoSearch}
            onChange={(e) => onConvoSearchChange(e.target.value)}
            placeholder="Find in conversation…"
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

      {/* ===== Messages ===== */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 imsg-bg">
        <IMessageList
          messages={visibleMessages}
          highlight={highlight}
          threadState={threadState}
          onReply={onQuote}
          onDeleteMessage={onDeleteMessage}
        />
      </div>

      {/* ===== Composer ===== */}
      <IMessageComposer
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
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Sound toggle
// ════════════════════════════════════════════════════════════════════
function SoundToggle() {
  const [muted, setMuted] = useState(isMessagingMuted());
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
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
// Message list with SVG bubble tails + tapbacks
// ════════════════════════════════════════════════════════════════════

interface ListProps {
  messages: SmsLogRow[];
  highlight: string;
  threadState: ReturnType<typeof useThreadState>;
  onReply: (m: SmsLogRow) => void;
  onDeleteMessage: (id: string) => void;
}

function IMessageList({ messages, highlight, threadState, onReply, onDeleteMessage }: ListProps) {
  if (messages.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground py-12">
        {highlight ? `No matches for "${highlight}"` : 'No messages yet — say hi 👋'}
      </div>
    );
  }
  return (
    <div className="space-y-0.5 max-w-3xl mx-auto">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const date = new Date(m.sent_at);
        const showTimestamp = !prev || differenceInMinutes(date, new Date(prev.sent_at)) > 15;
        const isOutbound = m.direction === 'outbound';
        const sameAsNext = next && next.direction === m.direction
          && differenceInMinutes(new Date(next.sent_at), date) < 2;
        const sameAsPrev = prev && prev.direction === m.direction
          && differenceInMinutes(date, new Date(prev.sent_at)) < 2;
        const isLastInRun = !sameAsNext;

        return (
          <div key={m.id}>
            {showTimestamp && (
              <div className="text-center text-[10.5px] text-muted-foreground py-3 font-medium">
                {format(date, isToday(date) ? "'Today' h:mm a" : isYesterday(date) ? "'Yesterday' h:mm a" : 'MMM d, h:mm a')}
              </div>
            )}
            <IMessageBubble
              m={m}
              isOutbound={isOutbound}
              sameAsPrev={!!sameAsPrev}
              sameAsNext={!!sameAsNext}
              isLastInRun={!!isLastInRun}
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

// ════════════════════════════════════════════════════════════════════
// Single iMessage bubble with SVG tail
// ════════════════════════════════════════════════════════════════════


interface BubbleProps {
  m: SmsLogRow;
  isOutbound: boolean;
  sameAsPrev: boolean;
  sameAsNext: boolean;
  isLastInRun: boolean;
  highlight: string;
  threadState: ReturnType<typeof useThreadState>;
  onReply: (m: SmsLogRow) => void;
  onDeleteMessage: (id: string) => void;
}

function IMessageBubble({
  m, isOutbound, sameAsPrev, sameAsNext, isLastInRun, highlight, threadState, onReply, onDeleteMessage,
}: BubbleProps) {
  const reaction = threadState.getReaction(m.id);
  const isOptimistic = m.id.startsWith('optimistic-');
  const isScheduled = m.status === 'scheduled';
  const { quote, text } = parseQuoted(m.body);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn('flex group', isOutbound ? 'justify-end pr-3' : 'justify-start pl-3', sameAsPrev ? 'mt-[2px]' : 'mt-1.5')}>
          <div className="relative max-w-[82%] sm:max-w-[68%] lg:max-w-[60%] min-w-0">
            <div
              className={cn(
                'relative px-3.5 py-2 text-[15px] leading-[1.42] msg-pop-in rounded-[18px]',
                isOutbound ? 'imsg-bubble-out' : 'imsg-bubble-in',
                // shape: tighten the adjoining corner when same sender continues;
                // square off the tail-side bottom corner on last-in-run so the SVG tail blends seamlessly
                isOutbound
                  ? cn(sameAsPrev && 'rounded-tr-[4px]', sameAsNext ? 'rounded-br-[4px]' : 'rounded-br-[6px]', isLastInRun && 'rounded-br-[6px]')
                  : cn(sameAsPrev && 'rounded-tl-[4px]', sameAsNext ? 'rounded-bl-[4px]' : 'rounded-bl-[6px]', isLastInRun && 'rounded-bl-[6px]'),
                (isOptimistic || isScheduled) && 'opacity-70',
              )}
            >
              {/* SVG bubble tail — sits flush at the bubble's bottom corner so it never paints over wrapped lines above */}
              {isLastInRun && (
                isOutbound ? (
                  <svg
                    viewBox="0 0 12 16"
                    className="imsg-tail-out absolute right-[-6px] bottom-0 w-[12px] h-[16px] pointer-events-none"
                    aria-hidden
                  >
                    {/* anchor at bubble's bottom-right; curve outward then back to baseline */}
                    <path d="M0 16 C 0 8, 4 4, 12 0 C 9 8, 6 14, 2 16 Z" fill="currentColor" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 12 16"
                    className="imsg-tail-in absolute left-[-6px] bottom-0 w-[12px] h-[16px] pointer-events-none"
                    aria-hidden
                  >
                    <path d="M12 16 C 12 8, 8 4, 0 0 C 3 8, 6 14, 10 16 Z" fill="currentColor" />
                  </svg>
                )
              )}

              {/* Quoted reply */}
              {quote && (
                <div className={cn(
                  'mb-1 pl-2 border-l-2 text-[12.5px] italic line-clamp-2 opacity-80',
                  isOutbound ? 'border-white/40' : 'border-foreground/30',
                )}>
                  {quote}
                </div>
              )}

              <div className="min-w-0 max-w-full whitespace-pre-wrap break-words break-all [overflow-wrap:anywhere] [word-break:break-word] hyphens-auto">
                <HighlightedText text={text} query={highlight} />
              </div>

              {m.media_urls && m.media_urls.length > 0 && (
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  {m.media_urls.map((u: string, idx: number) => {
                    const isImg = /\.(jpe?g|png|gif|webp|heic)$|image%2F/i.test(u);
                    if (isImg) {
                      return (
                        <a key={idx} href={u} target="_blank" rel="noreferrer">
                          <img src={u} className="rounded-lg max-h-40 object-cover" alt="attachment" />
                        </a>
                      );
                    }
                    return (
                      <a
                        key={idx} href={u} target="_blank" rel="noreferrer"
                        className={cn(
                          'flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-md',
                          isOutbound ? 'bg-white/15 hover:bg-white/25' : 'bg-background/60 hover:bg-background',
                        )}
                      >
                        <FileText className="w-3 h-3" /> Attachment
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tapback above bubble (iMessage style) */}
            {reaction && (
              <div
                className={cn(
                  'absolute -top-2.5 px-1.5 py-0.5 rounded-full bg-background border border-border shadow-sm text-[12px] cursor-pointer',
                  isOutbound ? '-left-1' : '-right-1',
                )}
                onClick={() => threadState.setReaction(m.id, null)}
                title="Remove tapback"
              >
                {reaction}
              </div>
            )}

            {/* Hover tapback popover */}
            <div
              className={cn(
                'absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10',
                isOutbound ? '-left-9' : '-right-9',
              )}
            >
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full bg-background border border-border shadow-sm">
                    <Smile className="w-3.5 h-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="center" className="w-auto p-1.5 rounded-2xl">
                  <div className="flex gap-0.5">
                    {REACTION_EMOJIS.map(e => (
                      <button
                        key={e}
                        onClick={() => threadState.setReaction(m.id, e === reaction ? null : e)}
                        className={cn(
                          'h-9 w-9 rounded-full hover:bg-muted text-base transition-transform hover:scale-110',
                          reaction === e && 'bg-primary/15',
                        )}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Status under last outbound bubble */}
            {isOutbound && isLastInRun && (
              <div className="flex justify-end mt-0.5 mr-1.5">
                <span className="text-[10.5px] text-muted-foreground flex items-center gap-1 font-medium">
                  <StatusIcon status={m.status} />
                  {statusLabel(m.status, m.scheduled_for)}
                </span>
              </div>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={() => onReply(m)} className="gap-2">
          <Reply className="w-3.5 h-3.5" /> Reply
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <Smile className="w-3.5 h-3.5" /> Tapback
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

function statusLabel(status: string, scheduledFor?: string | null) {
  if (status === 'scheduled' && scheduledFor) {
    const d = new Date(scheduledFor);
    return `Scheduled · ${formatDistanceToNow(d, { addSuffix: true })}`;
  }
  if (!status) return '';
  if (status === 'read') return 'Read';
  if (status === 'delivered') return 'Delivered';
  if (status === 'sent') return 'Sent';
  if (status === 'queued' || status === 'sending' || status === 'pending') return 'Sending…';
  if (status === 'failed' || status === 'undelivered') return 'Not Delivered';
  return status;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'scheduled') return <CalendarIcon className="w-3 h-3 text-blue-500" />;
  if (status === 'read' || status === 'delivered') return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
  if (status === 'failed' || status === 'undelivered') return <AlertCircle className="w-3 h-3 text-destructive" />;
  if (status === 'queued' || status === 'sending' || status === 'pending') return <Clock className="w-3 h-3" />;
  return <CheckCircle2 className="w-3 h-3 text-muted-foreground/60" />;
}

// ════════════════════════════════════════════════════════════════════
// Composer — pill input with rounded blue send arrow
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
}

function IMessageComposer({
  value, onChange, onSend, sending, templates,
  pendingMedia, onMediaChange, scheduledFor, onScheduledChange,
  quotedRef, onClearQuote,
}: ComposerProps) {
  const seg = smsSegments(value);
  const canSend = (value.trim().length > 0 || pendingMedia.length > 0) && !sending;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Dictation (Web Speech API) ─────────────────────────────────────────
  // Apple-style live voice-to-text: hold-to-talk button replaces the voice icon.
  // Final results are appended to the textarea; interim results stream in a chip.
  const [isDictating, setIsDictating] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);
  const baseValueRef = useRef<string>('');

  const dictationSupported = typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const stopDictation = useCallback(() => {
    const r = recognitionRef.current;
    if (r) {
      try { r.stop(); } catch { /* noop */ }
    }
    setIsDictating(false);
    setInterimText('');
  }, []);

  const startDictation = useCallback(() => {
    if (!dictationSupported) {
      toast.error('Dictation isn\'t supported on this browser. Try Chrome or Safari.');
      return;
    }
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || 'en-US';

    baseValueRef.current = value;

    r.onresult = (event: any) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = res[0]?.transcript ?? '';
        if (res.isFinal) finalChunk += txt;
        else interim += txt;
      }
      if (finalChunk) {
        const sep = baseValueRef.current && !/\s$/.test(baseValueRef.current) ? ' ' : '';
        baseValueRef.current = baseValueRef.current + sep + finalChunk.trim();
        onChange(baseValueRef.current);
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };
    r.onerror = (e: any) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        toast.error('Microphone permission denied');
      } else if (e?.error && e.error !== 'aborted' && e.error !== 'no-speech') {
        toast.error(`Dictation error: ${e.error}`);
      }
      setIsDictating(false);
      setInterimText('');
    };
    r.onend = () => {
      setIsDictating(false);
      setInterimText('');
    };

    try {
      r.start();
      recognitionRef.current = r;
      setIsDictating(true);
      haptic('light');
    } catch {
      // start() can throw if already started — ignore.
    }
  }, [dictationSupported, onChange, value]);

  // Cleanup on unmount
  useEffect(() => () => {
    const r = recognitionRef.current;
    if (r) { try { r.stop(); } catch { /* noop */ } }
  }, []);

  const toggleDictation = () => {
    if (isDictating) stopDictation();
    else startDictation();
  };

  // Auto-resize: grow the textarea up to MAX_LINES (matches iMessage / WhatsApp).
  // The right-side icons stay aligned because the parent row uses items-end and
  // each icon button has a fixed h-9, so they pin to the bottom line of the pill.
  const LINE_HEIGHT = 21;   // 15px font * 1.4 line-height (matches className)
  const MAX_LINES   = 3;
  const MAX_HEIGHT  = LINE_HEIGHT * MAX_LINES; // 63px

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Reset to a single line so scrollHeight reflects only the content.
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [value, MAX_HEIGHT]);

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
  // the same little "thump" they'd get in Messages or WhatsApp.
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
    <div className="px-3 sm:px-4 pt-2 pb-3 imsg-font native-safe-bottom native-kb-lift">
      <div className="max-w-3xl mx-auto space-y-2 rounded-2xl bg-background/85 backdrop-blur-md border border-border/60 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)] px-3 sm:px-4 py-2.5">
        {quotedRef && (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-2xl bg-muted/50 border-l-2 border-[#007AFF]">
            <Reply className="w-3 h-3 text-[#007AFF] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                Replying to {quotedRef.direction === 'outbound' ? 'yourself' : 'them'}
              </div>
              <div className="truncate text-foreground/80">{quotedRef.body}</div>
            </div>
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={onClearQuote}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        {pendingMedia.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap p-2 rounded-2xl bg-muted/40 border border-dashed border-border">
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
          <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-2xl bg-blue-500/10 text-blue-700 dark:text-blue-400">
            <CalendarIcon className="w-3 h-3" />
            <span className="flex-1">
              Sending {format(new Date(scheduledFor), "MMM d 'at' h:mm a")} ({formatDistanceToNow(new Date(scheduledFor), { addSuffix: true })})
            </span>
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => onScheduledChange('')}>
              <X className="w-3 h-3" />
            </Button>
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

          {/* Unified [+] menu — attach, schedule, templates */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-full shrink-0 bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                title="More"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="w-60 p-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-muted text-left text-[13px]"
              >
                <Camera className="w-4 h-4 text-muted-foreground" />
                <span>Photo or file</span>
              </button>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-muted text-left text-[13px]',
                      scheduledFor && 'text-blue-600',
                    )}
                  >
                    <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                    <span>Schedule send</span>
                    {scheduledFor && <span className="ml-auto text-[10px] text-blue-600">on</span>}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" side="right" className="w-72 p-3 space-y-2">
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

              {templates.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-muted text-left text-[13px]"
                    >
                      <Sparkles className="w-4 h-4 text-muted-foreground" />
                      <span>Templates</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="right" className="w-72 p-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">Templates</div>
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
            </PopoverContent>
          </Popover>

          {/* Pill input — grows up to 3 lines, then scrolls internally */}
          <div className="imsg-composer-pill flex items-end flex-1 min-w-0 px-4 py-1.5 min-h-[40px] relative">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={isDictating ? 'Listening…' : 'Message'}
              rows={1}
              className="flex-1 min-h-[24px] resize-none border-0 bg-transparent px-0 py-0 text-[15px] leading-[1.4] focus-visible:ring-0 focus-visible:border-0 shadow-none placeholder:text-muted-foreground/55 overflow-hidden"
              style={{ maxHeight: MAX_HEIGHT }}
            />
            {isDictating && interimText && (
              <span className="pointer-events-none absolute left-4 right-4 bottom-1 text-[13px] leading-tight text-muted-foreground/70 italic truncate">
                {interimText}
              </span>
            )}
          </div>

          {canSend ? (
            // Send button appears when there's content
            <Button
              size="icon"
              onClick={onSendWithHaptic}
              className="h-9 w-9 rounded-full shrink-0 bg-[#007AFF] hover:bg-[#0a84ff] text-white shadow-sm transition-all native-press"
            >
              {scheduledFor ? <CalendarIcon className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </Button>
          ) : (
            <>
              {/* Dictation — Apple-style live voice-to-text */}
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleDictation}
                className={cn(
                  'h-9 w-9 rounded-full shrink-0 transition-all native-press',
                  isDictating
                    ? 'bg-[#FF3B30] text-white hover:bg-[#ff453a] shadow-[0_0_0_4px_rgba(255,59,48,0.18)] animate-pulse'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
                title={isDictating ? 'Tap to stop dictation' : 'Tap to dictate'}
              >
                <AudioLines className="w-4 h-4" />
              </Button>

              {/* Emoji */}
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-full shrink-0 bg-muted text-muted-foreground hover:text-foreground"
                title="Emoji"
                onClick={() => onChange((value || '') + '😊')}
              >
                <Smile className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>

        {pendingMedia.length > 0 && (
          <div className="flex items-center justify-between mt-1.5 px-2 text-[10.5px] text-muted-foreground">
            <span>MMS</span>
          </div>
        )}
      </div>
    </div>
  );
}
