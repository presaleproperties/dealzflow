import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, MessageSquare, Phone, User2, Send, Loader2, Info, WifiOff, Clock, AlertTriangle, Check, CheckCheck, AlertCircle } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { formatContactName, formatPhone } from '@/lib/format';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { SendTextDialog } from '@/components/crm/leads/SendTextDialog';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { ChatThreadSkeleton, MessageBubbleSkeleton } from '@/components/crm/sms/ChatThreadSkeleton';
import { useOfflineOutbox } from '@/hooks/useOfflineOutbox';

type Channel = 'email' | 'sms' | 'whatsapp';

interface ConversationRow {
  id: string;
  contact_id: string;
  channel: Channel;
  status: string | null;
  unread_count: number | null;
  last_message_at: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  contact_id: string | null;
  direction: 'inbound' | 'outbound';
  content: string | null;
  message_type: string | null;
  channel: string | null;
  read: boolean | null;
  delivered: boolean | null;
  sent_by: string | null;
  created_at: string;
  source_table: string | null;
  source_id: string | null;
}

function channelMeta(c: Channel) {
  switch (c) {
    case 'sms':      return { Icon: MessageSquare, label: 'SMS',      color: 'hsl(199 89% 48%)' };
    case 'whatsapp': return { Icon: MessageSquare, label: 'WhatsApp', color: 'hsl(155 60% 45%)' };
    case 'email':
    default:         return { Icon: Mail,          label: 'Email',    color: 'hsl(220 75% 55%)' };
  }
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (isToday(d))     return format(d, 'h:mm a');
  if (isYesterday(d)) return `Yesterday · ${format(d, 'h:mm a')}`;
  return format(d, 'MMM d · h:mm a');
}

type DeliveryState = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

/** Map a Twilio-style status string to one of our normalized delivery states. */
function normalizeStatus(raw: string | null | undefined): DeliveryState {
  switch ((raw ?? '').toLowerCase()) {
    case 'queued':
    case 'accepted':
    case 'scheduled':
    case 'sending':
      return 'sending';
    case 'sent':
      return 'sent';
    case 'delivered':
    case 'received':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
    case 'undelivered':
    case 'canceled':
      return 'failed';
    default:
      return 'sent';
  }
}

function DeliveryIndicator({ state, error }: { state: DeliveryState; error?: string | null }) {
  const cls = 'inline-flex items-center gap-1';
  switch (state) {
    case 'sending':
      return (
        <span className={`${cls} text-muted-foreground/70`} title="Sending…">
          <Clock className="w-3 h-3" />
          <span>Sending</span>
        </span>
      );
    case 'sent':
      return (
        <span className={`${cls} text-muted-foreground/80`} title="Sent">
          <Check className="w-3 h-3" />
          <span>Sent</span>
        </span>
      );
    case 'delivered':
      return (
        <span className={`${cls} text-emerald-600 dark:text-emerald-400`} title="Delivered">
          <CheckCheck className="w-3 h-3" />
          <span>Delivered</span>
        </span>
      );
    case 'read':
      return (
        <span className={`${cls} text-sky-600 dark:text-sky-400`} title="Read">
          <CheckCheck className="w-3 h-3" />
          <span>Read</span>
        </span>
      );
    case 'failed':
      return (
        <span className={`${cls} text-destructive`} title={error || 'Failed to deliver'}>
          <AlertCircle className="w-3 h-3" />
          <span>Failed</span>
        </span>
      );
  }
}

/**
 * Per-thread chat view — one conversation = one channel for one lead.
 * Email and SMS for the same contact appear as **separate** threads.
 *
 * Reuses the existing `ComposeEmailDialog` / `SendTextDialog` for sending,
 * so all template / signature / channel logic stays in one place.
 */
interface CrmChatThreadPageProps {
  /** When rendered as the right pane of the desktop two-pane shell, the
   *  thread should fill its parent (no negative margins, no fixed dvh) and
   *  the back button collapses the selection rather than navigating. */
  embedded?: boolean;
}

export default function CrmChatThreadPage({ embedded = false }: CrmChatThreadPageProps = {}) {
  const { conversationId = '' } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  // Offline outbox state (filtered by contact later, once thread loads)
  const outbox = useOfflineOutbox();

  // Conversation + joined contact
  const { data: thread, isLoading: threadLoading } = useQuery({
    queryKey: ['crm-chat-thread', conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_conversations')
        .select(`id, contact_id, channel, status, unread_count, last_message_at,
                 crm_contacts!inner ( * )`)
        .eq('id', conversationId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const conv: ConversationRow = {
        id: data.id, contact_id: data.contact_id, channel: data.channel as Channel,
        status: data.status, unread_count: data.unread_count, last_message_at: data.last_message_at,
      };
      const contact = (Array.isArray((data as any).crm_contacts) ? (data as any).crm_contacts[0] : (data as any).crm_contacts) as CrmContact;
      return { conv, contact };
    },
  });

  // Messages for this conversation
  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ['crm-chat-thread-messages', conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from('crm_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  // Cross-reference SMS log statuses for outbound SMS/WhatsApp messages
  // so we can show sending / sent / delivered / failed indicators on bubbles.
  const channel = thread?.conv.channel;
  const smsLogIds = useMemo(
    () => messages
      .filter((m) => m.direction === 'outbound' && m.source_table === 'crm_sms_log' && m.source_id)
      .map((m) => m.source_id as string),
    [messages],
  );
  const { data: smsStatuses = {} } = useQuery({
    queryKey: ['crm-chat-thread-sms-statuses', conversationId, smsLogIds.length, smsLogIds.join('|')],
    enabled: smsLogIds.length > 0 && (channel === 'sms' || channel === 'whatsapp'),
    queryFn: async (): Promise<Record<string, { status: string | null; error_message: string | null }>> => {
      const { data, error } = await supabase
        .from('crm_sms_log')
        .select('id, status, error_message')
        .in('id', smsLogIds);
      if (error) throw error;
      const map: Record<string, { status: string | null; error_message: string | null }> = {};
      for (const r of (data ?? []) as Array<{ id: string; status: string | null; error_message: string | null }>) {
        map[r.id] = { status: r.status, error_message: r.error_message };
      }
      return map;
    },
  });

  // Realtime — refetch on new message in this conversation
  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`chat-thread-${conversationId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'crm_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['crm-chat-thread', conversationId] });
        qc.invalidateQueries({ queryKey: ['crm-chat-thread-messages', conversationId] });
        qc.invalidateQueries({ queryKey: ['crm-chats'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, qc]);

  // Realtime — refetch SMS-log status changes (delivered / failed transitions
  // from Twilio webhooks) so the bubble indicators update live.
  useEffect(() => {
    if (smsLogIds.length === 0) return;
    const ch = supabase
      .channel(`chat-thread-sms-${conversationId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'crm_sms_log',
      }, (payload: any) => {
        const id = payload?.new?.id;
        if (id && smsLogIds.includes(id)) {
          qc.invalidateQueries({ queryKey: ['crm-chat-thread-sms-statuses', conversationId] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, smsLogIds, qc]);


  // Mark unread → 0 on open (best-effort)
  useEffect(() => {
    if (!thread?.conv.id || !thread.conv.unread_count) return;
    void supabase.from('crm_conversations')
      .update({ unread_count: 0 })
      .eq('id', thread.conv.id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['crm-chats'] });
      }, () => {});
  }, [thread?.conv.id, thread?.conv.unread_count, qc]);

  // Auto-scroll to latest
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const contact = thread?.contact;
  const conv = thread?.conv;
  const meta = useMemo(() => channelMeta((conv?.channel ?? 'email') as Channel), [conv?.channel]);

  if (threadLoading) {
    return <ChatThreadSkeleton onBack={() => navigate('/crm/chats')} />;
  }
  if (!thread || !conv || !contact) {
    return (
      <div className="px-6 py-20 text-center text-sm text-muted-foreground">
        Conversation not found. <Link to="/crm/chats" className="text-primary underline">Back to Chats</Link>
      </div>
    );
  }

  const name = formatContactName(contact.first_name, contact.last_name) || contact.email || contact.phone || 'Unknown';
  const subline =
    conv.channel === 'email' ? (contact.email ?? 'No email')
    : (formatPhone(contact.phone) || 'No phone');
  const Icon = meta.Icon;

  // Group consecutive same-direction messages into "stacks" for nicer bubbles
  const stacks: { direction: 'inbound' | 'outbound'; items: MessageRow[] }[] = [];
  for (const m of messages) {
    const last = stacks[stacks.length - 1];
    if (last && last.direction === m.direction) last.items.push(m);
    else stacks.push({ direction: m.direction, items: [m] });
  }

  return (
    <div className={
      embedded
        ? 'flex flex-col flex-1 min-h-0 h-full bg-background'
        : '-mx-3 sm:-mx-4 -my-3 sm:-my-4 flex flex-col h-[calc(100dvh-60px)]'
    }>
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border flex items-center gap-3 px-3 py-2.5">
        {!embedded && (
          <button
            onClick={() => navigate('/crm/chats')}
            className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors"
            aria-label="Back to chats"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <Link
          to={`/crm/leads/${contact.id}`}
          className="flex items-center gap-2.5 min-w-0 flex-1 group"
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-semibold shrink-0 ring-1 ring-white/10 shadow-sm"
            style={{ background: `linear-gradient(135deg, ${meta.color} 0%, ${meta.color} 100%)`, opacity: 0.9 }}
          >
            {(contact.first_name?.[0] ?? contact.email?.[0] ?? '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold tracking-tight text-foreground truncate group-hover:text-primary transition-colors">
              {name}
            </h1>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
              <Icon className="w-3 h-3 shrink-0" style={{ color: meta.color }} />
              <span className="font-semibold uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</span>
              <span aria-hidden className="text-muted-foreground/50">·</span>
              <span className="truncate">{subline}</span>
            </p>
          </div>
        </Link>
        {conv.channel !== 'email' && contact.phone && (
          <a
            href={`tel:${contact.phone.replace(/\D/g, '')}`}
            aria-label="Call"
            className="h-9 w-9 rounded-full flex items-center justify-center text-emerald-600 hover:bg-emerald-500/10 transition-colors"
          >
            <Phone className="w-4 h-4" />
          </a>
        )}
        <Link
          to={`/crm/leads/${contact.id}`}
          aria-label="Lead details"
          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors"
        >
          <Info className="w-4 h-4" />
        </Link>
      </div>

      {/* Offline / queued banner — only relevant for SMS/WhatsApp threads */}
      {conv.channel !== 'email' && (() => {
        const mine = outbox.items.filter((i) => i.contact_id === contact.id);
        const pending = mine.filter((i) => i.status === 'pending').length;
        const failed = mine.filter((i) => i.status === 'failed').length;
        if (!outbox.online) {
          return (
            <div className="px-3 py-1.5 text-[12px] flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-900 dark:text-amber-200">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>Offline — messages will send automatically when you reconnect.</span>
            </div>
          );
        }
        if (failed > 0) {
          return (
            <div className="px-3 py-1.5 text-[12px] flex items-center gap-2 bg-destructive/10 border-b border-destructive/30 text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{failed} message{failed === 1 ? '' : 's'} failed to send.</span>
              <button
                className="ml-auto underline underline-offset-2 font-medium"
                onClick={() => mine.filter((i) => i.status === 'failed').forEach((i) => outbox.retry(i.id))}
              >Retry all</button>
            </div>
          );
        }
        if (pending > 0) {
          return (
            <div className="px-3 py-1.5 text-[12px] flex items-center gap-2 bg-muted/40 border-b border-border text-muted-foreground">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Sending {pending} queued message{pending === 1 ? '' : 's'}…</span>
            </div>
          );
        }
        return null;
      })()}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4 bg-muted/10">
        {msgsLoading ? (
          <MessageBubbleSkeleton />
        ) : messages.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
                 style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}40`, color: meta.color }}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[260px] mx-auto leading-relaxed">
              Send the first {meta.label.toLowerCase()} to {name.split(' ')[0]} to start this thread.
            </p>
          </div>
        ) : (
          stacks.map((stack, si) => {
            const outbound = stack.direction === 'outbound';
            return (
              <div key={si} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] flex flex-col gap-1 ${outbound ? 'items-end' : 'items-start'}`}>
                  {stack.items.map((m, mi) => {
                    const isLast = mi === stack.items.length - 1;
                    // Resolve delivery state for outbound SMS / WhatsApp bubbles
                    const isTrackable = outbound && (m.channel === 'sms' || m.channel === 'whatsapp') && m.source_table === 'crm_sms_log' && !!m.source_id;
                    const logEntry = isTrackable ? smsStatuses[m.source_id as string] : undefined;
                    const deliveryState: DeliveryState | null = isTrackable
                      ? normalizeStatus(logEntry?.status)
                      : (outbound && m.channel === 'email' ? 'sent' : null);
                    const deliveryError = logEntry?.error_message ?? null;
                    return (
                      <div key={m.id} className="flex flex-col gap-0.5 max-w-full">
                        <div
                          className={`px-3.5 py-2 rounded-2xl text-[14px] leading-snug whitespace-pre-wrap break-words shadow-sm ${
                            outbound
                              ? 'bg-primary text-primary-foreground rounded-br-md'
                              : 'bg-card text-foreground border border-border rounded-bl-md'
                          } ${deliveryState === 'failed' ? 'ring-1 ring-destructive/60' : ''}`}
                        >
                          {/* For email, content can include "Subject: ..." prefix from compose flow */}
                          {(m.content ?? '').trim() || <span className="italic opacity-60">(empty)</span>}
                        </div>
                        {isLast && (
                          <span className={`text-[10px] tabular-nums flex items-center gap-1.5 ${outbound ? 'text-muted-foreground justify-end pr-1' : 'text-muted-foreground/80 pl-1'}`}>
                            <span>{formatStamp(m.created_at)}</span>
                            {outbound && m.sent_by ? <span aria-hidden>·</span> : null}
                            {outbound && m.sent_by ? <span>{m.sent_by}</span> : null}
                            {outbound && deliveryState ? (
                              <>
                                <span aria-hidden className="text-muted-foreground/40">·</span>
                                <DeliveryIndicator state={deliveryState} error={deliveryError} />
                              </>
                            ) : null}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {/* Ghost bubbles for offline outbox items not yet on the server */}
        {(conv.channel === 'sms' || conv.channel === 'whatsapp') &&
          outbox.items
            .filter((i) => i.contact_id === contact.id && i.channel === conv.channel)
            .map((i) => {
              const state: DeliveryState = i.status === 'failed' ? 'failed' : 'sending';
              return (
                <div key={`outbox-${i.id}`} className="flex justify-end">
                  <div className="max-w-[82%] flex flex-col items-end gap-1">
                    <div className="flex flex-col gap-0.5 max-w-full">
                      <div
                        className={`px-3.5 py-2 rounded-2xl text-[14px] leading-snug whitespace-pre-wrap break-words shadow-sm bg-primary/70 text-primary-foreground rounded-br-md ${
                          state === 'failed' ? 'ring-1 ring-destructive/60' : ''
                        }`}
                      >
                        {i.body || <span className="italic opacity-60">(empty)</span>}
                      </div>
                      <span className="text-[10px] tabular-nums flex items-center gap-1.5 text-muted-foreground justify-end pr-1">
                        <DeliveryIndicator state={state} error={i.last_error} />
                        {state === 'failed' && (
                          <button
                            type="button"
                            onClick={() => outbox.retry(i.id)}
                            className="underline underline-offset-2 text-destructive hover:opacity-80"
                          >
                            Retry
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Composer launcher — opens the right dialog for this channel */}
      <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] flex items-center gap-2">
        <button
          onClick={() => setComposeOpen(true)}
          className="flex-1 h-11 rounded-full bg-muted/60 border border-border text-left px-4 text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted active:scale-[0.99] transition-all"
        >
          {conv.channel === 'email' ? `Reply by email…` : `Message ${name.split(' ')[0]}…`}
        </button>
        <button
          onClick={() => setComposeOpen(true)}
          aria-label="Compose"
          className="h-11 w-11 rounded-full flex items-center justify-center text-primary-foreground active:scale-95 transition-transform shadow-sm"
          style={{ background: 'hsl(var(--primary))' }}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Channel-specific composers — keep all logic centralized */}
      {conv.channel === 'email' && (
        <ComposeEmailDialog contact={contact} open={composeOpen} onOpenChange={setComposeOpen} />
      )}
      {(conv.channel === 'sms' || conv.channel === 'whatsapp') && (
        <SendTextDialog contact={contact} open={composeOpen} onOpenChange={setComposeOpen} />
      )}
    </div>
  );
}
