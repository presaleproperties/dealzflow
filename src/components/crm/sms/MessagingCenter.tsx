import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
  ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search, Send, Plus, MoreHorizontal, Phone, Info, Sparkles,
  Paperclip, Image as ImageIcon, ArrowLeft, MessageSquare,
  CheckCircle2, Clock, AlertCircle, X, ChevronRight,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Pin, PinOff, Mail, BellOff, Bell, Trash2, Archive, ArchiveRestore,
  Calendar as CalendarIcon, Reply, Smile, FileText,
} from 'lucide-react';
import { format, formatDistanceToNow, isToday, isYesterday, differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  useAllSmsLog, useSendSms, useSmsTemplates, smsSegments,
  useDeleteSmsMessage, useDeleteSmsConversation,
  type MessagingChannel, type SmsLogRow,
} from '@/hooks/useSms';
import { useCrmContacts, type CrmContact } from '@/hooks/useCrmContacts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useThreadPins } from '@/hooks/useThreadPins';
import { useThreadState } from '@/hooks/useThreadState';
import { useRealtimeSmsLog } from '@/hooks/useRealtimeSmsLog';
import { uploadSmsMedia } from '@/lib/smsMediaUpload';
import { toast } from 'sonner';

interface Thread {
  key: string;
  phone: string;
  contact: CrmContact | undefined;
  messages: SmsLogRow[];
  lastInbound: SmsLogRow | null;
  lastMessage: SmsLogRow;
  unread: boolean;
  channel: MessagingChannel;
}

interface QuotedRef {
  id: string;
  body: string;
  direction: 'inbound' | 'outbound';
}

const REACTION_EMOJIS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

const normalize = (p: string) => (p || '').replace(/\D/g, '').slice(-10);

function initialsFor(c: CrmContact | undefined, phone: string) {
  if (c) {
    const a = (c.first_name || '').trim()[0] || '';
    const b = (c.last_name || '').trim()[0] || '';
    if (a || b) return (a + b).toUpperCase();
  }
  return phone.replace(/\D/g, '').slice(-2);
}

function nameFor(c: CrmContact | undefined, phone: string) {
  if (c) {
    const n = `${c.first_name || ''} ${c.last_name || ''}`.trim();
    if (n) return n;
  }
  return phone;
}

function formatThreadTime(d: Date) {
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 7) return format(d, 'EEE');
  return format(d, 'M/d/yy');
}

interface Props {
  channel: MessagingChannel;
  onChannelChange: (c: MessagingChannel) => void;
}

export function MessagingCenter({ channel, onChannelChange }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useRealtimeSmsLog(); // <<< live updates
  const { data: logs = [] } = useAllSmsLog({ limit: 1000 });
  const { data: contacts = [] } = useCrmContacts();
  const { data: templates = [] } = useSmsTemplates();
  const sendSms = useSendSms();
  const deleteMessage = useDeleteSmsMessage();
  const deleteConversation = useDeleteSmsConversation();
  const { isPinned, togglePin } = useThreadPins();
  const threadState = useThreadState();

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState('');
  const [newChatContact, setNewChatContact] = useState<CrmContact | null>(null);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [convoSearch, setConvoSearch] = useState('');
  const [showConvoSearch, setShowConvoSearch] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<File[]>([]);
  const [scheduledFor, setScheduledFor] = useState<string>('');
  const [quotedRef, setQuotedRef] = useState<QuotedRef | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ key: string; name: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Build threads grouped by phone for current channel
  const threads = useMemo<Thread[]>(() => {
    const map = new Map<string, Thread>();
    for (const l of logs) {
      if ((l.channel || 'sms') !== channel) continue;
      const phone = l.direction === 'inbound' ? l.from_number : l.to_number;
      if (!phone) continue;
      const key = normalize(phone) || phone;
      let t = map.get(key);
      if (!t) {
        const contact = contacts.find(c => normalize(c.phone || '') === key);
        t = {
          key, phone, contact, messages: [], lastInbound: null,
          lastMessage: l, unread: false, channel,
        };
        map.set(key, t);
      }
      t.messages.push(l);
      if (l.direction === 'inbound' && (!t.lastInbound || new Date(l.sent_at) > new Date(t.lastInbound.sent_at))) {
        t.lastInbound = l;
      }
    }
    const arr = [...map.values()].map(t => {
      const sorted = [...t.messages].sort(
        (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
      );
      const last = sorted[sorted.length - 1];
      const lastReadAt = threadState.get(channel, t.key).lastReadAt || 0;
      const lastInboundTime = t.lastInbound ? new Date(t.lastInbound.sent_at).getTime() : 0;
      const manuallyUnread = threadState.isManuallyUnread(channel, t.key);
      return {
        ...t,
        messages: sorted,
        lastMessage: last,
        unread: manuallyUnread || (lastInboundTime > lastReadAt && last?.direction === 'inbound'),
      };
    });
    arr.sort(
      (a, b) =>
        new Date(b.lastMessage.sent_at).getTime() -
        new Date(a.lastMessage.sent_at).getTime()
    );
    return arr;
  }, [logs, contacts, channel, threadState]);

  const filteredThreads = useMemo(() => {
    let list = threads;
    // Archive filtering
    if (filter === 'archived') {
      list = list.filter(t => threadState.isArchived(channel, t.key));
    } else {
      list = list.filter(t => !threadState.isArchived(channel, t.key));
      if (filter === 'unread') list = list.filter(t => t.unread);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(t => {
      const name = nameFor(t.contact, t.phone).toLowerCase();
      return name.includes(q) || t.phone.includes(q) || t.lastMessage.body?.toLowerCase().includes(q);
    });
  }, [threads, search, filter, threadState, channel]);

  // Auto-select first when channel changes
  useEffect(() => {
    if (!activeKey && filteredThreads.length > 0 && !isMobile) {
      setActiveKey(filteredThreads[0].key);
    }
  }, [filteredThreads, activeKey, isMobile]);

  // Reset when switching channels
  useEffect(() => {
    setActiveKey(null);
    setComposeBody('');
    setQuotedRef(null);
    setConvoSearch('');
    setShowConvoSearch(false);
    setPendingMedia([]);
    setScheduledFor('');
  }, [channel]);

  const active = useMemo(() => {
    if (showNewChat) return null;
    return threads.find(t => t.key === activeKey) || null;
  }, [threads, activeKey, showNewChat]);

  // Mark as read whenever the active thread changes or new messages land
  useEffect(() => {
    if (active) {
      threadState.markRead(channel, active.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.key, active?.messages.length, channel]);

  // Auto-scroll to bottom on new messages or thread switch
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [active?.messages.length, active?.key]);

  // Reset convo search & quoted ref when switching threads
  useEffect(() => {
    setConvoSearch('');
    setShowConvoSearch(false);
    setQuotedRef(null);
    setPendingMedia([]);
    setScheduledFor('');
  }, [active?.key]);

  const newChatResults = useMemo(() => {
    const q = newChatQuery.trim().toLowerCase();
    if (!q) return contacts.filter(c => c.phone).slice(0, 30);
    return contacts
      .filter(c => c.phone)
      .filter(c => {
        const n = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
        return n.includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q);
      })
      .slice(0, 50);
  }, [contacts, newChatQuery]);

  const handleSend = async () => {
    const body = composeBody.trim();
    if (!body && pendingMedia.length === 0) return;

    let to: string;
    let contactId: string | null = null;

    if (showNewChat) {
      to = newChatContact?.phone || newChatPhone;
      contactId = newChatContact?.id || null;
      if (!to) return;
    } else if (active) {
      to = active.phone;
      contactId = active.contact?.id || null;
    } else {
      return;
    }

    // 1) Upload media if any
    let mediaUrls: string[] = [];
    if (pendingMedia.length > 0) {
      try {
        mediaUrls = await uploadSmsMedia(pendingMedia);
      } catch (e: any) {
        toast.error(e?.message || 'Media upload failed');
        return;
      }
    }

    // 2) Prepend quoted reply marker if present (iMessage-style "> Original")
    let finalBody = body;
    if (quotedRef) {
      const quoteSnippet = quotedRef.body.length > 80
        ? quotedRef.body.slice(0, 80) + '…'
        : quotedRef.body;
      finalBody = `↪ "${quoteSnippet}"\n${body}`;
    }

    await sendSms.mutateAsync({
      to,
      body: finalBody,
      contact_id: contactId,
      channel,
      media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
      scheduled_for: scheduledFor || undefined,
    });

    setComposeBody('');
    setPendingMedia([]);
    setScheduledFor('');
    setQuotedRef(null);
    if (showNewChat) {
      setShowNewChat(false);
      setNewChatContact(null);
      setNewChatPhone('');
      setNewChatQuery('');
      setActiveKey(normalize(to) || to);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const startNewChat = () => {
    setShowNewChat(true);
    setActiveKey(null);
    setComposeBody('');
    setQuotedRef(null);
  };

  const pickNewChatContact = (c: CrmContact) => {
    setNewChatContact(c);
    setNewChatPhone(c.phone || '');
  };

  const channelTemplates = templates.filter(t => (t.channel || 'sms') === channel && t.is_active);

  const hasContactDetails = !!(active?.contact || (showNewChat && newChatContact));
  const showLeftPane = isMobile ? (!active && !showNewChat) : !leftCollapsed;
  const showCenterPane = !isMobile || active || showNewChat;
  const showRightPane = !isMobile && hasContactDetails && !rightCollapsed;

  const gridCols = !isMobile
    ? [showLeftPane ? '340px' : null, '1fr', showRightPane ? '320px' : null]
        .filter(Boolean)
        .join('_')
    : null;

  // Filter messages by in-thread search
  const visibleMessages = useMemo(() => {
    if (!active) return [];
    const q = convoSearch.trim().toLowerCase();
    if (!q) return active.messages;
    return active.messages.filter(m => m.body?.toLowerCase().includes(q));
  }, [active, convoSearch]);

  // ============== Render ==============

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[620px] rounded-2xl overflow-hidden border border-border bg-background shadow-sm">
      <div
        className="grid h-full grid-cols-1"
        style={!isMobile ? { gridTemplateColumns: gridCols!.replace(/_/g, ' ') } : undefined}
      >
        {/* ============ LEFT PANE: Threads ============ */}
        {showLeftPane && (
          <div className="flex flex-col border-r border-border bg-muted/20 min-h-0">
            <div className="px-4 pt-4 pb-3 border-b border-border bg-background/60 backdrop-blur">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[17px] font-semibold tracking-tight">Messages</h2>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary"
                  onClick={startNewChat}
                  title="New conversation"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Channel switcher */}
              <div className="inline-flex w-full items-center rounded-lg bg-muted p-0.5 mb-3">
                <button
                  onClick={() => onChannelChange('sms')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all',
                    channel === 'sms'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  iMessage / SMS
                </button>
                <button
                  onClick={() => onChannelChange('whatsapp')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all',
                    channel === 'whatsapp'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  WhatsApp
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  className="h-9 pl-9 text-sm rounded-xl bg-muted/40 border-transparent focus-visible:bg-background"
                />
              </div>

              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
                  All
                </FilterChip>
                <FilterChip active={filter === 'unread'} onClick={() => setFilter('unread')}>
                  Unread
                  {threads.filter(t => t.unread && !threadState.isArchived(channel, t.key)).length > 0 && (
                    <span className="ml-1 text-[10px] font-bold text-primary">
                      {threads.filter(t => t.unread && !threadState.isArchived(channel, t.key)).length}
                    </span>
                  )}
                </FilterChip>
                <FilterChip active={filter === 'archived'} onClick={() => setFilter('archived')}>
                  <Archive className="w-2.5 h-2.5 inline-block mr-0.5" /> Archived
                </FilterChip>
              </div>
            </div>

            {/* Thread list */}
            <ScrollArea className="flex-1">
              {filteredThreads.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  {filter === 'archived'
                    ? 'No archived conversations.'
                    : search
                      ? 'No matches'
                      : `No ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} conversations yet.`}
                  {filter !== 'archived' && (
                    <div className="mt-3">
                      <Button size="sm" variant="outline" onClick={startNewChat}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> New conversation
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                (() => {
                  const pinnedThreads = filteredThreads.filter(t => isPinned(channel, t.key));
                  const otherThreads = filteredThreads.filter(t => !isPinned(channel, t.key));
                  return (
                    <div className="px-2 py-2 space-y-0.5">
                      {pinnedThreads.length > 0 && (
                        <>
                          <div className="px-2.5 pt-1 pb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                            <Pin className="w-2.5 h-2.5" /> Pinned
                          </div>
                          {pinnedThreads.map(t => (
                            <ThreadRow
                              key={t.key}
                              thread={t}
                              active={activeKey === t.key && !showNewChat}
                              pinned
                              muted={threadState.isMuted(channel, t.key)}
                              archived={threadState.isArchived(channel, t.key)}
                              onClick={() => {
                                setShowNewChat(false);
                                setActiveKey(t.key);
                              }}
                              onTogglePin={() => togglePin(channel, t.key)}
                              onToggleMute={() => threadState.toggleMute(channel, t.key)}
                              onToggleArchive={() => {
                                threadState.toggleArchive(channel, t.key);
                                if (activeKey === t.key) setActiveKey(null);
                              }}
                              onMarkUnread={() => threadState.markUnread(channel, t.key)}
                              onDelete={() => setConfirmDelete({ key: t.key, name: nameFor(t.contact, t.phone) })}
                            />
                          ))}
                          {otherThreads.length > 0 && (
                            <div className="px-2.5 pt-3 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                              {filter === 'archived' ? 'Archived' : 'All Messages'}
                            </div>
                          )}
                        </>
                      )}
                      {otherThreads.map(t => (
                        <ThreadRow
                          key={t.key}
                          thread={t}
                          active={activeKey === t.key && !showNewChat}
                          pinned={false}
                          muted={threadState.isMuted(channel, t.key)}
                          archived={threadState.isArchived(channel, t.key)}
                          onClick={() => {
                            setShowNewChat(false);
                            setActiveKey(t.key);
                          }}
                          onTogglePin={() => togglePin(channel, t.key)}
                          onToggleMute={() => threadState.toggleMute(channel, t.key)}
                          onToggleArchive={() => {
                            threadState.toggleArchive(channel, t.key);
                            if (activeKey === t.key) setActiveKey(null);
                          }}
                          onMarkUnread={() => threadState.markUnread(channel, t.key)}
                          onDelete={() => setConfirmDelete({ key: t.key, name: nameFor(t.contact, t.phone) })}
                        />
                      ))}
                    </div>
                  );
                })()
              )}
            </ScrollArea>
          </div>
        )}

        {/* ============ CENTER PANE: Conversation ============ */}
        {showCenterPane && (
          <div className="flex flex-col min-h-0 bg-background">
            {showNewChat ? (
              <NewChatPane
                onBack={() => setShowNewChat(false)}
                contact={newChatContact}
                phone={newChatPhone}
                onPhoneChange={setNewChatPhone}
                onClearContact={() => {
                  setNewChatContact(null);
                  setNewChatPhone('');
                }}
                results={newChatResults}
                query={newChatQuery}
                onQueryChange={setNewChatQuery}
                onPick={pickNewChatContact}
                channel={channel}
                composeBody={composeBody}
                onComposeChange={setComposeBody}
                onSend={handleSend}
                onKeyDown={onKeyDown}
                sending={sendSms.isPending}
                templates={channelTemplates}
                pendingMedia={pendingMedia}
                onMediaChange={setPendingMedia}
                scheduledFor={scheduledFor}
                onScheduledChange={setScheduledFor}
                quotedRef={null}
                onClearQuote={() => {}}
              />
            ) : active ? (
              <>
                {/* Conversation header — iMessage centered avatar+name */}
                <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-2 bg-background/95 backdrop-blur relative">
                  {/* Left controls */}
                  <div className="flex items-center gap-1 absolute left-3 top-1/2 -translate-y-1/2 z-10">
                    {isMobile && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-full"
                        onClick={() => setActiveKey(null)}
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </Button>
                    )}
                    {!isMobile && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                              onClick={() => setLeftCollapsed(v => !v)}
                            >
                              {leftCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{leftCollapsed ? 'Show conversations' : 'Hide conversations'}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>

                  {/* Centered avatar + name */}
                  <button
                    onClick={() => active.contact && navigate(`/crm/leads/${active.contact.id}`)}
                    className="mx-auto flex flex-col items-center gap-0.5 group/header max-w-[60%]"
                    disabled={!active.contact}
                  >
                    <Avatar className="h-9 w-9 ring-1 ring-border">
                      <AvatarFallback
                        className={cn(
                          'text-[11px] font-semibold',
                          channel === 'whatsapp'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-primary/15 text-primary',
                        )}
                      >
                        {initialsFor(active.contact, active.phone)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex items-center gap-1 text-[12px] font-semibold text-foreground/90 group-hover/header:text-primary transition-colors">
                      <span className="truncate max-w-[180px]">{nameFor(active.contact, active.phone)}</span>
                      {threadState.isMuted(channel, active.key) && (
                        <BellOff className="w-2.5 h-2.5 text-muted-foreground" />
                      )}
                      {channel === 'whatsapp' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      )}
                      {active.contact && (
                        <ChevronRight className="w-3 h-3 text-muted-foreground/60" />
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                              'h-8 w-8 rounded-full text-muted-foreground hover:text-foreground',
                              showConvoSearch && 'bg-primary/10 text-primary',
                            )}
                            onClick={() => setShowConvoSearch(v => !v)}
                          >
                            <Search className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Search in conversation</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
                            <Phone className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Call</TooltipContent>
                      </Tooltip>
                      {active.contact && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                              onClick={() => navigate(`/crm/leads/${active.contact!.id}`)}
                            >
                              <Info className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Open lead</TooltipContent>
                        </Tooltip>
                      )}
                      {!isMobile && hasContactDetails && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                              onClick={() => setRightCollapsed(v => !v)}
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
                            icon={threadState.isMuted(channel, active.key) ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                            onClick={() => threadState.toggleMute(channel, active.key)}
                          >
                            {threadState.isMuted(channel, active.key) ? 'Unmute' : 'Mute notifications'}
                          </PopoverMenuItem>
                          <PopoverMenuItem
                            icon={threadState.isArchived(channel, active.key) ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                            onClick={() => {
                              threadState.toggleArchive(channel, active.key);
                              setActiveKey(null);
                            }}
                          >
                            {threadState.isArchived(channel, active.key) ? 'Unarchive' : 'Archive'}
                          </PopoverMenuItem>
                          <PopoverMenuItem
                            icon={<Mail className="w-3.5 h-3.5" />}
                            onClick={() => threadState.markUnread(channel, active.key)}
                          >
                            Mark as unread
                          </PopoverMenuItem>
                          <div className="my-1 border-t border-border" />
                          <PopoverMenuItem
                            icon={<Trash2 className="w-3.5 h-3.5" />}
                            destructive
                            onClick={() => setConfirmDelete({ key: active.key, name: nameFor(active.contact, active.phone) })}
                          >
                            Delete conversation
                          </PopoverMenuItem>
                        </PopoverContent>
                      </Popover>
                    </TooltipProvider>
                  </div>
                </div>

                {/* In-conversation search bar */}
                {showConvoSearch && (
                  <div className="px-5 py-2 border-b border-border bg-muted/20 flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <Input
                      autoFocus
                      value={convoSearch}
                      onChange={(e) => setConvoSearch(e.target.value)}
                      placeholder="Find in conversation…"
                      className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-0"
                    />
                    {convoSearch && (
                      <span className="text-[10.5px] text-muted-foreground whitespace-nowrap">
                        {visibleMessages.length} match{visibleMessages.length === 1 ? '' : 'es'}
                      </span>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => { setShowConvoSearch(false); setConvoSearch(''); }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}

                {/* Messages */}
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 bg-gradient-to-b from-muted/10 to-background"
                >
                  <MessageList
                    messages={visibleMessages}
                    channel={channel}
                    highlight={convoSearch.trim()}
                    threadState={threadState}
                    onReply={(m) => setQuotedRef({ id: m.id, body: m.body, direction: m.direction })}
                    onDeleteMessage={(id) => deleteMessage.mutate(id)}
                  />
                </div>

                {/* Composer */}
                <Composer
                  value={composeBody}
                  onChange={setComposeBody}
                  onSend={handleSend}
                  onKeyDown={onKeyDown}
                  sending={sendSms.isPending}
                  channel={channel}
                  templates={channelTemplates}
                  pendingMedia={pendingMedia}
                  onMediaChange={setPendingMedia}
                  scheduledFor={scheduledFor}
                  onScheduledChange={setScheduledFor}
                  quotedRef={quotedRef}
                  onClearQuote={() => setQuotedRef(null)}
                />
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-gradient-to-b from-background to-muted/20">
                <div
                  className={cn(
                    'w-20 h-20 rounded-3xl flex items-center justify-center mb-5',
                    channel === 'whatsapp' ? 'bg-emerald-500/10' : 'bg-primary/10',
                  )}
                >
                  <MessageSquare
                    className={cn(
                      'w-10 h-10',
                      channel === 'whatsapp' ? 'text-emerald-500' : 'text-primary',
                    )}
                  />
                </div>
                <h3 className="text-[17px] font-semibold tracking-tight mb-1.5">
                  {channel === 'whatsapp' ? 'WhatsApp Messages' : 'Your Messages'}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                  Select a conversation from the sidebar, or start a new one to send a message to any of your leads.
                </p>
                <Button onClick={startNewChat} className="gap-1.5">
                  <Plus className="w-4 h-4" /> New conversation
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ============ RIGHT PANE: Contact details ============ */}
        {showRightPane && (active?.contact || (showNewChat && newChatContact)) && (
          <ContactDetailsPane
            contact={(active?.contact || newChatContact)!}
            messageCount={active?.messages.length || 0}
            channel={channel}
            onOpenLead={(id) => navigate(`/crm/leads/${id}`)}
          />
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation with {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes every {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} message exchanged
              with this contact from your records. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDelete) return;
                deleteConversation.mutate(
                  { phoneLast10: confirmDelete.key, channel },
                  {
                    onSuccess: () => {
                      if (activeKey === confirmDelete.key) setActiveKey(null);
                      setConfirmDelete(null);
                    },
                  },
                );
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============== Filter chip ==============
function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors inline-flex items-center',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function PopoverMenuItem({
  icon, children, onClick, destructive,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs hover:bg-muted text-left',
        destructive && 'text-destructive hover:bg-destructive/10',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ============== Thread row ==============
function ThreadRow({
  thread, active, pinned, muted, archived, onClick, onTogglePin,
  onToggleMute, onToggleArchive, onMarkUnread, onDelete,
}: {
  thread: Thread;
  active: boolean;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  onClick: () => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
}) {
  const last = thread.lastMessage;
  const lastDate = new Date(last.sent_at);
  const preview = last.direction === 'outbound' ? `You: ${last.body}` : last.body;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            'group relative w-full text-left px-2.5 py-2.5 rounded-xl flex gap-2.5 transition-colors',
            active ? 'bg-primary/10' : 'hover:bg-muted/60',
            archived && 'opacity-70',
          )}
        >
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback
              className={cn(
                'text-[11px] font-semibold',
                thread.channel === 'whatsapp'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-primary/15 text-primary',
              )}
            >
              {initialsFor(thread.contact, thread.phone)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <div className="flex items-center gap-1 min-w-0">
                {pinned && (
                  <Pin className="w-2.5 h-2.5 text-primary shrink-0 fill-primary" />
                )}
                {muted && (
                  <BellOff className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                )}
                <span
                  className={cn(
                    'text-[13.5px] truncate',
                    thread.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
                  )}
                >
                  {nameFor(thread.contact, thread.phone)}
                </span>
              </div>
              <span
                className={cn(
                  'text-[10.5px] shrink-0',
                  thread.unread && !muted ? 'text-primary font-semibold' : 'text-muted-foreground',
                )}
              >
                {formatThreadTime(lastDate)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'text-[12px] truncate',
                  thread.unread ? 'text-foreground/80' : 'text-muted-foreground',
                )}
              >
                {preview}
              </span>
              {thread.unread && !muted && (
                <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
              )}
            </div>
          </div>

          {/* Hover pin shortcut */}
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={cn(
              'absolute top-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center transition-opacity',
              'hover:bg-background/80 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100',
            )}
            title={pinned ? 'Unpin' : 'Pin'}
          >
            {pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={onTogglePin} className="gap-2">
          {pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          {pinned ? 'Unpin conversation' : 'Pin conversation'}
        </ContextMenuItem>
        <ContextMenuItem onClick={onMarkUnread} className="gap-2">
          <Mail className="w-3.5 h-3.5" />
          Mark as unread
        </ContextMenuItem>
        <ContextMenuItem onClick={onToggleMute} className="gap-2">
          {muted ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          {muted ? 'Unmute' : 'Mute notifications'}
        </ContextMenuItem>
        <ContextMenuItem onClick={onToggleArchive} className="gap-2">
          {archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
          {archived ? 'Unarchive' : 'Archive conversation'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
          <Trash2 className="w-3.5 h-3.5" />
          Delete conversation
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ============== Highlight matched text ==============
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${safe})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-300/60 dark:bg-yellow-500/40 text-foreground rounded px-0.5">{p}</mark>
          : <span key={i}>{p}</span>,
      )}
    </>
  );
}

// ============== Message list ==============
function MessageList({
  messages, channel, highlight, threadState, onReply, onDeleteMessage,
}: {
  messages: SmsLogRow[];
  channel: MessagingChannel;
  highlight: string;
  threadState: ReturnType<typeof useThreadState>;
  onReply: (m: SmsLogRow) => void;
  onDeleteMessage: (id: string) => void;
}) {
  if (messages.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground py-12">
        {highlight ? `No matches for "${highlight}"` : 'No messages yet — say hi 👋'}
      </div>
    );
  }

  return (
    <div className="space-y-1 max-w-3xl mx-auto">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const date = new Date(m.sent_at);
        const showTimestamp =
          !prev || differenceInMinutes(date, new Date(prev.sent_at)) > 15;
        const isOutbound = m.direction === 'outbound';
        const sameSenderAsNext =
          next && next.direction === m.direction &&
          differenceInMinutes(new Date(next.sent_at), date) < 2;
        const sameSenderAsPrev =
          prev && prev.direction === m.direction &&
          differenceInMinutes(date, new Date(prev.sent_at)) < 2;

        const reaction = threadState.getReaction(m.id);
        const isOptimistic = m.id.startsWith('optimistic-');
        const isScheduled = m.status === 'scheduled';

        // Render quoted reply if body starts with "↪ "..."\n"
        const quoteMatch = m.body?.match(/^↪ "([^"]+)"\n([\s\S]*)$/);
        const quoteText = quoteMatch?.[1];
        const bodyText = quoteMatch ? quoteMatch[2] : m.body;

        return (
          <div key={m.id}>
            {showTimestamp && (
              <div className="text-center text-[10.5px] text-muted-foreground py-3 font-medium">
                {format(date, isToday(date) ? "'Today' h:mm a" : isYesterday(date) ? "'Yesterday' h:mm a" : 'MMM d, h:mm a')}
              </div>
            )}
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <div className={cn('flex group', isOutbound ? 'justify-end' : 'justify-start')}>
                  <div className="relative max-w-[75%] sm:max-w-[65%]">
                    <div
                      className={cn(
                        'px-3.5 py-2 text-[14.5px] leading-snug shadow-sm transition-opacity',
                        isOutbound
                          ? channel === 'whatsapp'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground',
                        isOutbound
                          ? cn('rounded-2xl', sameSenderAsPrev && 'rounded-tr-md', sameSenderAsNext && 'rounded-br-md')
                          : cn('rounded-2xl', sameSenderAsPrev && 'rounded-tl-md', sameSenderAsNext && 'rounded-bl-md'),
                        (isOptimistic || isScheduled) && 'opacity-70',
                      )}
                    >
                      {/* Quoted reply preview inside bubble */}
                      {quoteText && (
                        <div className={cn(
                          'mb-1.5 pl-2 border-l-2 text-[12px] italic line-clamp-2',
                          isOutbound ? 'border-white/40 text-white/80' : 'border-foreground/30 text-foreground/70',
                        )}>
                          {quoteText}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words">
                        <HighlightedText text={bodyText} query={highlight} />
                      </div>
                      {m.media_urls?.length > 0 && (
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
                                key={idx}
                                href={u}
                                target="_blank"
                                rel="noreferrer"
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

                    {/* Reaction badge on the bubble */}
                    {reaction && (
                      <div
                        className={cn(
                          'absolute -bottom-2 px-1.5 py-0.5 rounded-full bg-background border border-border shadow-sm text-[12px] cursor-pointer',
                          isOutbound ? '-left-1' : '-right-1',
                        )}
                        onClick={() => threadState.setReaction(m.id, null)}
                        title="Click to remove"
                      >
                        {reaction}
                      </div>
                    )}

                    {/* Hover quick-react popover */}
                    <div
                      className={cn(
                        'absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity',
                        isOutbound ? '-left-9' : '-right-9',
                      )}
                    >
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full bg-background border border-border">
                            <Smile className="w-3.5 h-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="center" className="w-auto p-1.5">
                          <div className="flex gap-0.5">
                            {REACTION_EMOJIS.map(e => (
                              <button
                                key={e}
                                onClick={() => threadState.setReaction(m.id, e === reaction ? null : e)}
                                className={cn(
                                  'h-8 w-8 rounded-full hover:bg-muted text-base transition-colors',
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
                <ContextMenuItem
                  onClick={() => navigator.clipboard.writeText(m.body)}
                  className="gap-2"
                >
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

            {/* Status under last bubble in group */}
            {isOutbound && !sameSenderAsNext && (
              <div className="flex justify-end mt-0.5 mr-1">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <StatusIcon status={m.status} />
                  {statusLabel(m.status, m.scheduled_for)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function statusLabel(status: string, scheduledFor?: string | null) {
  if (status === 'scheduled' && scheduledFor) {
    const d = new Date(scheduledFor);
    return `Scheduled · ${formatDistanceToNow(d, { addSuffix: true })}`;
  }
  if (!status) return '';
  if (status === 'delivered' || status === 'read') return 'Delivered';
  if (status === 'sent') return 'Sent';
  if (status === 'queued' || status === 'sending' || status === 'pending') return 'Sending…';
  if (status === 'failed' || status === 'undelivered') return 'Failed';
  return status;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'scheduled') return <CalendarIcon className="w-3 h-3 text-blue-500" />;
  if (status === 'delivered' || status === 'read') return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
  if (status === 'failed' || status === 'undelivered') return <AlertCircle className="w-3 h-3 text-destructive" />;
  if (status === 'queued' || status === 'sending' || status === 'pending') return <Clock className="w-3 h-3" />;
  return <CheckCircle2 className="w-3 h-3 text-muted-foreground/60" />;
}

// ============== Composer ==============
function Composer({
  value, onChange, onSend, onKeyDown, sending, channel, templates,
  pendingMedia, onMediaChange, scheduledFor, onScheduledChange,
  quotedRef, onClearQuote,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  sending: boolean;
  channel: MessagingChannel;
  templates: any[];
  pendingMedia: File[];
  onMediaChange: (f: File[]) => void;
  scheduledFor: string;
  onScheduledChange: (v: string) => void;
  quotedRef: QuotedRef | null;
  onClearQuote: () => void;
}) {
  const seg = smsSegments(value);
  const canSend = (value.trim().length > 0 || pendingMedia.length > 0) && !sending;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Default scheduled value = now + 1h, rounded to next 15min
  const defaultScheduled = useMemo(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return d.toISOString().slice(0, 16); // datetime-local format
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

  const removeMedia = (idx: number) => {
    onMediaChange(pendingMedia.filter((_, i) => i !== idx));
  };

  return (
    <div className="border-t border-border bg-background px-3 sm:px-4 py-3">
      <div className="max-w-3xl mx-auto space-y-2">
        {/* Quoted reply preview */}
        {quotedRef && (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-muted/50 border-l-2 border-primary">
            <Reply className="w-3 h-3 text-primary shrink-0" />
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

        {/* Pending attachments preview */}
        {pendingMedia.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg bg-muted/40 border border-dashed border-border">
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
                    onClick={() => removeMedia(idx)}
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

        {/* Scheduled preview */}
        {scheduledFor && (
          <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-400">
            <CalendarIcon className="w-3 h-3" />
            <span className="flex-1">
              Sending {format(new Date(scheduledFor), "MMM d 'at' h:mm a")} ({formatDistanceToNow(new Date(scheduledFor), { addSuffix: true })})
            </span>
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => onScheduledChange('')}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/30 focus-within:border-primary/40 focus-within:bg-background transition-colors px-3 py-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,application/pdf"
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />

          {/* Templates */}
          {templates.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 rounded-full shrink-0 text-muted-foreground hover:text-primary"
                  title="Insert template"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                  Templates
                </div>
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
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-full shrink-0 text-muted-foreground hover:text-primary"
            title="Attach photo or file"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-3.5 h-3.5" />
          </Button>

          {/* Schedule */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  'h-7 w-7 rounded-full shrink-0',
                  scheduledFor ? 'text-blue-600' : 'text-muted-foreground hover:text-primary',
                )}
                title="Schedule send"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3 space-y-2">
              <div className="text-xs font-semibold">Schedule send</div>
              <p className="text-[11px] text-muted-foreground">
                The message will be queued and delivered at the chosen time.
              </p>
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

          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={channel === 'whatsapp' ? 'WhatsApp message…' : 'iMessage'}
            rows={1}
            className="flex-1 min-h-[36px] max-h-40 resize-none border-0 bg-transparent px-1 py-1.5 text-[14.5px] focus-visible:ring-0 focus-visible:border-0 shadow-none"
            style={{ height: 'auto' }}
          />

          <Button
            size="icon"
            onClick={onSend}
            disabled={!canSend}
            className={cn(
              'h-8 w-8 rounded-full shrink-0 transition-all',
              canSend
                ? channel === 'whatsapp'
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-primary hover:bg-primary/90'
                : 'opacity-40',
            )}
          >
            {scheduledFor ? <CalendarIcon className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </div>

        <div className="flex items-center justify-between mt-1.5 px-2 text-[10.5px] text-muted-foreground">
          <span>
            {channel === 'whatsapp'
              ? 'WhatsApp Business · via Twilio'
              : `${seg.count} segment${seg.count > 1 ? 's' : ''} · ${seg.chars} chars${pendingMedia.length > 0 ? ' · MMS' : ''}`}
          </span>
          <span className="opacity-70">⌘ + ↵ to send</span>
        </div>
      </div>
    </div>
  );
}

// ============== New chat pane ==============
function NewChatPane({
  onBack, contact, phone, onPhoneChange, onClearContact,
  results, query, onQueryChange, onPick,
  channel, composeBody, onComposeChange, onSend, onKeyDown, sending, templates,
  pendingMedia, onMediaChange, scheduledFor, onScheduledChange, quotedRef, onClearQuote,
}: {
  onBack: () => void;
  contact: CrmContact | null;
  phone: string;
  onPhoneChange: (v: string) => void;
  onClearContact: () => void;
  results: CrmContact[];
  query: string;
  onQueryChange: (v: string) => void;
  onPick: (c: CrmContact) => void;
  channel: MessagingChannel;
  composeBody: string;
  onComposeChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  sending: boolean;
  templates: any[];
  pendingMedia: File[];
  onMediaChange: (f: File[]) => void;
  scheduledFor: string;
  onScheduledChange: (v: string) => void;
  quotedRef: QuotedRef | null;
  onClearQuote: () => void;
}) {
  return (
    <>
      <div className="px-4 py-3 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex items-center gap-2 mb-2.5">
          <Button size="icon" variant="ghost" className="h-8 w-8 -ml-1" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-[13px] font-semibold">New {channel === 'whatsapp' ? 'WhatsApp' : 'iMessage'}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground shrink-0">To:</span>
          {contact ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary text-[12.5px] font-medium">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[9px] bg-primary/20 text-primary">
                  {initialsFor(contact, contact.phone || '')}
                </AvatarFallback>
              </Avatar>
              {nameFor(contact, contact.phone || '')}
              <button onClick={onClearContact} className="ml-0.5 hover:bg-primary/20 rounded-full p-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <Input
              value={query || phone}
              onChange={(e) => {
                const v = e.target.value;
                onQueryChange(v);
                if (/^[\d+\s\-()]+$/.test(v)) onPhoneChange(v);
              }}
              placeholder="Search contacts or type a number"
              className="h-8 text-sm border-0 bg-transparent focus-visible:ring-0 shadow-none px-1 flex-1"
              autoFocus
            />
          )}
        </div>
      </div>

      {!contact ? (
        <ScrollArea className="flex-1 bg-muted/10">
          <div className="p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2">
              {query ? `${results.length} contact${results.length === 1 ? '' : 's'}` : 'Suggested'}
            </div>
            {results.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8">
                No contacts match.
                {phone && (
                  <div className="mt-3 text-foreground">
                    Send to <span className="font-mono">{phone}</span> directly using the composer below.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                {results.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onPick(c)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-muted/60 text-left transition-colors"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-[11px] bg-primary/15 text-primary font-semibold">
                        {initialsFor(c, c.phone || '')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium truncate">
                        {nameFor(c, c.phone || '')}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">{c.phone}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center bg-gradient-to-b from-muted/10 to-background px-8">
          <div>
            <Avatar className="h-16 w-16 mx-auto mb-3">
              <AvatarFallback className="text-base bg-primary/15 text-primary font-semibold">
                {initialsFor(contact, contact.phone || '')}
              </AvatarFallback>
            </Avatar>
            <div className="text-[15px] font-semibold">{nameFor(contact, contact.phone || '')}</div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">{contact.phone}</div>
            <div className="text-xs text-muted-foreground mt-4 max-w-xs">
              Type your message below to start the conversation.
            </div>
          </div>
        </div>
      )}

      <Composer
        value={composeBody}
        onChange={onComposeChange}
        onSend={onSend}
        onKeyDown={onKeyDown}
        sending={sending}
        channel={channel}
        templates={templates}
        pendingMedia={pendingMedia}
        onMediaChange={onMediaChange}
        scheduledFor={scheduledFor}
        onScheduledChange={onScheduledChange}
        quotedRef={quotedRef}
        onClearQuote={onClearQuote}
      />
    </>
  );
}

// ============== Right pane: contact details ==============
function ContactDetailsPane({
  contact, messageCount, channel, onOpenLead,
}: {
  contact: CrmContact;
  messageCount: number;
  channel: MessagingChannel;
  onOpenLead: (id: string) => void;
}) {
  return (
    <div className="border-l border-border bg-muted/10 flex flex-col min-h-0">
      <ScrollArea className="flex-1">
        <div className="p-5">
          <div className="flex flex-col items-center text-center mb-5">
            <Avatar className="h-16 w-16 mb-3">
              <AvatarFallback
                className={cn(
                  'text-base font-semibold',
                  channel === 'whatsapp'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-primary/15 text-primary',
                )}
              >
                {initialsFor(contact, contact.phone || '')}
              </AvatarFallback>
            </Avatar>
            <div className="text-[15px] font-semibold">
              {nameFor(contact, contact.phone || '')}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {contact.phone}
            </div>
            {contact.email && (
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-full">
                {contact.email}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-5">
            <div className="rounded-xl bg-background border border-border p-2.5 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Messages</div>
              <div className="text-base font-semibold mt-0.5">{messageCount}</div>
            </div>
            <div className="rounded-xl bg-background border border-border p-2.5 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</div>
              <div className="text-[11px] font-semibold mt-1 truncate">
                {contact.status || '—'}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <DetailRow label="Source" value={contact.source} />
            <DetailRow label="Type" value={contact.lead_type} />
            <DetailRow label="Assigned to" value={contact.assigned_to} />
            <DetailRow label="City" value={(contact as any).city} />
            {contact.tags && contact.tags.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  Tags
                </div>
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((t: string) => (
                    <Badge key={t} variant="outline" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button
            className="w-full mt-5 gap-1.5"
            variant="outline"
            size="sm"
            onClick={() => onOpenLead(contact.id)}
          >
            Open lead
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-center text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground truncate max-w-[60%] text-right">{value}</span>
    </div>
  );
}
