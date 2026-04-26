import { useEffect, useMemo, useRef, useState } from 'react';
import { onHardwareBack, haptic } from '@/lib/native';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search, Plus, MessageSquare, ArrowLeft, X, ChevronRight, Pin, Archive,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAllSmsLog, useSendSms, useSmsTemplates,
  useDeleteSmsMessage, useDeleteSmsConversation,
  type MessagingChannel, type SmsLogRow,
} from '@/hooks/useSms';
import { useCrmContacts, type CrmContact } from '@/hooks/useCrmContacts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useThreadPins } from '@/hooks/useThreadPins';
import { useThreadState } from '@/hooks/useThreadState';
import { useRealtimeSmsLog } from '@/hooks/useRealtimeSmsLog';
import { uploadSmsMedia } from '@/lib/smsMediaUpload';
import { playReceiveFor, playSendFor } from '@/lib/messagingSound';
import { toast } from 'sonner';

import { initialsFor, nameFor, normalize, type Thread, type QuotedRef } from './messaging/shared/types';
import { ThreadRow } from './messaging/shared/ThreadRow';
import { ContactDetailsPane } from './messaging/shared/ContactDetailsPane';
import { FilterChip } from './messaging/shared/UiBits';
import { IMessageConversation } from './messaging/imessage/IMessageConversation';
import { WhatsAppConversation } from './messaging/whatsapp/WhatsAppConversation';

interface Props {
  channel: MessagingChannel;
  onChannelChange: (c: MessagingChannel) => void;
}

export function MessagingCenter({ channel, onChannelChange }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useRealtimeSmsLog();
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
  const [leftCollapsed, setLeftCollapsed] = useState(() => typeof window !== 'undefined' && localStorage.getItem('msg.leftCollapsed') === '1');
  const [rightCollapsed, setRightCollapsed] = useState(() => typeof window !== 'undefined' && localStorage.getItem('msg.rightCollapsed') === '1');
  const [convoSearch, setConvoSearch] = useState('');
  const [showConvoSearch, setShowConvoSearch] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<File[]>([]);
  const [scheduledFor, setScheduledFor] = useState<string>('');
  const [quotedRef, setQuotedRef] = useState<QuotedRef | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ key: string; name: string } | null>(null);

  // Persist pane collapse
  useEffect(() => { localStorage.setItem('msg.leftCollapsed', leftCollapsed ? '1' : '0'); }, [leftCollapsed]);
  useEffect(() => { localStorage.setItem('msg.rightCollapsed', rightCollapsed ? '1' : '0'); }, [rightCollapsed]);

  // ─── Build threads (per current channel) ──────────────────────
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
        t = { key, phone, contact, messages: [], lastInbound: null, lastMessage: l, unread: false, channel };
        map.set(key, t);
      }
      t.messages.push(l);
      if (l.direction === 'inbound' && (!t.lastInbound || new Date(l.sent_at) > new Date(t.lastInbound.sent_at))) {
        t.lastInbound = l;
      }
    }
    const arr = [...map.values()].map(t => {
      const sorted = [...t.messages].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
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
    arr.sort((a, b) => new Date(b.lastMessage.sent_at).getTime() - new Date(a.lastMessage.sent_at).getTime());
    return arr;
  }, [logs, contacts, channel, threadState]);

  const filteredThreads = useMemo(() => {
    let list = threads;
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

  useEffect(() => {
    if (!activeKey && filteredThreads.length > 0 && !isMobile) {
      setActiveKey(filteredThreads[0].key);
    }
  }, [filteredThreads, activeKey, isMobile]);

  // Android hardware back: pop the open conversation back to the inbox list
  // before the OS gets a chance to exit the app. Returns `true` to mark the
  // event as handled.
  useEffect(() => {
    if (!activeKey && !showNewChat) return;
    return onHardwareBack(() => {
      if (showNewChat) { setShowNewChat(false); return true; }
      if (activeKey)   { setActiveKey(null); haptic('selection'); return true; }
      return false;
    });
  }, [activeKey, showNewChat]);

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

  // ─── Sound: play receive ping when new inbound arrives ────────
  const inboundCountRef = useRef<number>(0);
  useEffect(() => {
    const inboundCount = logs.filter(l => l.direction === 'inbound' && (l.channel || 'sms') === channel).length;
    if (inboundCountRef.current && inboundCount > inboundCountRef.current) {
      playReceiveFor(channel);
    }
    inboundCountRef.current = inboundCount;
  }, [logs, channel]);

  // Mark as read
  useEffect(() => {
    if (active) threadState.markRead(channel, active.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.key, active?.messages.length, channel]);

  // Reset transient state on thread switch
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

    let mediaUrls: string[] = [];
    if (pendingMedia.length > 0) {
      try { mediaUrls = await uploadSmsMedia(pendingMedia); }
      catch (e: any) { toast.error(e?.message || 'Media upload failed'); return; }
    }

    let finalBody = body;
    if (quotedRef) {
      const quoteSnippet = quotedRef.body.length > 80 ? quotedRef.body.slice(0, 80) + '…' : quotedRef.body;
      finalBody = `↪ "${quoteSnippet}"\n${body}`;
    }

    await sendSms.mutateAsync({
      to, body: finalBody, contact_id: contactId, channel,
      media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
      scheduled_for: scheduledFor || undefined,
    });

    playSendFor(channel);

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

  const startNewChat = () => {
    setShowNewChat(true);
    setActiveKey(null);
    setComposeBody('');
    setQuotedRef(null);
  };

  const channelTemplates = useMemo(
    () => templates.filter(t => (t.channel || 'sms') === channel && t.is_active),
    [templates, channel],
  );

  const visibleMessages = useMemo(() => {
    if (!active) return [];
    const q = convoSearch.trim().toLowerCase();
    if (!q) return active.messages;
    return active.messages.filter(m => m.body?.toLowerCase().includes(q));
  }, [active, convoSearch]);

  const hasContactDetails = !!(active?.contact || (showNewChat && newChatContact));
  const showLeftPane = isMobile ? (!active && !showNewChat) : !leftCollapsed;
  const showCenterPane = !isMobile || active || showNewChat;
  const showRightPane = !isMobile && hasContactDetails && !rightCollapsed;

  const gridCols = !isMobile
    ? [showLeftPane ? '340px' : null, '1fr', showRightPane ? '320px' : null].filter(Boolean).join(' ')
    : undefined;

  const pinnedThreads = filteredThreads.filter(t => isPinned(channel, t.key));
  const otherThreads = filteredThreads.filter(t => !isPinned(channel, t.key));

  const isWa = channel === 'whatsapp';

  return (
    <div className={cn(
      'flex flex-col h-[calc(100vh-180px)] min-h-[620px] rounded-2xl overflow-hidden border border-border shadow-sm',
      isWa ? 'bg-[#efeae2] dark:bg-[#0b141a]' : 'bg-background',
    )}>
      <div className="grid h-full grid-cols-1" style={!isMobile ? { gridTemplateColumns: gridCols } : undefined}>

        {/* ============ LEFT PANE — thread list ============ */}
        {showLeftPane && (
          <div className="flex flex-col border-r border-border bg-muted/20 min-h-0">
            <div className="px-4 pt-4 pb-3 border-b border-border bg-background/60 backdrop-blur">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[17px] font-semibold tracking-tight">Messages</h2>
                <Button size="icon" variant="ghost"
                  className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary"
                  onClick={startNewChat} title="New conversation">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Channel switcher */}
              <div className="inline-flex w-full items-center rounded-lg bg-muted p-0.5 mb-3">
                <button
                  onClick={() => onChannelChange('sms')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all',
                    channel === 'sms' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5" /> iMessage / SMS
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
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> WhatsApp
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search"
                  className="h-9 pl-9 text-sm rounded-xl bg-muted/40 border-transparent focus-visible:bg-background"
                />
              </div>

              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
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

            <ScrollArea className="flex-1">
              {filteredThreads.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  {filter === 'archived'
                    ? 'No archived conversations.'
                    : search ? 'No matches' : `No ${isWa ? 'WhatsApp' : 'SMS'} conversations yet.`}
                  {filter !== 'archived' && (
                    <div className="mt-3">
                      <Button size="sm" variant="outline" onClick={startNewChat}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> New conversation
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-2 py-2 space-y-0.5">
                  {pinnedThreads.length > 0 && (
                    <>
                      <div className="px-2.5 pt-1 pb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        <Pin className="w-2.5 h-2.5" /> Pinned
                      </div>
                      {pinnedThreads.map(t => (
                        <ThreadRow
                          key={t.key} thread={t}
                          active={activeKey === t.key && !showNewChat}
                          pinned
                          muted={threadState.isMuted(channel, t.key)}
                          archived={threadState.isArchived(channel, t.key)}
                          onClick={() => { setShowNewChat(false); setActiveKey(t.key); }}
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
                      key={t.key} thread={t}
                      active={activeKey === t.key && !showNewChat}
                      pinned={false}
                      muted={threadState.isMuted(channel, t.key)}
                      archived={threadState.isArchived(channel, t.key)}
                      onClick={() => { setShowNewChat(false); setActiveKey(t.key); }}
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
              )}
            </ScrollArea>
          </div>
        )}

        {/* ============ CENTER PANE ============ */}
        {showCenterPane && (
          <div className="flex flex-col min-h-0">
            {showNewChat ? (
              <NewChatPane
                onBack={() => setShowNewChat(false)}
                contact={newChatContact}
                phone={newChatPhone}
                onPhoneChange={setNewChatPhone}
                onClearContact={() => { setNewChatContact(null); setNewChatPhone(''); }}
                results={newChatResults}
                query={newChatQuery}
                onQueryChange={setNewChatQuery}
                onPick={(c) => { setNewChatContact(c); setNewChatPhone(c.phone || ''); }}
                channel={channel}
                composeBody={composeBody}
                onComposeChange={setComposeBody}
                onSend={handleSend}
                sending={sendSms.isPending}
              />
            ) : active ? (
              isWa ? (
                <WhatsAppConversation
                  thread={active}
                  visibleMessages={visibleMessages}
                  highlight={convoSearch.trim()}
                  threadState={threadState}
                  composeBody={composeBody}
                  onComposeChange={setComposeBody}
                  onSend={handleSend}
                  sending={sendSms.isPending}
                  pendingMedia={pendingMedia}
                  onMediaChange={setPendingMedia}
                  scheduledFor={scheduledFor}
                  onScheduledChange={setScheduledFor}
                  quotedRef={quotedRef}
                  onQuote={(m) => setQuotedRef({ id: m.id, body: m.body, direction: m.direction })}
                  onClearQuote={() => setQuotedRef(null)}
                  onDeleteMessage={(id) => deleteMessage.mutate(id)}
                  templates={channelTemplates}
                  isMobile={isMobile}
                  leftCollapsed={leftCollapsed}
                  onToggleLeft={() => setLeftCollapsed(v => !v)}
                  rightCollapsed={rightCollapsed}
                  hasContactDetails={hasContactDetails}
                  onToggleRight={() => setRightCollapsed(v => !v)}
                  onBack={() => setActiveKey(null)}
                  onOpenLead={() => active.contact && navigate(`/crm/leads/${active.contact.id}`)}
                  onToggleMute={() => threadState.toggleMute(channel, active.key)}
                  onToggleArchive={() => { threadState.toggleArchive(channel, active.key); setActiveKey(null); }}
                  onMarkUnread={() => threadState.markUnread(channel, active.key)}
                  onDelete={() => setConfirmDelete({ key: active.key, name: nameFor(active.contact, active.phone) })}
                  showConvoSearch={showConvoSearch}
                  onToggleConvoSearch={() => { setShowConvoSearch(v => !v); if (showConvoSearch) setConvoSearch(''); }}
                  convoSearch={convoSearch}
                  onConvoSearchChange={setConvoSearch}
                  lastInboundAt={active.lastInbound?.sent_at || null}
                />
              ) : (
                <IMessageConversation
                  thread={active}
                  visibleMessages={visibleMessages}
                  highlight={convoSearch.trim()}
                  threadState={threadState}
                  composeBody={composeBody}
                  onComposeChange={setComposeBody}
                  onSend={handleSend}
                  sending={sendSms.isPending}
                  pendingMedia={pendingMedia}
                  onMediaChange={setPendingMedia}
                  scheduledFor={scheduledFor}
                  onScheduledChange={setScheduledFor}
                  quotedRef={quotedRef}
                  onQuote={(m) => setQuotedRef({ id: m.id, body: m.body, direction: m.direction })}
                  onClearQuote={() => setQuotedRef(null)}
                  onDeleteMessage={(id) => deleteMessage.mutate(id)}
                  templates={channelTemplates}
                  isMobile={isMobile}
                  leftCollapsed={leftCollapsed}
                  onToggleLeft={() => setLeftCollapsed(v => !v)}
                  rightCollapsed={rightCollapsed}
                  hasContactDetails={hasContactDetails}
                  onToggleRight={() => setRightCollapsed(v => !v)}
                  onBack={() => setActiveKey(null)}
                  onOpenLead={() => active.contact && navigate(`/crm/leads/${active.contact.id}`)}
                  onToggleMute={() => threadState.toggleMute(channel, active.key)}
                  onToggleArchive={() => { threadState.toggleArchive(channel, active.key); setActiveKey(null); }}
                  onMarkUnread={() => threadState.markUnread(channel, active.key)}
                  onDelete={() => setConfirmDelete({ key: active.key, name: nameFor(active.contact, active.phone) })}
                  showConvoSearch={showConvoSearch}
                  onToggleConvoSearch={() => { setShowConvoSearch(v => !v); if (showConvoSearch) setConvoSearch(''); }}
                  convoSearch={convoSearch}
                  onConvoSearchChange={setConvoSearch}
                />
              )
            ) : (
              <EmptyConversation channel={channel} onStartNew={startNewChat} />
            )}
          </div>
        )}

        {/* ============ RIGHT PANE ============ */}
        {showRightPane && (active?.contact || (showNewChat && newChatContact)) && (
          <ContactDetailsPane
            contact={(active?.contact || newChatContact)!}
            messageCount={active?.messages.length || 0}
            channel={channel}
            onOpenLead={(id) => navigate(`/crm/leads/${id}`)}
          />
        )}
      </div>

      {/* Delete dialog */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation with {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes every {isWa ? 'WhatsApp' : 'SMS'} message exchanged with this contact from your records. This cannot be undone.
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
                  { onSuccess: () => { if (activeKey === confirmDelete.key) setActiveKey(null); setConfirmDelete(null); } },
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

// ════════════════════════════════════════════════════════════════════
// Empty conversation pane
// ════════════════════════════════════════════════════════════════════
function EmptyConversation({ channel, onStartNew }: { channel: MessagingChannel; onStartNew: () => void }) {
  const isWa = channel === 'whatsapp';
  return (
    <div className={cn(
      'flex-1 flex flex-col items-center justify-center text-center px-8',
      isWa ? 'wa-bg' : 'imsg-bg',
    )}>
      <div className={cn(
        'w-24 h-24 rounded-3xl flex items-center justify-center mb-5 shadow-lg',
        isWa ? 'bg-emerald-500/20' : 'bg-[#007AFF]/15',
      )}>
        <MessageSquare className={cn('w-12 h-12', isWa ? 'text-emerald-600' : 'text-[#007AFF]')} />
      </div>
      <h3 className="text-[19px] font-semibold tracking-tight mb-1.5">
        {isWa ? 'WhatsApp Web' : 'iMessage'}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        {isWa
          ? 'Send and receive WhatsApp messages with your leads. Start a chat from the sidebar or compose a new one.'
          : 'Pick a conversation from the sidebar, or start a new iMessage to any of your leads.'}
      </p>
      <Button onClick={onStartNew} className={cn('gap-1.5', isWa && 'bg-emerald-600 hover:bg-emerald-700 text-white')}>
        <Plus className="w-4 h-4" /> New conversation
      </Button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// New-chat pane (channel-aware lightweight version)
// ════════════════════════════════════════════════════════════════════
function NewChatPane({
  onBack, contact, phone, onPhoneChange, onClearContact,
  results, query, onQueryChange, onPick,
  channel, composeBody, onComposeChange, onSend, sending,
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
  onSend: () => Promise<void> | void;
  sending: boolean;
}) {
  const isWa = channel === 'whatsapp';
  return (
    <>
      <div className={cn(
        'px-4 py-3 border-b border-border',
        isWa ? 'wa-header' : 'bg-background/80 backdrop-blur',
      )}>
        <div className="flex items-center gap-2 mb-2.5">
          <Button size="icon" variant="ghost"
            className={cn('h-8 w-8 -ml-1', isWa && 'text-white hover:bg-white/10')}
            onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className={cn('text-[13px] font-semibold', isWa && 'text-white')}>
            New {isWa ? 'WhatsApp' : 'iMessage'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className={cn('text-[12px] shrink-0', isWa ? 'text-white/80' : 'text-muted-foreground')}>To:</span>
          {contact ? (
            <div className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-full text-[12.5px] font-medium',
              isWa ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary',
            )}>
              <Avatar className="h-5 w-5">
                <AvatarFallback className={cn('text-[9px]', isWa ? 'bg-emerald-700/40 text-white' : 'bg-primary/20 text-primary')}>
                  {initialsFor(contact, contact.phone || '')}
                </AvatarFallback>
              </Avatar>
              {nameFor(contact, contact.phone || '')}
              <button onClick={onClearContact} className="ml-0.5 hover:bg-white/20 rounded-full p-0.5">
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
              className={cn('h-8 text-sm border-0 focus-visible:ring-0 shadow-none px-1 flex-1',
                isWa ? 'bg-white/10 text-white placeholder:text-white/50' : 'bg-transparent')}
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
                      <AvatarFallback className={cn('text-[11px] font-semibold',
                        isWa ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-primary/15 text-primary')}>
                        {initialsFor(c, c.phone || '')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium truncate">{nameFor(c, c.phone || '')}</div>
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
        <div className={cn(
          'flex-1 flex items-center justify-center text-center px-8',
          isWa ? 'wa-bg' : 'imsg-bg',
        )}>
          <div>
            <Avatar className="h-16 w-16 mx-auto mb-3">
              <AvatarFallback className={cn('text-base font-semibold',
                isWa ? 'bg-emerald-500/15 text-emerald-700' : 'bg-primary/15 text-primary')}>
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

      {/* Lightweight composer for new chat (no schedule/media here — encourages picking the contact first) */}
      <div className="border-t border-border bg-background px-3 py-3">
        {isWa && (
          <div className="max-w-3xl mx-auto mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            New WhatsApp chats are locked until the lead replies first. Use SMS to start outreach, then continue here after they respond.
          </div>
        )}
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <Input
            value={composeBody}
            onChange={(e) => onComposeChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSend(); }
            }}
            placeholder={isWa ? 'WhatsApp message…' : 'iMessage'}
            className="flex-1"
          />
          <Button
            onClick={() => onSend()}
            disabled={(!composeBody.trim()) || sending || isWa}
            className={cn('shrink-0', isWa && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
          >
            Send
          </Button>
        </div>
      </div>
    </>
  );
}
