// Unified Inbox — Apple-Mail-style 3-pane viewer of synced Gmail conversations.
// Pulls from crm_email_threads + crm_gmail_messages (per-user, via RLS).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Inbox, Search, RefreshCcw, Archive, MailOpen, Mail as MailIcon,
  Send, ExternalLink, Loader2, CheckCheck,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
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

export default function InboxView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const threadsQuery = useQuery({
    queryKey: ['crm-inbox-threads', filter],
    queryFn: async () => {
      let q = supabase
        .from('crm_email_threads')
        .select('id, contact_id, subject, last_message_at, last_message_from, last_message_snippet, message_count, unread_count, is_archived, participants')
        .order('last_message_at', { ascending: false })
        .limit(200);
      if (filter === 'unread') q = q.gt('unread_count', 0).eq('is_archived', false);
      else if (filter === 'archived') q = q.eq('is_archived', true);
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] min-h-0 h-full rounded-xl border border-border overflow-hidden bg-card shadow-sm">
      {/* Thread list */}
      <div className="flex flex-col min-h-0 border-r border-border bg-muted/10">
        <div className="px-3 py-2.5 border-b border-border space-y-2">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Inbox</span>
            <Badge variant="outline" className="ml-auto text-[10px] h-5">
              {threadsQuery.data?.reduce((a, t) => a + t.unread_count, 0) ?? 0} unread
            </Badge>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search conversations…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'unread', 'archived'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-2 h-6 rounded-md text-[11px] font-medium capitalize transition-colors',
                  filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:bg-muted',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {threadsQuery.isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filteredThreads.length === 0 ? (
            <EmptyInbox onSync={sync} />
          ) : (
            <ul className="divide-y divide-border/60">
              {filteredThreads.map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedThreadId(t.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors flex flex-col gap-0.5',
                      selectedThreadId === t.id && 'bg-primary/5 border-l-2 border-primary',
                      t.unread_count > 0 && 'bg-primary/[0.03]',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'flex-1 truncate text-sm',
                        t.unread_count > 0 ? 'font-semibold text-foreground' : 'text-foreground/80',
                      )}>
                        {t.last_message_from || t.participants[0] || 'Unknown'}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: false })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        'flex-1 truncate text-xs',
                        t.unread_count > 0 ? 'font-medium text-foreground/90' : 'text-muted-foreground',
                      )}>
                        {t.subject || '(no subject)'}
                      </span>
                      {t.unread_count > 0 && (
                        <Badge className="h-4 px-1.5 text-[9px] bg-primary text-primary-foreground">{t.unread_count}</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {t.last_message_snippet || '—'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>

      {/* Conversation pane */}
      <div className="flex flex-col min-h-0 bg-background">
        {!selectedThread ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-border flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">{selectedThread.subject || '(no subject)'}</h3>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {selectedThread.participants.join(', ')}
                </p>
              </div>
              {selectedThread.contact_id && (
                <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1">
                  <Link to={`/crm/leads/${selectedThread.contact_id}`}>
                    <ExternalLink className="h-3 w-3" />
                    Open lead
                  </Link>
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={archive} className="h-7 text-xs gap-1">
                <Archive className="h-3 w-3" />
                Archive
              </Button>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-4 py-4 space-y-3">
                {messagesQuery.isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  (messagesQuery.data ?? []).map(m => (
                    <MessageBubble key={m.id} msg={m} />
                  ))
                )}
              </div>
            </ScrollArea>

            <div className="border-t border-border p-3 bg-muted/10 space-y-2">
              <Textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Reply…"
                rows={3}
                className="text-sm resize-none"
              />
              <div className="flex items-center justify-end gap-2">
                <Button size="sm" onClick={sendReply} disabled={sending || !reply.trim()} className="h-8 gap-1.5">
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send reply
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const inbound = msg.direction === 'inbound';
  return (
    <div className={cn('flex', inbound ? 'justify-start' : 'justify-end')}>
      <div className={cn(
        'max-w-[85%] rounded-lg border px-3 py-2 shadow-sm',
        inbound ? 'bg-card border-border' : 'bg-primary/5 border-primary/20',
      )}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-semibold text-foreground">
            {inbound ? (msg.from_name || msg.from_email) : 'You'}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(msg.internal_date), 'MMM d, h:mm a')}
          </span>
          {!inbound && <CheckCheck className="h-3 w-3 text-primary/70 ml-auto" />}
        </div>
        {msg.body_html ? (
          <div
            className="prose prose-sm max-w-none text-foreground/90 text-[13px] [&_a]:text-primary [&_*]:!my-1"
            dangerouslySetInnerHTML={{ __html: sanitize(msg.body_html) }}
          />
        ) : (
          <p className="text-[13px] text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {msg.body_text || msg.snippet || ''}
          </p>
        )}
      </div>
    </div>
  );
}

function sanitize(html: string): string {
  // Strip script/style and inline event handlers
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}

function EmptyInbox({ onSync }: { onSync: () => void }) {
  return (
    <div className="p-6 text-center space-y-3">
      <MailOpen className="h-8 w-8 text-muted-foreground mx-auto" />
      <p className="text-sm text-muted-foreground">No conversations yet.</p>
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
