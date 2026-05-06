// Unified Inbox — native-mail style (Apple Mail / Outlook).
// 3-pane layout: folder rail • message list • reading pane.
// Pulls from crm_email_threads + crm_gmail_messages (per-user, via RLS).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Inbox, Search, RefreshCcw, Archive, MailOpen, Send, ExternalLink,
  Loader2, CheckCheck, Reply, Star, Trash2, Forward, Paperclip,
} from 'lucide-react';
import { format, isToday, isYesterday, isThisYear } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

  // Auto-select first
  useEffect(() => {
    if (!selectedThreadId && filteredThreads.length > 0) {
      setSelectedThreadId(filteredThreads[0].id);
    }
  }, [filteredThreads, selectedThreadId]);

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

  const archive = async () => {
    if (!selectedThread) return;
    try {
      await supabase.functions.invoke('gmail-actions', {
        body: { action: 'archive', thread_db_id: selectedThread.id },
      });
      toast.success('Archived');
      setSelectedThreadId(null);
      qc.invalidateQueries({ queryKey: ['crm-inbox-threads'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Archive failed');
    }
  };

  const sendReply = async () => {
    if (!selectedThread || !reply.trim()) return;
    try {
      setSending(true);
      await supabase.functions.invoke('gmail-actions', {
        body: { action: 'send_reply', thread_db_id: selectedThread.id, body_text: reply },
      });
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_320px_1fr] lg:grid-cols-[200px_360px_1fr] min-h-0 h-full rounded-xl border border-border overflow-hidden bg-background shadow-sm">
      {/* ───────────────── Folder rail ───────────────── */}
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

      {/* ───────────────── Message list ───────────────── */}
      <section className="flex flex-col min-h-0 border-r border-border bg-card">
        <div className="px-3.5 py-3 border-b border-border space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground capitalize">
              {folder}
            </h2>
            <span className="text-[10.5px] text-muted-foreground tabular-nums">
              {filteredThreads.length} {filteredThreads.length === 1 ? 'message' : 'messages'}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search messages…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-muted/40 border-transparent focus-visible:bg-background focus-visible:border-border"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {threadsQuery.isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filteredThreads.length === 0 ? (
            <EmptyInbox onSync={sync} />
          ) : (
            <ul>
              {filteredThreads.map(t => {
                const isActive = selectedThreadId === t.id;
                const isUnread = t.unread_count > 0;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedThreadId(t.id)}
                      className={cn(
                        'w-full text-left px-3.5 py-3 transition-colors flex gap-2 border-l-2 border-transparent',
                        'border-b border-border/50',
                        isActive
                          ? 'bg-primary/[0.06] border-l-primary'
                          : 'hover:bg-muted/40',
                      )}
                    >
                      {/* unread dot */}
                      <div className="pt-1.5 w-2 shrink-0 flex justify-center">
                        {isUnread && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={cn(
                            'flex-1 truncate text-[13px]',
                            isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/85',
                          )}>
                            {t.last_message_from || t.participants[0] || 'Unknown'}
                          </span>
                          <span className={cn(
                            'text-[10.5px] tabular-nums shrink-0',
                            isUnread ? 'text-primary font-medium' : 'text-muted-foreground',
                          )}>
                            {smartTime(t.last_message_at)}
                          </span>
                        </div>
                        <div className={cn(
                          'truncate text-[12.5px] mt-0.5',
                          isUnread ? 'text-foreground/90 font-medium' : 'text-foreground/70',
                        )}>
                          {t.subject || '(no subject)'}
                        </div>
                        <p className="text-[11.5px] text-muted-foreground truncate mt-0.5 leading-snug">
                          {t.last_message_snippet || '—'}
                        </p>
                        {t.message_count > 1 && (
                          <span className="inline-flex items-center mt-1 text-[10px] text-muted-foreground/80 tabular-nums">
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

      {/* ───────────────── Reading pane ───────────────── */}
      <main className="flex flex-col min-h-0 bg-background">
        {!selectedThread ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-8">
            <MailOpen className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.25} />
            <p className="text-sm text-muted-foreground">No message selected</p>
            <p className="text-xs text-muted-foreground/70 max-w-[28ch]">
              Pick a conversation from the list to read it here.
            </p>
          </div>
        ) : (
          <>
            {/* Action toolbar */}
            <div className="h-12 border-b border-border flex items-center px-2 gap-0.5 bg-muted/10">
              <ToolbarBtn icon={Archive} label="Archive" onClick={archive} />
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

            {/* Subject header */}
            <div className="px-8 pt-6 pb-4 border-b border-border">
              <h1 className="text-xl font-semibold tracking-tight text-foreground leading-snug">
                {selectedThread.subject || '(no subject)'}
              </h1>
              <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
                {selectedThread.message_count} {selectedThread.message_count === 1 ? 'message' : 'messages'} · {selectedThread.participants.join(', ')}
              </p>
            </div>

            {/* Conversation */}
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

            {/* Reply composer */}
            <div className="border-t border-border px-6 py-3 bg-muted/10">
              <div className="rounded-lg border border-border bg-background shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-3 h-8 border-b border-border/60 bg-muted/20">
                  <Reply className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">
                    Reply to {selectedThread.last_message_from || selectedThread.participants[0]}
                  </span>
                </div>
                <Textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  placeholder="Write your reply…"
                  rows={3}
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

function MessageCard({ msg }: { msg: Msg }) {
  const inbound = msg.direction === 'inbound';
  const senderName = inbound ? (msg.from_name || msg.from_email) : 'You';
  return (
    <article className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <header className="flex items-start gap-3 px-4 py-3 border-b border-border/60">
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
            to {msg.to_emails?.join(', ') || '—'} · {format(new Date(msg.internal_date), 'MMM d, yyyy h:mm a')}
          </div>
        </div>
      </header>
      <div className="px-5 py-4">
        {msg.body_html ? (
          <div
            className="prose prose-sm max-w-none text-foreground/90 text-[13.5px] leading-relaxed [&_a]:text-primary [&_*]:!my-1.5"
            dangerouslySetInnerHTML={{ __html: sanitize(msg.body_html) }}
          />
        ) : (
          <p className="text-[13.5px] text-foreground/90 whitespace-pre-wrap leading-relaxed">
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

function EmptyInbox({ onSync }: { onSync: () => void }) {
  return (
    <div className="p-8 text-center space-y-3">
      <MailOpen className="h-8 w-8 text-muted-foreground/50 mx-auto" strokeWidth={1.25} />
      <p className="text-sm text-foreground/80">No conversations yet.</p>
      <p className="text-xs text-muted-foreground">
        Connect Gmail in Settings → Integrations to sync your inbox.
      </p>
      <Button size="sm" variant="outline" onClick={onSync} className="gap-1.5">
        <RefreshCcw className="h-3.5 w-3.5" />
        Try sync
      </Button>
    </div>
  );
}
