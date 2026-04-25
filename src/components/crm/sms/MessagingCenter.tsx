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
} from '@/components/ui/context-menu';
import {
  Search, Send, Plus, MoreHorizontal, Phone, Video, Info, Smile,
  Paperclip, Image as ImageIcon, Sparkles, ArrowLeft, MessageSquare,
  CheckCircle2, Clock, AlertCircle, X, ChevronRight,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Pin, PinOff, Mail, BellOff, Trash2,
} from 'lucide-react';
import { format, formatDistanceToNow, isToday, isYesterday, differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  useAllSmsLog, useSendSms, useSmsTemplates, smsSegments,
  type MessagingChannel, type SmsLogRow,
} from '@/hooks/useSms';
import { useCrmContacts, type CrmContact } from '@/hooks/useCrmContacts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useThreadPins } from '@/hooks/useThreadPins';

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
  const { data: logs = [] } = useAllSmsLog({ limit: 1000 });
  const { data: contacts = [] } = useCrmContacts();
  const { data: templates = [] } = useSmsTemplates();
  const sendSms = useSendSms();

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState('');
  const [newChatContact, setNewChatContact] = useState<CrmContact | null>(null);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

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
          key,
          phone,
          contact,
          messages: [],
          lastInbound: null,
          lastMessage: l,
          unread: false,
          channel,
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
      return {
        ...t,
        messages: sorted,
        lastMessage: last,
        unread: !!t.lastInbound && last?.direction === 'inbound',
      };
    });
    arr.sort(
      (a, b) =>
        new Date(b.lastMessage.sent_at).getTime() -
        new Date(a.lastMessage.sent_at).getTime()
    );
    return arr;
  }, [logs, contacts, channel]);

  const filteredThreads = useMemo(() => {
    let list = threads;
    if (filter === 'unread') list = list.filter(t => t.unread);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(t => {
      const name = nameFor(t.contact, t.phone).toLowerCase();
      return name.includes(q) || t.phone.includes(q) || t.lastMessage.body?.toLowerCase().includes(q);
    });
  }, [threads, search, filter]);

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
  }, [channel]);

  const active = useMemo(() => {
    if (showNewChat) return null;
    return threads.find(t => t.key === activeKey) || null;
  }, [threads, activeKey, showNewChat]);

  // Auto-scroll to bottom on new messages or thread switch
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [active?.messages.length, active?.key]);

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
    if (!body) return;

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

    await sendSms.mutateAsync({
      to,
      body,
      contact_id: contactId,
      channel,
    });

    setComposeBody('');
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

  // Build dynamic grid template based on which panes are visible
  const gridCols = !isMobile
    ? [showLeftPane ? '340px' : null, '1fr', showRightPane ? '320px' : null]
        .filter(Boolean)
        .join('_')
    : null;

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
            {/* Header */}
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

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  className="h-9 pl-9 text-sm rounded-xl bg-muted/40 border-transparent focus-visible:bg-background"
                />
              </div>

              {/* Filter chips */}
              <div className="flex items-center gap-1.5 mt-2.5">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
                  All
                </FilterChip>
                <FilterChip active={filter === 'unread'} onClick={() => setFilter('unread')}>
                  Unread
                  {threads.filter(t => t.unread).length > 0 && (
                    <span className="ml-1 text-[10px] font-bold text-primary">
                      {threads.filter(t => t.unread).length}
                    </span>
                  )}
                </FilterChip>
              </div>
            </div>

            {/* Thread list */}
            <ScrollArea className="flex-1">
              {filteredThreads.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  {search ? 'No matches' : `No ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} conversations yet.`}
                  <div className="mt-3">
                    <Button size="sm" variant="outline" onClick={startNewChat}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> New conversation
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="px-2 py-2 space-y-0.5">
                  {filteredThreads.map(t => (
                    <ThreadRow
                      key={t.key}
                      thread={t}
                      active={activeKey === t.key && !showNewChat}
                      onClick={() => {
                        setShowNewChat(false);
                        setActiveKey(t.key);
                      }}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* ============ CENTER PANE: Conversation ============ */}
        {showCenterPane && (
          <div className="flex flex-col min-h-0 bg-background">
            {showNewChat ? (
              /* NEW CHAT MODE */
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
              />
            ) : active ? (
              /* ACTIVE CONVERSATION */
              <>
                {/* Conversation header */}
                <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 bg-background/80 backdrop-blur">
                  <div className="flex items-center gap-2 min-w-0">
                    {isMobile && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 -ml-2"
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
                              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground -ml-1"
                              onClick={() => setLeftCollapsed(v => !v)}
                            >
                              {leftCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{leftCollapsed ? 'Show conversations' : 'Hide conversations'}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <Avatar className="h-9 w-9 ring-2 ring-background ml-1">
                      <AvatarFallback
                        className={cn(
                          'text-xs font-semibold',
                          channel === 'whatsapp'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-primary/15 text-primary',
                        )}
                      >
                        {initialsFor(active.contact, active.phone)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold truncate flex items-center gap-1.5">
                        {nameFor(active.contact, active.phone)}
                        {channel === 'whatsapp' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {active.phone}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <TooltipProvider>
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
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Messages */}
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 bg-gradient-to-b from-muted/10 to-background"
                >
                  <MessageList messages={active.messages} channel={channel} />
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
                />
              </>
            ) : (
              /* EMPTY STATE */
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
        'px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

// ============== Thread row ==============
function ThreadRow({
  thread, active, onClick,
}: { thread: Thread; active: boolean; onClick: () => void }) {
  const last = thread.lastMessage;
  const lastDate = new Date(last.sent_at);
  const preview = last.direction === 'outbound' ? `You: ${last.body}` : last.body;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-2.5 py-2.5 rounded-xl flex gap-2.5 transition-colors',
        active
          ? 'bg-primary/10'
          : 'hover:bg-muted/60',
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
          <span
            className={cn(
              'text-[13.5px] truncate',
              thread.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
            )}
          >
            {nameFor(thread.contact, thread.phone)}
          </span>
          <span
            className={cn(
              'text-[10.5px] shrink-0',
              thread.unread ? 'text-primary font-semibold' : 'text-muted-foreground',
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
          {thread.unread && (
            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
          )}
        </div>
      </div>
    </button>
  );
}

// ============== Message list with timestamps & grouping ==============
function MessageList({ messages, channel }: { messages: SmsLogRow[]; channel: MessagingChannel }) {
  if (messages.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground py-12">
        No messages yet — say hi 👋
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

        return (
          <div key={m.id}>
            {showTimestamp && (
              <div className="text-center text-[10.5px] text-muted-foreground py-3 font-medium">
                {format(date, isToday(date) ? "'Today' h:mm a" : isYesterday(date) ? "'Yesterday' h:mm a" : 'MMM d, h:mm a')}
              </div>
            )}
            <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[75%] sm:max-w-[65%] px-3.5 py-2 text-[14.5px] leading-snug shadow-sm',
                  // bubble corners — iMessage tail logic
                  isOutbound
                    ? channel === 'whatsapp'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground',
                  // rounding based on grouping
                  isOutbound
                    ? cn(
                        'rounded-2xl',
                        sameSenderAsPrev && 'rounded-tr-md',
                        sameSenderAsNext && 'rounded-br-md',
                      )
                    : cn(
                        'rounded-2xl',
                        sameSenderAsPrev && 'rounded-tl-md',
                        sameSenderAsNext && 'rounded-bl-md',
                      ),
                )}
              >
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                {m.media_urls?.length > 0 && (
                  <div className="mt-1.5 grid grid-cols-2 gap-1">
                    {m.media_urls.map((u: string, idx: number) => (
                      <img key={idx} src={u} className="rounded-lg max-h-40 object-cover" alt="" />
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Read receipt / status under the LAST outbound bubble in a group */}
            {isOutbound && !sameSenderAsNext && (
              <div className="flex justify-end mt-0.5 mr-1">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <StatusIcon status={m.status} />
                  {statusLabel(m.status)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function statusLabel(status: string) {
  if (!status) return '';
  if (status === 'delivered' || status === 'read') return 'Delivered';
  if (status === 'sent') return 'Sent';
  if (status === 'queued' || status === 'sending' || status === 'pending') return 'Sending…';
  if (status === 'failed' || status === 'undelivered') return 'Failed';
  return status;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'delivered' || status === 'read') return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
  if (status === 'failed' || status === 'undelivered') return <AlertCircle className="w-3 h-3 text-destructive" />;
  if (status === 'queued' || status === 'sending' || status === 'pending') return <Clock className="w-3 h-3" />;
  return <CheckCircle2 className="w-3 h-3 text-muted-foreground/60" />;
}

// ============== Composer ==============
function Composer({
  value, onChange, onSend, onKeyDown, sending, channel, templates,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  sending: boolean;
  channel: MessagingChannel;
  templates: any[];
}) {
  const seg = smsSegments(value);
  const canSend = value.trim().length > 0 && !sending;

  return (
    <div className="border-t border-border bg-background px-3 sm:px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/30 focus-within:border-primary/40 focus-within:bg-background transition-colors px-3 py-2">
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
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
            title="Attach (coming soon)"
            disabled
          >
            <Paperclip className="w-3.5 h-3.5" />
          </Button>

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
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Meta line */}
        <div className="flex items-center justify-between mt-1.5 px-2 text-[10.5px] text-muted-foreground">
          <span>
            {channel === 'whatsapp' ? 'WhatsApp Business · via Twilio' : `${seg.count} segment${seg.count > 1 ? 's' : ''} · ${seg.chars} chars`}
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
}) {
  return (
    <>
      {/* Header — recipient picker */}
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

      {/* Body: results OR conversation start */}
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

          {/* Quick stats */}
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

          {/* Lead info */}
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
