import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, MessageSquare, Phone, Send, Info, WifiOff, Clock, AlertTriangle, Check, CheckCheck, AlertCircle, MailOpen, MoreHorizontal, Search as SearchIcon, X as XIcon, ChevronsDownUp, ChevronsUpDown, ListTree, Star, Archive, ArchiveRestore, Bell, BellOff, Clock4, MoreVertical } from 'lucide-react';
import { format, isToday, isYesterday, isSameDay, differenceInMinutes } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { formatContactName, formatPhone } from '@/lib/format';
import { ComposeEmailDialog } from '@/components/crm/leads/ComposeEmailDialog';
import { SendTextDialog } from '@/components/crm/leads/SendTextDialog';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { ChatThreadSkeleton, MessageBubbleSkeleton } from '@/components/crm/sms/ChatThreadSkeleton';
import { useOfflineOutbox } from '@/hooks/useOfflineOutbox';
import { EmailMessageView, buildReplyQuote, buildForwardQuote } from '@/components/crm/chats/EmailMessageView';
import { InlineEmailReplyBox } from '@/components/crm/chats/InlineEmailReplyBox';
import { InlineTextComposer, type InlineTextComposerHandle } from '@/components/crm/chats/InlineTextComposer';
import { MessageActionSheet, type MessageActionTarget } from '@/components/crm/chats/MessageActionSheet';
import { MobileLeadContextCard } from '@/components/crm/chats/MobileLeadContextCard';
import { NewMessagesPill } from '@/components/crm/chats/NewMessagesPill';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useLongPress } from '@/hooks/useLongPress';
import { useIsCompact } from '@/hooks/use-mobile';
import { useDialer } from '@/hooks/useDialer';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCrmInboxFlags, snoozePresets } from '@/hooks/useCrmInboxFlags';
import { toast } from 'sonner';

type Channel = 'email' | 'sms' | 'whatsapp';

interface ConversationRow {
  id: string;
  contact_id: string;
  channel: Channel;
  status: string | null;
  unread_count: number | null;
  last_message_at: string | null;
  is_starred?: boolean;
  is_archived?: boolean;
  snoozed_until?: string | null;
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

type ThreadQueryResult = { conv: ConversationRow; contact: CrmContact } | null;

function normalizeThreadData(data: any): ThreadQueryResult {
  if (!data) return null;
  if (data.conv && data.contact) return data as ThreadQueryResult;

  const contact = (Array.isArray(data.crm_contacts) ? data.crm_contacts[0] : data.crm_contacts) as CrmContact | undefined;
  if (!data.id || !data.contact_id || !data.channel || !contact) return null;

  return {
    conv: {
      id: data.id,
      contact_id: data.contact_id,
      channel: data.channel as Channel,
      status: data.status ?? null,
      unread_count: data.unread_count ?? 0,
      last_message_at: data.last_message_at ?? null,
      is_starred: data.is_starred ?? false,
      is_archived: data.is_archived ?? false,
      snoozed_until: data.snoozed_until ?? null,
    },
    contact,
  };
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

/** Editorial day separator label rendered between stacks when the day flips. */
function formatDayDivider(iso: string): string {
  const d = new Date(iso);
  if (isToday(d))     return `Today · ${format(d, 'h:mm a')}`;
  if (isYesterday(d)) return `Yesterday · ${format(d, 'h:mm a')}`;
  return format(d, 'EEEE, MMM d · h:mm a');
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

/**
 * Mobile-friendly bubble wrapper. On touch input the user can long-press
 * to open the bubble action sheet (Reply quote / Copy / Resend / Delete).
 * On non-touch devices the wrapper is just a pass-through `<div>`.
 */
function TouchBubble({
  children,
  className,
  onLongPress,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  onLongPress: () => void;
  disabled?: boolean;
}) {
  const handlers = useLongPress<HTMLDivElement>(() => onLongPress(), { delay: 420 });
  return (
    <div className={className} {...(disabled ? {} : handlers)}>
      {children}
    </div>
  );
}

export default function CrmChatThreadPage({ embedded = false }: CrmChatThreadPageProps = {}) {
  const { conversationId = '' } = useParams<{ conversationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  // Outlook-style subject filter: when set, only messages whose
  // crm_email_log.thread_id matches are rendered (else: full conversation).
  const filterThreadId = searchParams.get('thread');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePrefill, setComposePrefill] = useState<{
    subject?: string; bodyHtml?: string; cc?: string;
  } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  // Map<messageId, expanded?>. Missing = use default (last-message expanded).
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [jumpOpen, setJumpOpen] = useState(false);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { user } = useAuth();
  const inboxFlags = useCrmInboxFlags();
  const snoozeOptions = useMemo(() => snoozePresets(), []);
  // Offline outbox state (filtered by contact later, once thread loads)
  const outbox = useOfflineOutbox();

  // Auto-prune empty-body ghost items left over from older queue versions —
  // they would otherwise render forever as broken "(empty)" failed bubbles.
  useEffect(() => {
    const stale = outbox.items.filter((i) => !i.body || i.body.trim().length === 0);
    if (stale.length === 0) return;
    stale.forEach((i) => outbox.remove(i.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbox.items.length]);
  const isCompact = useIsCompact();
  const dialer = useDialer();

  // Composer handle — lets long-press "Quote reply" prefill the inline composer.
  const composerRef = useRef<InlineTextComposerHandle | null>(null);

  // Long-press action sheet target (mobile-only context menu for bubbles).
  const [actionTarget, setActionTarget] = useState<MessageActionTarget | null>(null);

  // Container ref consumed by the edge-swipe-back gesture for visual feedback.
  const containerRef = useRef<HTMLDivElement | null>(null);

  // iOS-style edge swipe-back: only on mobile, only when this view owns its
  // own back button (not embedded as the right pane on tablet/desktop).
  useEdgeSwipeBack(() => navigate('/crm/chats'), {
    enabled: isCompact && !embedded,
    targetRef: containerRef,
  });

  // Publish iOS soft-keyboard height as --keyboard-inset-bottom so the
  // thread shell shrinks above the keyboard in PWA and native shells.
  useKeyboardInset(!embedded && isCompact);

  // Hard-lock the document while this thread is mounted on mobile. With
  // `interactive-widget=overlays-content` iOS still tries to pan the layout
  // viewport up to keep the focused input visible. That pan + our pin-back
  // handler is what visually "slides the header/composer down" over ~300ms.
  // Removing the pan target entirely (position:fixed body) makes the keyboard
  // transition instant — only --keyboard-inset-bottom moves, nothing else.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (embedded || !isCompact) return;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyWidth: body.style.width,
      bodyHeight: body.style.height,
      bodyTop: body.style.top,
      bodyOverscroll: (body.style as any).overscrollBehavior,
    };
    const scrollY = window.scrollY;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.top = `-${scrollY}px`;
    (body.style as any).overscrollBehavior = 'none';
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.width = prev.bodyWidth;
      body.style.height = prev.bodyHeight;
      body.style.top = prev.bodyTop;
      (body.style as any).overscrollBehavior = prev.bodyOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, [embedded, isCompact]);

  // Conversation + joined contact
  const { data: rawThread, isLoading: threadLoading } = useQuery({
    queryKey: ['crm-chat-thread', conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<ThreadQueryResult> => {
      const { data, error } = await supabase
        .from('crm_conversations')
        .select(`id, contact_id, channel, status, unread_count, last_message_at,
                 is_starred, is_archived, snoozed_until,
                 crm_contacts!inner ( * )`)
        .eq('id', conversationId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const conv: ConversationRow = {
        id: data.id, contact_id: data.contact_id, channel: data.channel as Channel,
        status: data.status, unread_count: data.unread_count, last_message_at: data.last_message_at,
        is_starred: (data as any).is_starred ?? false,
        is_archived: (data as any).is_archived ?? false,
        snoozed_until: (data as any).snoozed_until ?? null,
      };
      const contact = (Array.isArray((data as any).crm_contacts) ? (data as any).crm_contacts[0] : (data as any).crm_contacts) as CrmContact;
      return { conv, contact };
    },
  });
  const thread = normalizeThreadData(rawThread);

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
  const channel = thread?.conv?.channel;
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

  // Cross-reference email-log rows so we can show real From/Subject/CC and
  // attachments on email bubbles instead of plain "Subject: ..." prefixes.
  const emailLogIds = useMemo(
    () => messages
      .filter((m) => m.channel === 'email' && m.source_table === 'crm_email_log' && m.source_id)
      .map((m) => m.source_id as string),
    [messages],
  );
  const { data: emailLogMap = {} } = useQuery({
    queryKey: ['crm-chat-thread-email-logs', conversationId, emailLogIds.length, emailLogIds.join('|')],
    enabled: emailLogIds.length > 0 && channel === 'email',
    queryFn: async (): Promise<Record<string, {
      subject: string | null; body: string | null; cc: string | null; bcc: string | null;
      sent_at: string | null; direction: string | null;
      thread_id: string | null; gmail_thread_id: string | null;
    }>> => {
      const { data, error } = await supabase
        .from('crm_email_log')
        .select('id, subject, body, cc, bcc, sent_at, direction, thread_id, gmail_thread_id')
        .in('id', emailLogIds);
      if (error) throw error;
      const map: Record<string, any> = {};
      for (const r of (data ?? [])) map[(r as any).id] = r;
      return map;
    },
  });

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

  // Initial scroll: when a thread is first opened (or the user switches
  // threads), jump straight to the most recent message — chat threads should
  // always open at the bottom, like iMessage / Gmail's mobile thread view.
  // Two rAFs so we measure AFTER images / email iframes have laid out their
  // first paint; otherwise scrollHeight is short and we land mid-thread.
  const initialScrollDoneRef = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!conversationId) return;
    if (messages.length === 0) return;
    if (initialScrollDoneRef.current === conversationId) return;
    initialScrollDoneRef.current = conversationId;
    const id1 = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        wasAtBottomRef.current = true;
      });
      (el as any).__pendingRaf = id2;
    });
    return () => {
      cancelAnimationFrame(id1);
      const id2 = (el as any).__pendingRaf;
      if (id2) cancelAnimationFrame(id2);
    };
  }, [conversationId, messages.length]);

  // Reset the initial-scroll guard when navigating to a different thread so
  // each thread gets its own one-shot bottom-pin on open.
  useEffect(() => {
    initialScrollDoneRef.current = null;
  }, [conversationId]);

  // Auto-scroll on new messages: only when the user is already near the
  // bottom. Otherwise the <NewMessagesPill /> takes over and we leave their
  // scroll position alone. Wrapped in rAF so we measure after the new bubble
  // has been laid out — this is what kills the visible "jump" when an inbound
  // message lands.
  const wasAtBottomRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = dist <= 160;
    wasAtBottomRef.current = nearBottom;
    if (!nearBottom) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages.length]);

  // Keyboard transition guard — when the visual viewport resizes (iOS keyboard
  // showing/hiding) the scroll container's clientHeight changes. We force-pin
  // to the bottom while the keyboard is opening so the newest messages stay
  // visible above the composer (iMessage / WhatsApp behavior). Once the
  // keyboard is fully open we revert to "only stick if near bottom" so a user
  // who scrolled up to read history isn't yanked back down.
  useEffect(() => {
    const el = scrollRef.current;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!el || !vv) return;
    let raf = 0;
    let lastVH = vv.height;
    let kbOpening = false;
    const pin = () => {
      raf = 0;
      el.scrollTop = el.scrollHeight;
    };
    const onResize = () => {
      const newVH = vv.height;
      // Viewport shrank → keyboard is opening. Force-pin regardless of position.
      if (newVH < lastVH - 50) {
        kbOpening = true;
        wasAtBottomRef.current = true;
      } else if (newVH > lastVH + 50) {
        // Keyboard closing: stop forcing.
        kbOpening = false;
      }
      lastVH = newVH;
      if (kbOpening || wasAtBottomRef.current) {
        if (!raf) raf = requestAnimationFrame(pin);
      } else {
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
        wasAtBottomRef.current = dist <= 160;
      }
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Native Capacitor keyboards can report their height via --kb-h without a
  // matching visualViewport resize event. Watch the root keyboard vars too so
  // mobile + tablet native shells still pin the newest messages above the IME.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof document === 'undefined') return;
    let raf = 0;
    const pinIfComposerFocused = () => {
      const active = document.activeElement as HTMLElement | null;
      if (!active?.closest('[data-chat-composer]')) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        raf = 0;
      });
    };
    const observer = new MutationObserver(pinIfComposerFocused);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-keyboard-open'] });
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // When the composer input gains focus, immediately pin to the bottom so the
  // most recent messages slide up with the keyboard instead of being hidden
  // behind it. Listens at document level since the composer lives in a sibling
  // subtree on mobile.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      const editable = (target as HTMLElement).isContentEditable;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !editable) return;
      // Only pin if the focused field is part of the composer (bottom of page).
      if (!target.closest('[data-chat-composer], form, footer')) return;
      wasAtBottomRef.current = true;
      // Several rAFs to ride through the keyboard animation on iOS.
      let count = 0;
      const tick = () => {
        el.scrollTop = el.scrollHeight;
        if (++count < 12) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);


  const contact = thread?.contact;
  const conv = thread?.conv;
  const meta = useMemo(() => channelMeta((conv?.channel ?? 'email') as Channel), [conv?.channel]);
  const name = contact
    ? (formatContactName(contact.first_name, contact.last_name) || contact.email || contact.phone || 'Unknown')
    : 'Unknown';
  const subline =
    conv?.channel === 'email' ? (contact?.email ?? 'No email')
    : (formatPhone(contact?.phone ?? null) || 'No phone');
  const Icon = meta.Icon;

  // Group consecutive same-direction messages into "stacks" for nicer bubbles
  const stacks: { direction: 'inbound' | 'outbound'; items: MessageRow[] }[] = [];
  for (const m of messages) {
    const last = stacks[stacks.length - 1];
    if (last && last.direction === m.direction) last.items.push(m);
    else stacks.push({ direction: m.direction, items: [m] });
  }

  // ---------- Email helpers (used only when channel === 'email') ----------

  /** Peel a leading "Subject: ...\n\n<body>" prefix from raw message content,
   *  and clean up the common case where an inbound webhook stripped HTML tags
   *  but left raw CSS (`/* ... *\/`, `body{...}`) inside the text. */
  const parseEmailContent = (raw: string | null | undefined): { subject: string | null; body: string } => {
    const s = (raw ?? '').trim();
    const m = s.match(/^Subject:\s*(.+?)\r?\n\r?\n([\s\S]*)$/i);
    let subject: string | null = null;
    let body = s;
    if (m) { subject = m[1].trim(); body = m[2]; }

    // If body has no real HTML tags but contains CSS-like rules, strip the
    // CSS so we don't render raw declarations as text.
    const hasTags = /<[a-z][\s\S]*?>/i.test(body);
    if (!hasTags) {
      body = body
        .replace(/\/\*[\s\S]*?\*\//g, ' ')                      // /* comments */
        .replace(/(?:^|\n)\s*[@a-z][\w\-,#.\s>:()]*\{[^}]*\}/gi, ' ') // CSS rules
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    return { subject, body };
  };

  /** Resolve the display name + email for a given message. */
  const resolveSender = (m: MessageRow): { name: string; email: string | null } => {
    if (m.direction === 'inbound') {
      return { name, email: contact.email ?? null };
    }
    const fallback = (user?.user_metadata as any)?.full_name
      || (user?.user_metadata as any)?.name
      || user?.email?.split('@')[0]
      || 'You';
    return { name: m.sent_by || fallback, email: user?.email ?? null };
  };

  /** Convert a message into the props EmailMessageView expects. */
  const buildEmailViewProps = (m: MessageRow) => {
    const log = m.source_id ? (emailLogMap as any)[m.source_id] : null;
    const fromMsg = parseEmailContent(m.content);
    const subject = log?.subject ?? fromMsg.subject;
    const body = log?.body ?? fromMsg.body;
    const sender = resolveSender(m);
    const toEmail = m.direction === 'inbound' ? (user?.email ?? null) : (contact.email ?? null);
    return {
      id: m.id,
      direction: m.direction,
      fromName: sender.name,
      fromEmail: sender.email,
      toEmail,
      subject,
      createdAt: m.created_at,
      html: body,
      text: body,
    };
  };

  // Filter messages by (a) optional ?thread=<id> Outlook-style subject filter
  // and (b) the in-thread search term. Email-only messages are kept when their
  // crm_email_log row's thread_id matches; non-email rows are dropped while a
  // thread filter is active (since those threads only exist for email).
  const filteredMessages = useMemo(() => {
    let base = messages;
    if (filterThreadId && channel === 'email') {
      base = base.filter((m) => {
        if (m.source_table !== 'crm_email_log' || !m.source_id) return false;
        const log = (emailLogMap as any)[m.source_id];
        return log?.thread_id === filterThreadId;
      });
    }
    if (!searchTerm.trim()) return base;
    const q = searchTerm.toLowerCase();
    return base.filter((m) => {
      const c = (m.content ?? '').toLowerCase();
      const log = m.source_id ? (emailLogMap as any)[m.source_id] : null;
      const subj = (log?.subject ?? '').toLowerCase();
      const body = (log?.body ?? '').toLowerCase();
      return c.includes(q) || subj.includes(q) || body.includes(q);
    });
  }, [messages, searchTerm, emailLogMap, filterThreadId, channel]);

  // ---------- Reply / Forward handlers ----------

  const openReply = useCallback((m: MessageRow, _all = false) => {
    const props = buildEmailViewProps(m);
    const subject = (props.subject || '').replace(/^(re:\s*)+/i, '');
    setComposePrefill({
      subject: subject ? `Re: ${subject}` : 'Re:',
      bodyHtml: buildReplyQuote({
        fromName: props.fromName,
        fromEmail: props.fromEmail,
        createdAt: props.createdAt,
        bodyHtml: props.html,
        bodyText: props.text,
      }),
    });
    setComposeOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailLogMap, contact, user, name]);

  const openForward = useCallback((m: MessageRow) => {
    const props = buildEmailViewProps(m);
    const subject = (props.subject || '').replace(/^(fwd?:\s*)+/i, '');
    setComposePrefill({
      subject: subject ? `Fwd: ${subject}` : 'Fwd:',
      bodyHtml: buildForwardQuote({
        fromName: props.fromName,
        fromEmail: props.fromEmail,
        toEmail: props.toEmail,
        subject: props.subject,
        createdAt: props.createdAt,
        bodyHtml: props.html,
        bodyText: props.text,
      }),
    });
    setComposeOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailLogMap, contact, user, name]);

  // ---------- Mark unread / read ----------

  const markThreadUnread = useCallback(async () => {
    if (!conv) return;
    const { error } = await supabase
      .from('crm_conversations')
      .update({ unread_count: 1 })
      .eq('id', conv.id);
    if (error) { toast.error('Could not mark unread'); return; }
    qc.invalidateQueries({ queryKey: ['crm-chats'] });
    toast.success('Marked unread');
    if (!embedded) navigate('/crm/chats');
  }, [conv, qc, embedded, navigate]);

  // ---------- Thread expand/collapse + jump-to-message ----------

  /** Resolve current expansion for a message (controlled override > default). */
  const isExpanded = useCallback((m: MessageRow, isLast: boolean) => {
    if (m.id in expandedMap) return expandedMap[m.id];
    return isLast;
  }, [expandedMap]);

  const setOneExpanded = useCallback((mid: string, next: boolean) => {
    setExpandedMap((prev) => ({ ...prev, [mid]: next }));
  }, []);

  const expandAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const m of filteredMessages) next[m.id] = true;
    setExpandedMap(next);
  }, [filteredMessages]);

  const collapseAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const m of filteredMessages) next[m.id] = false;
    setExpandedMap(next);
  }, [filteredMessages]);

  const jumpTo = useCallback((mid: string) => {
    setOneExpanded(mid, true);
    setJumpOpen(false);
    requestAnimationFrame(() => {
      const el = messageRefs.current[mid];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('ring-2', 'ring-primary/50');
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary/50'), 1400);
      }
    });
  }, [setOneExpanded]);

  // Detect "all expanded" state for the toolbar toggle icon
  const allExpanded = useMemo(() => {
    if (filteredMessages.length === 0) return false;
    return filteredMessages.every((m, i) => isExpanded(m, i === filteredMessages.length - 1));
  }, [filteredMessages, isExpanded]);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable = !!target && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      );
      if (isEditable) return;
      if (composeOpen) return;
      if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        if (searchOpen) { setSearchOpen(false); setSearchTerm(''); }
      } else if (e.key === 'r' && conv?.channel === 'email' && messages.length > 0) {
        e.preventDefault();
        const last = [...messages].reverse().find((mm) => mm.direction === 'inbound') ?? messages[messages.length - 1];
        openReply(last);
      } else if (e.key === 'f' && conv?.channel === 'email' && messages.length > 0) {
        e.preventDefault();
        openForward(messages[messages.length - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [composeOpen, searchOpen, conv?.channel, messages, openReply, openForward]);

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

  return (
    <div
      ref={containerRef}
        data-chat-thread-shell="true"
        data-chat-thread-embedded={embedded ? 'true' : undefined}
      className={
        embedded
          ? 'flex flex-col flex-1 min-h-0 h-full bg-background'
          // Phone/native: own the visual viewport with a bottom keyboard offset
          // so iOS cannot pan the header/composer behind the keyboard.
          : 'fixed top-0 left-0 right-0 bottom-[var(--chat-keyboard-bottom)] sm:relative sm:inset-auto flex flex-col flex-1 min-h-0 sm:h-full sm:-mx-4 sm:-my-4 bg-background overflow-hidden'
      }
      style={!embedded ? { '--chat-keyboard-bottom': 'max(var(--keyboard-offset, 0px), var(--keyboard-inset-bottom, 0px), var(--kb-h, 0px))' } as CSSProperties : undefined}
    >
      {/* Header */}
      <div
        data-chat-thread-header="true"
        className="shrink-0 z-20 bg-background/95 backdrop-blur border-b border-border flex items-center gap-2 px-3 py-2.5 native-chrome"
        style={!embedded ? { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' } : undefined}
      >
        {!embedded && (
          <button
            onClick={() => navigate('/crm/chats')}
            className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors shrink-0"
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
            <h1 className="text-[17px] md:text-[15px] font-semibold tracking-tight text-foreground truncate group-hover:text-primary transition-colors">
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
          <button
            type="button"
            onClick={() => dialer.startCall({
              contact: { id: contact.id, name, phone: contact.phone! },
              number: contact.phone!,
            })}
            disabled={dialer.status !== 'idle' && dialer.status !== 'ended'}
            aria-label={`Call ${name}`}
            className="h-9 w-9 rounded-full flex items-center justify-center text-emerald-600 hover:bg-emerald-500/10 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Phone className="w-4 h-4" />
          </button>
        )}
        {conv.channel === 'email' && (
          <>
            <button
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search this thread"
              className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors"
            >
              <SearchIcon className="w-4 h-4" />
            </button>
            <button
              onClick={markThreadUnread}
              aria-label="Mark unread"
              className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors"
            >
              <MailOpen className="w-4 h-4" />
            </button>
          </>
        )}
        <Link
          to={`/crm/leads/${contact.id}`}
          aria-label="Lead details"
          className="hidden min-[380px]:flex h-9 w-9 rounded-full items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted/60 transition-colors shrink-0"
        >
          <Info className="w-4 h-4" />
        </Link>
        <Link
          to={`/crm/leads/${contact.id}`}
          aria-label="Lead actions"
          className="min-[380px]:hidden h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:bg-muted/60 transition-colors shrink-0"
        >
          <MoreVertical className="w-4 h-4" />
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
              <button
                className="underline underline-offset-2 font-medium opacity-80 hover:opacity-100"
                onClick={() => mine.filter((i) => i.status === 'failed').forEach((i) => outbox.remove(i.id))}
              >Discard all</button>
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
      <div
        ref={scrollRef}
        data-thread-scroll
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-4 bg-muted/10 native-scroll"
        style={{
          paddingBottom: '0.75rem',
          // Browser-native scroll anchoring: when content above the viewport
          // changes height (typing indicator appears, image loads, inbound
          // bubble inserts), the browser preserves the visible anchor instead
          // of jumping. Combined with the rAF-gated auto-scroll above, this
          // is what makes the thread feel solid during keyboard transitions.
          overflowAnchor: 'auto',
          scrollBehavior: 'auto',
          // Edge-swipe-back visual feedback (mobile only). Applied here — NOT
          // on the outer container — because a transform on the composer's
          // ancestor breaks `position: sticky`'s ability to ride the keyboard.
          transform: 'translate3d(calc(var(--edge-swipe-progress, 0) * 16px), 0, 0)',
          transition: 'transform 120ms ease-out',
          willChange: 'transform',
        }}
      >
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
        ) : conv.channel === 'email' ? (
          // ---------- Email card list (Gmail-style) ----------
          <div className="max-w-[820px] mx-auto w-full space-y-3">
            {searchOpen && (
              <div className="sticky top-0 z-10 -mt-1 mb-1 flex items-center gap-2 px-2 py-2 rounded-xl bg-background/90 backdrop-blur border border-border/60">
                <SearchIcon className="w-4 h-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search this thread…"
                  className="flex-1 bg-transparent text-[13px] focus:outline-none"
                />
                <button
                  onClick={() => { setSearchOpen(false); setSearchTerm(''); }}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Close search"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Active "Outlook subject filter" banner */}
            {filterThreadId && channel === 'email' && (
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 mb-1 rounded-lg bg-primary/8 border border-primary/20 text-[12px]">
                <span className="text-foreground/85 truncate">
                  <Mail className="inline-block w-3 h-3 mr-1.5 -mt-0.5" />
                  Showing one subject thread · {filteredMessages.length} message{filteredMessages.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete('thread');
                    setSearchParams(next, { replace: true });
                  }}
                  className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                >
                  Show all <XIcon className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Thread toolbar — collapse/expand all + jump to message */}
            {filteredMessages.length > 1 && (
              <div className="flex items-center justify-between gap-2 px-1 pb-1">
                <div className="text-[12px] text-muted-foreground font-medium">
                  {filteredMessages.length} messages in thread
                </div>
                <div className="flex items-center gap-1 relative">
                  <button
                    type="button"
                    onClick={() => (allExpanded ? collapseAll() : expandAll())}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted/70 border border-border/40 transition-colors"
                    title={allExpanded ? 'Collapse all (only most recent stays open)' : 'Expand all messages'}
                  >
                    {allExpanded ? <ChevronsDownUp className="w-3 h-3" /> : <ChevronsUpDown className="w-3 h-3" />}
                    {allExpanded ? 'Collapse all' : 'Expand all'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setJumpOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted/70 border border-border/40 transition-colors"
                    aria-expanded={jumpOpen}
                    aria-haspopup="listbox"
                  >
                    <ListTree className="w-3 h-3" />
                    Jump to…
                  </button>
                  {jumpOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setJumpOpen(false)} aria-hidden />
                      <div
                        role="listbox"
                        className="absolute right-0 top-full mt-1.5 z-40 w-[300px] max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-popover shadow-lg p-1"
                      >
                        {filteredMessages.map((m, i) => {
                          const props = buildEmailViewProps(m);
                          const stamp = format(new Date(m.created_at), 'MMM d, h:mm a');
                          const subj = (props.subject || '(no subject)').replace(/^(re:|fwd?:)\s*/i, (s) => s.toUpperCase());
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => jumpTo(m.id)}
                              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-muted/60 transition-colors flex items-start gap-2"
                            >
                              <span className="shrink-0 w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center mt-0.5 tabular-nums">
                                {i + 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[12px] font-semibold text-foreground truncate">
                                  {props.fromName}
                                  {m.direction === 'outbound' && <span className="text-muted-foreground/70 font-normal"> · You</span>}
                                </span>
                                <span className="block text-[11px] text-muted-foreground truncate">{subj}</span>
                                <span className="block text-[10px] text-muted-foreground/70 tabular-nums mt-0.5">{stamp}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {filteredMessages.length === 0 ? (
              <p className="text-center text-[13px] text-muted-foreground py-6">No messages match “{searchTerm}”.</p>
            ) : filteredMessages.map((m, i) => {
              const isLast = i === filteredMessages.length - 1;
              const props = buildEmailViewProps(m);
              return (
                <div
                  key={m.id}
                  ref={(el) => { messageRefs.current[m.id] = el; }}
                  className="rounded-2xl transition-shadow scroll-mt-4"
                >
                  <EmailMessageView
                    {...props}
                    expanded={isExpanded(m, isLast)}
                    onExpandedChange={(next) => setOneExpanded(m.id, next)}
                    accentColor={meta.color}
                    onReply={() => openReply(m)}
                    onReplyAll={() => openReply(m, true)}
                    onForward={() => openForward(m)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {/* Mobile-only collapsible lead context (pipeline / tags / view lead) */}
            {isCompact && (
              <MobileLeadContextCard
                contact={contact}
                lastActivityAt={(contact as any).last_touch_at ?? conv.last_message_at}
              />
            )}
            {stacks.map((stack, si) => {
            const outbound = stack.direction === 'outbound';
            const stackFirstAt = stack.items[0]?.created_at;
            const prevStackLast = si > 0 ? stacks[si - 1].items[stacks[si - 1].items.length - 1] : null;
            // Show a day-divider when the day flips OR when there's a >45 min gap
            // between consecutive stacks (matches iMessage's "drift" behavior).
            const showDivider = stackFirstAt && (
              !prevStackLast ||
              !isSameDay(new Date(prevStackLast.created_at), new Date(stackFirstAt)) ||
              differenceInMinutes(new Date(stackFirstAt), new Date(prevStackLast.created_at)) > 45
            );
            return (
              <div key={si}>
                {showDivider && stackFirstAt && (
                  <div className="flex justify-center py-2">
                    <span className="text-[10.5px] tracking-wide uppercase text-muted-foreground/70 font-medium">
                      {formatDayDivider(stackFirstAt)}
                    </span>
                  </div>
                )}
                <div className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] sm:max-w-[68%] flex flex-col ${outbound ? 'items-end' : 'items-start'}`}>
                    {stack.items.map((m, mi) => {
                      const isLast = mi === stack.items.length - 1;
                      const isFirst = mi === 0;
                      const single = stack.items.length === 1;
                      // Per-bubble corner radii so a run reads as a single group.
                      // Outbound runs square the right edge between bubbles; inbound
                      // runs square the left edge. The free side stays fully rounded.
                      const corner = outbound
                        ? (single ? 'rounded-2xl rounded-br-md'
                          : isFirst ? 'rounded-2xl rounded-br-md'
                          : isLast  ? 'rounded-2xl rounded-tr-md rounded-br-md'
                          : 'rounded-l-2xl rounded-r-md')
                        : (single ? 'rounded-2xl rounded-bl-md'
                          : isFirst ? 'rounded-2xl rounded-bl-md'
                          : isLast  ? 'rounded-2xl rounded-tl-md rounded-bl-md'
                          : 'rounded-r-2xl rounded-l-md');

                      const isTrackable = outbound && (m.channel === 'sms' || m.channel === 'whatsapp') && m.source_table === 'crm_sms_log' && !!m.source_id;
                      const logEntry = isTrackable ? smsStatuses[m.source_id as string] : undefined;
                      const deliveryState: DeliveryState | null = isTrackable
                        ? normalizeStatus(logEntry?.status)
                        : (outbound && m.channel === 'email' ? 'sent' : null);
                      const deliveryError = logEntry?.error_message ?? null;
                      const isOptimistic = (m as any).__optimistic === true;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col max-w-full ${mi > 0 ? 'mt-[3px]' : ''} ${isOptimistic ? 'animate-in fade-in-0 zoom-in-95 duration-150' : 'animate-in fade-in-0 slide-in-from-bottom-1 duration-200'}`}
                        >
                          <TouchBubble
                            disabled={!isCompact}
                            onLongPress={() => setActionTarget({
                              id: m.id,
                              text: (m.content ?? '').trim(),
                              outbound,
                              failed: deliveryState === 'failed',
                              canDelete: outbound,
                            })}
                            className={`px-3.5 py-2 text-[14.5px] leading-[1.35] whitespace-pre-wrap break-words ${corner} ${
                              outbound
                                ? 'bg-primary text-primary-foreground shadow-[0_1px_1px_rgba(0,0,0,0.06)]'
                                : 'bg-card text-foreground border border-border/60'
                            } ${deliveryState === 'failed' ? 'ring-1 ring-destructive/60' : ''} ${isOptimistic ? 'opacity-90' : ''} select-text`}
                          >
                            {(m.content ?? '').trim() || <span className="italic opacity-60">(empty)</span>}
                          </TouchBubble>
                          {isLast && (
                            <span className={`mt-1 text-[10.5px] tabular-nums flex items-center gap-1.5 ${outbound ? 'text-muted-foreground/80 justify-end pr-1' : 'text-muted-foreground/70 pl-1'}`}>
                              <span>{formatStamp(m.created_at)}</span>
                              {outbound && m.sent_by ? <span aria-hidden className="text-muted-foreground/40">·</span> : null}
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
              </div>
            );
          })}
          </>
        )}

        {/* Ghost bubbles for offline outbox items not yet on the server.
            Empty-body items are skipped — they would render as "(empty)"
            placeholders which look broken. The banner above still surfaces
            the failure count and Retry-all action. */}
        {(conv.channel === 'sms' || conv.channel === 'whatsapp') &&
          outbox.items
            .filter((i) => i.contact_id === contact.id && i.channel === conv.channel)
            .filter((i) => !!(i.body && i.body.trim().length > 0))
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
                        {i.body}
                      </div>
                      <span className="text-[10px] tabular-nums flex items-center gap-1.5 text-muted-foreground justify-end pr-1">
                        <DeliveryIndicator state={state} error={i.last_error} />
                        {state === 'failed' && (
                          <>
                            <button
                              type="button"
                              onClick={() => outbox.retry(i.id)}
                              className="underline underline-offset-2 text-destructive hover:opacity-80"
                            >
                              Retry
                            </button>
                            <button
                              type="button"
                              onClick={() => outbox.remove(i.id)}
                              className="underline underline-offset-2 text-muted-foreground hover:opacity-80"
                            >
                              Discard
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Composer — inline for email (Gmail-style), launcher dialog for SMS/WhatsApp */}
      {conv.channel === 'email' ? (
        <InlineEmailReplyBox
          contact={contact}
          lastSubject={(() => {
            // Walk messages from the end and pick the first email subject we find.
            for (let i = messages.length - 1; i >= 0; i--) {
              const m = messages[i];
              const log = m.source_id ? (emailLogMap as any)[m.source_id] : null;
              const fromMsg = parseEmailContent(m.content);
              const subj = log?.subject ?? fromMsg.subject;
              if (subj) return subj;
            }
            return null;
          })()}
          onOpenFull={() => setComposeOpen(true)}
        />
      ) : (
        <InlineTextComposer
          ref={composerRef}
          contact={contact}
          channel={conv.channel as 'sms' | 'whatsapp'}
          conversationId={conv.id}
          onOpenFull={() => setComposeOpen(true)}
          onSent={() => {
            const drop = () => {
              const el = scrollRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
            };
            requestAnimationFrame(drop);
            setTimeout(drop, 90);
          }}
        />
      )}

      {/* Floating "↓ N new" pill — visible on SMS/WhatsApp threads when the
          user is scrolled away from the bottom and new messages arrive. */}
      {conv.channel !== 'email' && (
        <NewMessagesPill scrollRef={scrollRef} messagesCount={messages.length} />
      )}

      {/* Long-press action sheet (mobile only is enforced via TouchBubble's
          `disabled` prop, but the sheet itself is harmless on desktop). */}
      <MessageActionSheet
        target={actionTarget}
        onClose={() => setActionTarget(null)}
        onCopy={(t) => {
          try {
            void navigator.clipboard?.writeText(t.text);
            toast.success('Copied');
          } catch {
            toast.error('Could not copy');
          }
        }}
        onQuoteReply={(t) => composerRef.current?.quoteReply(t.text)}
        onResend={(t) => {
          // Find the original outbox / message and re-trigger via the composer.
          composerRef.current?.quoteReply(t.text);
          toast.message('Edit and tap send to retry');
        }}
        onDelete={async (t) => {
          // Soft delete: remove the message row. SMS-log row is left intact
          // so reporting / Twilio reconciliation isn't disturbed.
          const { error } = await supabase.from('crm_messages').delete().eq('id', t.id);
          if (error) { toast.error('Could not delete'); return; }
          toast.success('Message deleted');
          qc.invalidateQueries({ queryKey: ['crm-chat-thread-messages', conversationId] });
          qc.invalidateQueries({ queryKey: ['crm-chats'] });
        }}
      />

      {/* Channel-specific composers — full editor opens on demand for email
          (CC/BCC, attachments, templates) and is the only path for SMS/WhatsApp. */}
      {conv.channel === 'email' && (
        <ComposeEmailDialog
          contact={contact}
          open={composeOpen}
          onOpenChange={(o) => { setComposeOpen(o); if (!o) setComposePrefill(null); }}
          initialSubject={composePrefill?.subject}
          initialBodyHtml={composePrefill?.bodyHtml}
          initialCc={composePrefill?.cc}
        />
      )}
      {(conv.channel === 'sms' || conv.channel === 'whatsapp') && (
        <SendTextDialog
          contact={contact}
          open={composeOpen}
          onOpenChange={setComposeOpen}
          initialChannel={conv.channel as 'sms' | 'whatsapp'}
          conversationId={conv.id}
        />
      )}
    </div>
  );
}
