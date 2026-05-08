// Unified Inbox — native-mail style (Apple Mail / Outlook).
// Desktop: 3-pane layout (folder rail • message list • reading pane).
// Mobile (< md): list-or-detail stack with back chevron, mobile top bar
// (folder picker + sync), pull-to-refresh, swipe-to-archive on rows,
// auto-grow reply field with `enterKeyHint=send` and ⌘/Ctrl+Enter to send.
// Pulls from crm_email_threads + crm_gmail_messages (per-user, via RLS).
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import DOMPurify from 'dompurify';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { InboxEmpty } from '@/components/crm/inbox/InboxEmpty';
import { InboxShortcutsHelp } from '@/components/crm/inbox/InboxShortcutsHelp';
import {
  Inbox, Search, RefreshCcw, Archive, MailOpen, Send, ExternalLink,
  Loader2, CheckCheck, Reply, Star, Trash2, Forward, Paperclip,
  ChevronLeft, ChevronDown,
} from 'lucide-react';
import { format, isToday, isYesterday, isThisYear, isThisWeek } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useIsCompact } from '@/hooks/use-mobile';
import { triggerHaptic } from '@/lib/haptics';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';

type Thread = {
  id: string;
  contact_id: string | null;
  subject: string;
  last_message_at: string;
  last_message_from: string | null;
  last_message_snippet: string | null;
  message_count: number;
  unread_count: number;
  is_archived: boolean;
  participants: string[];
};

type Msg = {
  id: string;
  gmail_message_id: string;
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;
  internal_date: string;
  direction: 'inbound' | 'outbound';
  is_read: boolean;
};

type Folder = 'inbox' | 'unread' | 'flagged' | 'archive';

function smartTime(d: string | Date) {
  const date = new Date(d);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  if (isThisWeek(date, { weekStartsOn: 1 })) return format(date, 'EEE');
  if (isThisYear(date)) return format(date, 'MMM d');
  return format(date, 'MM/dd/yy');
}

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export default function InboxView() {
  const qc = useQueryClient();
  const isCompact = useIsCompact();
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<Folder>('inbox');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const threadsQuery = useQuery({
    queryKey: ['crm-inbox-threads', folder],
    queryFn: async () => {
      let q = supabase
        .from('crm_email_threads')
        .select('id, contact_id, subject, last_message_at, last_message_from, last_message_snippet, message_count, unread_count, is_archived, participants')
        .order('last_message_at', { ascending: false })
        .limit(200);
      if (folder === 'unread') q = q.gt('unread_count', 0).eq('is_archived', false);
      else if (folder === 'archive') q = q.eq('is_archived', true);
      else q = q.eq('is_archived', false);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Thread[];
    },
    refetchInterval: 30000,
  });

  // Realtime: refresh on new messages
  useEffect(() => {
    const ch = supabase
      .channel('crm-inbox-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_email_threads' }, () => {
        qc.invalidateQueries({ queryKey: ['crm-inbox-threads'] });
        if (selectedThreadId) qc.invalidateQueries({ queryKey: ['crm-inbox-messages', selectedThreadId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, selectedThreadId]);

  const filteredThreads = useMemo(() => {
    const base = threadsQuery.data ?? [];
    if (!search.trim()) return base;
    const s = search.toLowerCase();
    return base.filter(t =>
      t.subject.toLowerCase().includes(s)
      || (t.last_message_snippet ?? '').toLowerCase().includes(s)
      || (t.last_message_from ?? '').toLowerCase().includes(s)
      || t.participants.some(p => p.toLowerCase().includes(s))
    );
  }, [threadsQuery.data, search]);

  // Auto-select first — desktop only. On mobile the user enters the
  // thread by tapping (list-or-detail UX).
  useEffect(() => {
    if (isCompact) return;
    if (!selectedThreadId && filteredThreads.length > 0) {
      setSelectedThreadId(filteredThreads[0].id);
    }
  }, [filteredThreads, selectedThreadId, isCompact]);

  const messagesQuery = useQuery({
    queryKey: ['crm-inbox-messages', selectedThreadId],
    queryFn: async () => {
      if (!selectedThreadId) return [];
      const { data, error } = await supabase
        .from('crm_gmail_messages')
        .select('id, gmail_message_id, from_email, from_name, to_emails, subject, body_text, body_html, snippet, internal_date, direction, is_read')
        .eq('thread_id', selectedThreadId)
        .order('internal_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
    enabled: !!selectedThreadId,
  });

  const selectedThread = filteredThreads.find(t => t.id === selectedThreadId) ?? null;

  // Mark thread read when opened
  useEffect(() => {
    if (!selectedThread || selectedThread.unread_count === 0) return;
    (async () => {
      try {
        await supabase.functions.invoke('gmail-actions', {
          body: { action: 'mark_read', thread_db_id: selectedThread.id },
        });
        qc.invalidateQueries({ queryKey: ['crm-inbox-threads'] });
      } catch (e) { console.warn('mark_read failed', e); }
    })();
  }, [selectedThread?.id]);

  const sync = async () => {
    try {
      setSyncing(true);
      await supabase.functions.invoke('gmail-actions', { body: { action: 'sync_now' } });
      toast.success('Sync started');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['crm-inbox-threads'] }), 1500);
    } catch (e: any) {
      toast.error(e?.message ?? 'Sync failed');
    } finally { setSyncing(false); }
  };

  // Pull-to-refresh handler — fast refetch, no toast spam.
  const handlePullRefresh = async () => {
    triggerHaptic('light');
    await Promise.allSettled([
      qc.invalidateQueries({ queryKey: ['crm-inbox-threads'] }),
      // Best-effort live sync
      supabase.functions.invoke('gmail-actions', { body: { action: 'sync_now' } }).catch(() => {}),
    ]);
  };

  const archiveThread = async (threadId: string) => {
    try {
      await supabase.functions.invoke('gmail-actions', {
        body: { action: 'archive', thread_db_id: threadId },
      });
      triggerHaptic('success');
      toast.success('Archived');
      if (selectedThreadId === threadId) setSelectedThreadId(null);
      qc.invalidateQueries({ queryKey: ['crm-inbox-threads'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Archive failed');
    }
  };

  const archive = async () => { if (selectedThread) await archiveThread(selectedThread.id); };

  const sendReply = async () => {
    if (!selectedThread || !reply.trim()) return;
    try {
      setSending(true);
      await supabase.functions.invoke('gmail-actions', {
        body: { action: 'send_reply', thread_db_id: selectedThread.id, body_text: reply },
      });
      triggerHaptic('success');
      toast.success('Reply sent');
      setReply('');
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['crm-inbox-threads'] });
        qc.invalidateQueries({ queryKey: ['crm-inbox-messages', selectedThread.id] });
      }, 1500);
    } catch (e: any) {
      toast.error(e?.message ?? 'Send failed');
    } finally { setSending(false); }
  };

  const totalUnread = threadsQuery.data?.reduce((a, t) => a + t.unread_count, 0) ?? 0;

  const folders: { id: Folder; label: string; icon: typeof Inbox; count?: number }[] = [
    { id: 'inbox', label: 'Inbox', icon: Inbox, count: totalUnread || undefined },
    { id: 'unread', label: 'Unread', icon: MailOpen },
    { id: 'flagged', label: 'Flagged', icon: Star },
    { id: 'archive', label: 'Archive', icon: Archive },
  ];

  // Mark thread as unread (gmail-actions: mark_unread)
  const markUnread = useCallback(async (threadId: string) => {
    try {
      await supabase.functions.invoke('gmail-actions', {
        body: { action: 'mark_unread', thread_db_id: threadId },
      });
      triggerHaptic('selection');
      qc.invalidateQueries({ queryKey: ['crm-inbox-threads'] });
    } catch (e: any) {
      // Soft-fail: not all backends support mark_unread; show a hint.
      toast.message('Mark unread is not available yet');
      console.warn('mark_unread failed', e);
    }
  }, [qc]);

  // Keyboard navigation (desktop only). Ignore when typing into an input.
  useEffect(() => {
    if (isCompact) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
        // Only allow Cmd/Ctrl+Enter to escape into Send (handled where the textarea lives)
        return;
      }
      const list = filteredThreads;
      if (e.key === '/') { e.preventDefault(); (document.querySelector('input[type="search"]') as HTMLInputElement | null)?.focus(); return; }
      if (e.key === '?') { e.preventDefault(); (document.querySelector('[aria-label="Keyboard shortcuts"]') as HTMLButtonElement | null)?.click(); return; }
      if (!list.length) return;
      const idx = Math.max(0, list.findIndex(t => t.id === selectedThreadId));
      if (e.key === 'j') { e.preventDefault(); setSelectedThreadId(list[Math.min(list.length - 1, idx + 1)].id); }
      else if (e.key === 'k') { e.preventDefault(); setSelectedThreadId(list[Math.max(0, idx - 1)].id); }
      else if (e.key === 'e' && selectedThread) { e.preventDefault(); void archiveThread(selectedThread.id); }
      else if (e.key === 'u' && selectedThread) { e.preventDefault(); void markUnread(selectedThread.id); }
      else if (e.key === 'r' && selectedThread) {
        e.preventDefault();
        const ta = document.querySelector('textarea[data-inbox-reply]') as HTMLTextAreaElement | null;
        ta?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredThreads, selectedThreadId, selectedThread?.id, isCompact, markUnread]);


  // ───────────────── Mobile (list-or-detail) ─────────────────
  if (isCompact) {
    const showingDetail = !!selectedThread;
    return (
      <div className="flex flex-col min-h-0 h-full bg-background">
        {!showingDetail ? (
          <MobileThreadList
            folder={folder}
            folders={folders}
            onFolderChange={(f) => { setFolder(f); setSelectedThreadId(null); }}
            search={search}
            onSearchChange={setSearch}
            threads={filteredThreads}
            isLoading={threadsQuery.isLoading}
            onPick={(id) => { triggerHaptic('selection'); setSelectedThreadId(id); }}
            onSync={sync}
            syncing={syncing}
            onPullRefresh={handlePullRefresh}
            onArchive={archiveThread}
            onMarkUnread={markUnread}
          />
        ) : (
          <MobileThreadDetail
            thread={selectedThread!}
            messages={messagesQuery.data ?? []}
            isLoading={messagesQuery.isLoading}
            onBack={() => setSelectedThreadId(null)}
            onArchive={archive}
            reply={reply}
            onReplyChange={setReply}
            onSend={sendReply}
            sending={sending}
          />
        )}
      </div>
    );
  }

  // ───────────────── Desktop (3-pane) ─────────────────
  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_320px_1fr] lg:grid-cols-[200px_360px_1fr] min-h-0 h-full rounded-xl border border-border overflow-hidden bg-background shadow-sm">
      {/* Folder rail */}
      <aside className="hidden md:flex flex-col border-r border-border bg-muted/20 px-3 py-4 gap-6 min-h-0">
        <div className="px-2">
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/70 mb-2">
            Mailbox
          </div>
          <nav className="flex flex-col gap-0.5">
            {folders.map(f => {
              const active = folder === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => { setFolder(f.id); setSelectedThreadId(null); }}
                  className={cn(
                    'flex items-center gap-2.5 h-8 px-2 rounded-md text-[13px] transition-colors text-left',
                    active
                      ? 'bg-foreground/[0.07] text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground/90',
                  )}
                >
                  <f.icon className={cn('h-3.5 w-3.5 shrink-0', active && 'text-primary')} />
                  <span className="flex-1 truncate">{f.label}</span>
                  {f.count ? (
                    <span className={cn(
                      'text-[10px] tabular-nums px-1.5 h-4 rounded-full inline-flex items-center',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}>{f.count}</span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto px-2">
          <Button
            variant="outline"
            size="sm"
            onClick={sync}
            disabled={syncing}
            className="w-full h-8 gap-1.5 text-xs justify-start"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            {syncing ? 'Syncing…' : 'Sync inbox'}
          </Button>
        </div>
      </aside>

      {/* Message list */}
      <section className="flex flex-col min-h-0 border-r border-border bg-card">
        <div className="px-3.5 py-3 border-b border-border space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground capitalize">
              {folder}
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] text-muted-foreground tabular-nums">
                {filteredThreads.length} {filteredThreads.length === 1 ? 'message' : 'messages'}
              </span>
              <InboxShortcutsHelp />
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search messages…  (press /)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="off"
              autoCorrect="off"
              className="h-8 pl-8 text-xs bg-muted/40 border-transparent focus-visible:bg-background focus-visible:border-border"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {threadsQuery.isLoading ? (
            <div>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="inbox-row-skeleton">
                  <div className="w-2" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="h-3 w-1/3 rounded bg-muted/60" />
                    <div className="h-3 w-3/4 rounded bg-muted/40" />
                    <div className="h-2.5 w-full rounded bg-muted/30" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredThreads.length === 0 ? (
            <InboxEmpty kind="email" onAction={sync} />
          ) : (
            <ul>
              {filteredThreads.map(t => {
                const isActive = selectedThreadId === t.id;
                const isUnread = t.unread_count > 0;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedThreadId(t.id)}
                      className="inbox-row"
                      data-active={isActive}
                      data-unread={isUnread}
                    >
                      <span className="inbox-row__dot" data-hidden={!isUnread} aria-hidden />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="inbox-row__sender">
                            {t.last_message_from || t.participants[0] || 'Unknown'}
                          </span>
                          <span className="inbox-row__time">
                            {smartTime(t.last_message_at)}
                          </span>
                        </div>
                        <div className="inbox-row__subject">
                          {t.subject || '(no subject)'}
                        </div>
                        <p className="inbox-row__snippet">
                          {t.last_message_snippet || '—'}
                        </p>
                        {t.message_count > 1 && (
                          <span className="inbox-row__meta">
                            {t.message_count} messages
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </section>

      {/* Reading pane */}
      <main className="flex flex-col min-h-0 bg-background">
        {!selectedThread ? (
          <InboxEmpty kind="email" />
        ) : (
          <>
            <div className="h-12 border-b border-border flex items-center px-2 gap-0.5 bg-muted/10">
              <ToolbarBtn icon={Archive} label="Archive" onClick={archive} />
              <ToolbarBtn icon={MailOpen} label="Mark unread" onClick={() => selectedThread && void markUnread(selectedThread.id)} />
              <ToolbarBtn icon={Trash2} label="Delete" onClick={archive} />
              <div className="w-px h-5 bg-border mx-1" />
              <ToolbarBtn icon={Reply} label="Reply" />
              <ToolbarBtn icon={Forward} label="Forward" />
              <ToolbarBtn icon={Star} label="Flag" />
              <div className="ml-auto flex items-center gap-1">
                {selectedThread.contact_id && (
                  <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1.5">
                    <Link to={`/crm/leads/${selectedThread.contact_id}`}>
                      <ExternalLink className="h-3 w-3" />
                      Open lead
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            <div className="px-8 pt-6 pb-4 border-b border-border">
              <h1 className="text-[22px] font-semibold tracking-tight text-foreground leading-snug">
                {selectedThread.subject || '(no subject)'}
              </h1>
              <p className="text-[11.5px] text-muted-foreground mt-1.5 truncate">
                {selectedThread.message_count} {selectedThread.message_count === 1 ? 'message' : 'messages'} · {selectedThread.participants.join(', ')}
              </p>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-8 py-6 space-y-4 max-w-3xl">
                {messagesQuery.isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  (messagesQuery.data ?? []).map(m => (
                    <MessageCard key={m.id} msg={m} />
                  ))
                )}
              </div>
            </ScrollArea>

            <div className="border-t border-border px-6 py-3 bg-muted/10">
              <div className="rounded-lg border border-border bg-background shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-3 h-8 border-b border-border/60 bg-muted/20">
                  <Reply className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">
                    Reply to {selectedThread.last_message_from || selectedThread.participants[0]}
                  </span>
                </div>
                <Textarea
                  data-inbox-reply
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void sendReply(); }
                  }}
                  placeholder="Write your reply…  (⌘+Enter to send)"
                  rows={3}
                  enterKeyHint="send"
                  className="text-[13px] resize-none border-0 shadow-none focus-visible:ring-0 rounded-none"
                />
                <div className="flex items-center justify-between px-3 py-2 border-t border-border/60 bg-muted/10">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" disabled>
                      <Paperclip className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Button size="sm" onClick={sendReply} disabled={sending || !reply.trim()} className="h-7 gap-1.5 text-xs">
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ───────────────── Mobile sub-components ─────────────────

function MobileThreadList({
  folder, folders, onFolderChange, search, onSearchChange, threads, isLoading,
  onPick, onSync, syncing, onPullRefresh, onArchive, onMarkUnread,
}: {
  folder: Folder;
  folders: { id: Folder; label: string; icon: typeof Inbox; count?: number }[];
  onFolderChange: (f: Folder) => void;
  search: string;
  onSearchChange: (s: string) => void;
  threads: Thread[];
  isLoading: boolean;
  onPick: (id: string) => void;
  onSync: () => void;
  syncing: boolean;
  onPullRefresh: () => Promise<void>;
  onArchive: (id: string) => void | Promise<void>;
  onMarkUnread: (id: string) => void | Promise<void>;
}) {
  const active = folders.find((f) => f.id === folder) ?? folders[0];
  const FolderIcon = active.icon;
  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Mobile top bar */}
      <header
        className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur-sm px-3 pt-2 pb-2 space-y-2"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] font-semibold text-foreground hover:bg-muted/60 transition-colors"
              >
                <FolderIcon className="h-3.5 w-3.5 text-primary" />
                {active.label}
                {active.count ? (
                  <span className="ml-1 text-[10px] tabular-nums px-1.5 h-4 rounded-full inline-flex items-center bg-primary text-primary-foreground">
                    {active.count}
                  </span>
                ) : null}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="w-56 p-1">
              {folders.map((f) => {
                const Icon = f.icon;
                const isActive = f.id === folder;
                return (
                  <button
                    key={f.id}
                    onClick={() => { triggerHaptic('selection'); onFolderChange(f.id); }}
                    className={cn(
                      'w-full flex items-center gap-2.5 h-9 px-2 rounded-md text-[13px] text-left transition-colors',
                      isActive ? 'bg-foreground/[0.07] text-foreground font-medium' : 'text-foreground/80 hover:bg-muted/50',
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive && 'text-primary')} />
                    <span className="flex-1 truncate">{f.label}</span>
                    {f.count ? (
                      <span className="text-[10px] tabular-nums px-1.5 h-4 rounded-full inline-flex items-center bg-muted text-muted-foreground">
                        {f.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={onSync}
              disabled={syncing}
              aria-label="Sync inbox"
              className="h-9 w-9"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4 text-muted-foreground" />}
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search mail…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoCapitalize="off"
            autoCorrect="off"
            className="h-9 pl-8 text-[13px] bg-muted/40 border-transparent focus-visible:bg-background focus-visible:border-border"
          />
        </div>
      </header>

      {/* List with PTR */}
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ paddingBottom: 'var(--bottom-nav-pad)' }}>
        <PullToRefresh onRefresh={onPullRefresh}>
          {isLoading ? (
            <div>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="inbox-row-skeleton">
                  <div className="w-2" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="h-3 w-1/3 rounded bg-muted/60" />
                    <div className="h-3 w-3/4 rounded bg-muted/40" />
                    <div className="h-2.5 w-full rounded bg-muted/30" />
                  </div>
                </div>
              ))}
            </div>
          ) : threads.length === 0 ? (
            <InboxEmpty kind="email" onAction={onSync} />
          ) : (
            <ul>
              {threads.map((t) => (
                <SwipeableThreadRow
                  key={t.id}
                  thread={t}
                  onPick={() => onPick(t.id)}
                  onArchive={() => onArchive(t.id)}
                  onMarkUnread={() => onMarkUnread(t.id)}
                />
              ))}
            </ul>
          )}
        </PullToRefresh>
      </div>
    </div>
  );
}

/**
 * Touch swipe-left = archive, swipe-right = toggle unread.
 * Threshold: 96px reveals action; release past 160px commits.
 */
function SwipeableThreadRow({
  thread, onPick, onArchive, onMarkUnread,
}: { thread: Thread; onPick: () => void; onArchive: () => void | Promise<void>; onMarkUnread: () => void | Promise<void> }) {
  const isUnread = thread.unread_count > 0;
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const swiping = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    swiping.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null || startY.current == null) return;
    const cdx = e.touches[0].clientX - startX.current;
    const cdy = e.touches[0].clientY - startY.current;
    if (!swiping.current) {
      if (Math.abs(cdx) > 8 && Math.abs(cdx) > Math.abs(cdy) * 1.4) swiping.current = true;
      else return;
    }
    setDx(Math.max(-200, Math.min(200, cdx)));
  };
  const onTouchEnd = () => {
    if (dx <= -160) {
      triggerHaptic('success');
      void onArchive();
    } else if (dx >= 160) {
      triggerHaptic('selection');
      void onMarkUnread();
    }
    setDx(0);
    startX.current = startY.current = null;
    swiping.current = false;
  };

  const archiveOpacity = dx < 0 ? Math.min(1, Math.abs(dx) / 96) : 0;
  const unreadOpacity = dx > 0 ? Math.min(1, dx / 96) : 0;

  return (
    <li className="relative overflow-hidden border-b border-border/40" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Right swipe: mark unread (left side reveal) */}
      <div
        className="absolute inset-y-0 left-0 flex items-center justify-start pl-5 bg-primary text-primary-foreground"
        style={{ width: Math.max(0, dx), opacity: unreadOpacity }}
        aria-hidden
      >
        <MailOpen className="h-5 w-5" />
      </div>
      {/* Left swipe: archive (right side reveal) */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end pr-5 bg-amber-500/90 text-white"
        style={{ width: Math.max(0, -dx), opacity: archiveOpacity }}
        aria-hidden
      >
        <Archive className="h-5 w-5" />
      </div>
      <button
        onClick={onPick}
        className="inbox-row bg-background"
        data-unread={isUnread}
        style={{ transform: `translateX(${dx}px)`, transition: swiping.current ? 'none' : 'transform 200ms ease' }}
      >
        <span className="inbox-row__dot" data-hidden={!isUnread} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="inbox-row__sender">
              {thread.last_message_from || thread.participants[0] || 'Unknown'}
            </span>
            <span className="inbox-row__time">{smartTime(thread.last_message_at)}</span>
          </div>
          <div className="inbox-row__subject">{thread.subject || '(no subject)'}</div>
          <p className="inbox-row__snippet">{thread.last_message_snippet || '—'}</p>
        </div>
      </button>
    </li>
  );
}

function MobileThreadDetail({
  thread, messages, isLoading, onBack, onArchive,
  reply, onReplyChange, onSend, sending,
}: {
  thread: Thread;
  messages: Msg[];
  isLoading: boolean;
  onBack: () => void;
  onArchive: () => void | Promise<void>;
  reply: string;
  onReplyChange: (s: string) => void;
  onSend: () => void | Promise<void>;
  sending: boolean;
}) {
  // Auto-grow reply textarea (cap height so it never eats the screen).
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  }, [reply]);

  return (
    <div className="flex flex-col min-h-0 h-full bg-background">
      <header
        className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur-sm flex items-center gap-1 px-1 py-2"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
      >
        <Button size="icon" variant="ghost" onClick={onBack} className="h-9 w-9" aria-label="Back to inbox">
          <ChevronLeft className="h-5 w-5 text-primary" />
        </Button>
        <div className="flex-1 min-w-0 px-1">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70 font-semibold truncate">
            {thread.message_count} {thread.message_count === 1 ? 'message' : 'messages'}
          </div>
          <div className="text-[14px] font-semibold tracking-tight truncate">
            {thread.subject || '(no subject)'}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onArchive} className="h-9 w-9" aria-label="Archive">
          <Archive className="h-4 w-4 text-muted-foreground" />
        </Button>
        {thread.contact_id && (
          <Button asChild size="icon" variant="ghost" className="h-9 w-9" aria-label="Open lead">
            <Link to={`/crm/leads/${thread.contact_id}`}>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </Link>
          </Button>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          messages.map((m) => <MessageCard key={m.id} msg={m} compact />)
        )}
      </div>

      <div
        className="shrink-0 border-t border-border/60 bg-card/95 backdrop-blur-md px-3 pt-2"
        style={{ paddingBottom: 'max(0.5rem, calc(env(safe-area-inset-bottom, 0px) + var(--bottom-nav-pad, 0px)))' }}
      >
        <div className="rounded-2xl border border-border/70 bg-background shadow-sm overflow-hidden">
          <Textarea
            ref={taRef}
            value={reply}
            onChange={(e) => onReplyChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void onSend(); }
            }}
            placeholder={`Reply to ${thread.last_message_from || thread.participants[0] || ''}…`}
            rows={1}
            enterKeyHint="send"
            className="text-[14px] resize-none border-0 shadow-none focus-visible:ring-0 rounded-none px-3.5 py-3 min-h-[44px] max-h-[180px]"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[10.5px] text-muted-foreground/70 px-1.5">⌘+Enter to send</span>
            <Button
              size="sm"
              onClick={onSend}
              disabled={sending || !reply.trim()}
              className="h-9 gap-1.5 px-4 rounded-xl text-[13px] font-semibold"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({ icon: Icon, label, onClick }: { icon: typeof Inbox; label: string; onClick?: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="h-8 px-2.5 text-[12px] gap-1.5 text-foreground/80 hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden lg:inline">{label}</span>
    </Button>
  );
}

function MessageCard({ msg, compact = false }: { msg: Msg; compact?: boolean }) {
  const inbound = msg.direction === 'inbound';
  const senderName = inbound ? (msg.from_name || msg.from_email) : 'You';
  return (
    <article className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <header className={cn('flex items-start gap-3 border-b border-border/60', compact ? 'px-3 py-2.5' : 'px-4 py-3')}>
        <div className={cn(
          'h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0',
          inbound ? 'bg-muted text-foreground/80' : 'bg-primary/15 text-primary',
        )}>
          {initials(msg.from_name, msg.from_email)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-foreground">{senderName}</span>
            <span className="text-[11px] text-muted-foreground truncate">&lt;{msg.from_email}&gt;</span>
            {!inbound && <CheckCheck className="h-3 w-3 text-primary/70" />}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {compact
              ? format(new Date(msg.internal_date), 'MMM d · h:mm a')
              : <>to {msg.to_emails?.join(', ') || '—'} · {format(new Date(msg.internal_date), 'MMM d, yyyy h:mm a')}</>}
          </div>
        </div>
      </header>
      <div className={cn(compact ? 'px-3.5 py-3' : 'px-5 py-4')}>
        {msg.body_html ? (
          <div
            className={cn(
              'prose prose-sm max-w-none text-foreground/90 leading-relaxed [&_a]:text-primary [&_*]:!my-1.5',
              // Mobile-safe clamping for marketing emails
              '[&_img]:max-w-full [&_img]:h-auto [&_table]:!max-w-full [&_table]:!w-auto [&_pre]:overflow-x-auto',
              compact ? 'text-[13.5px]' : 'text-[13.5px]',
            )}
            dangerouslySetInnerHTML={{ __html: sanitize(msg.body_html) }}
          />
        ) : (
          <p className={cn('whitespace-pre-wrap leading-relaxed text-foreground/90', compact ? 'text-[13.5px]' : 'text-[13.5px]')}>
            {msg.body_text || msg.snippet || ''}
          </p>
        )}
      </div>
    </article>
  );
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'meta', 'link', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'formaction'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

// EmptyInbox replaced by shared `<InboxEmpty kind="email" />`.

