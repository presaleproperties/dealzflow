import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, MessageSquare, Phone, User2, Send, Loader2, Info } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { formatContactName, formatPhone } from '@/lib/format';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { SendTextDialog } from '@/components/crm/leads/SendTextDialog';
import type { CrmContact } from '@/hooks/useCrmContacts';

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

/**
 * Per-thread chat view — one conversation = one channel for one lead.
 * Email and SMS for the same contact appear as **separate** threads.
 *
 * Reuses the existing `ComposeEmailDialog` / `SendTextDialog` for sending,
 * so all template / signature / channel logic stays in one place.
 */
export default function CrmChatThreadPage() {
  const { conversationId = '' } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

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

  // Realtime — refetch on new message in this conversation
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`chat-thread-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'crm_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['crm-chat-thread-messages', conversationId] });
        qc.invalidateQueries({ queryKey: ['crm-chats'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, qc]);

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
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
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
    <div className="-mx-3 sm:-mx-4 -my-3 sm:-my-4 flex flex-col h-[calc(100vh-60px)]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border flex items-center gap-3 px-3 py-2.5">
        <button
          onClick={() => navigate('/crm/chats')}
          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors"
          aria-label="Back to chats"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
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

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4 bg-muted/10">
        {msgsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
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
                    return (
                      <div key={m.id} className="flex flex-col gap-0.5 max-w-full">
                        <div
                          className={`px-3.5 py-2 rounded-2xl text-[14px] leading-snug whitespace-pre-wrap break-words shadow-sm ${
                            outbound
                              ? 'bg-primary text-primary-foreground rounded-br-md'
                              : 'bg-card text-foreground border border-border rounded-bl-md'
                          }`}
                        >
                          {/* For email, content can include "Subject: ..." prefix from compose flow */}
                          {(m.content ?? '').trim() || <span className="italic opacity-60">(empty)</span>}
                        </div>
                        {isLast && (
                          <span className={`text-[10px] tabular-nums ${outbound ? 'text-muted-foreground text-right pr-1' : 'text-muted-foreground/80 pl-1'}`}>
                            {formatStamp(m.created_at)}
                            {outbound && m.sent_by ? <> · {m.sent_by}</> : null}
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
