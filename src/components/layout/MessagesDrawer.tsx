/**
 * Editorial inbox drawer — global "Messages" surface accessible from the
 * right rail. Visually + functionally aligned with `/crm/chats`:
 *
 *  - hairline channel chips (no big circle FilterChips)
 *  - Pill primitive for unread / draft / snoozed badges
 *  - one row per (contact, channel), gold unread dot, channel chip on right
 *  - per-row hover actions (snooze, mark-read, pin, open full)
 *  - saved views dropdown (built-in + user views from useCrmInboxViews)
 *  - drafts surfaced via useDraftContactIds
 *  - server search (delegated to useCrmChats which already filters by query)
 *  - realtime: subscribes to crm_activity_events to invalidate the feed
 *  - empty state: "You're caught up"
 *  - mobile parity: opens as a bottom sheet (handled by the parent Sheet).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  X, Maximize2, Search, Pin, PinOff, MailOpen, Bell, BellOff,
  ExternalLink, Clock4, Bookmark, ChevronDown, MessageSquare,
} from 'lucide-react';
import { useChatPins, sortByPinned } from '@/hooks/useChatPins';
import { useCrmChats, type ChatThread, type ChatChannelFilter } from '@/hooks/useCrmChats';
import { useCrmInboxFlags, snoozePresets } from '@/hooks/useCrmInboxFlags';
import { useCrmInboxViews, type InboxView, type InboxViewFilters } from '@/hooks/useCrmInboxViews';
import { useDraftContactIds } from '@/hooks/useDraftContactIds';
import { supabase } from '@/integrations/supabase/client';
import { formatContactName } from '@/lib/format';
import { Pill } from '@/components/crm/shared/Pill';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  isCrmMember: boolean;
}

type ChannelChip = { id: ChatChannelFilter | 'unread'; label: string };

const CHANNEL_CHIPS: ChannelChip[] = [
  { id: 'all',      label: 'All' },
  { id: 'unread',   label: 'Unread' },
  { id: 'email',    label: 'Email' },
  { id: 'sms',      label: 'Text' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

// Default views — same set as CrmChatsPage for consistency.
const DEFAULT_VIEWS: { id: string; name: string; channel: ChatChannelFilter; filters: InboxViewFilters }[] = [
  { id: '__inbox',    name: 'Inbox',          channel: 'all', filters: {} },
  { id: '__unread',   name: 'Unread',         channel: 'all', filters: { unreadOnly: true } },
  { id: '__starred',  name: 'Pinned',         channel: 'all', filters: { starredOnly: true } },
  { id: '__failed',   name: 'Failed',         channel: 'all', filters: { hasFailures: true } },
];

function fmtTime(d?: string | null) {
  if (!d) return '';
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }); } catch { return ''; }
}

// Strip HTML / entities for email previews.
function cleanPreview(raw?: string | null) {
  if (!raw) return '';
  return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function channelLabel(c: ChatThread['channel']) {
  return c === 'email' ? 'Email' : c === 'whatsapp' ? 'WhatsApp' : 'Text';
}

function snoozedLabel(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return `Snoozed · ${formatDistanceToNow(new Date(iso), { addSuffix: true })}`;
  } catch { return null; }
}

export function MessagesDrawerContent({ open, onClose, isCrmMember }: Props) {
  const qc = useQueryClient();
  const [chip, setChip] = useState<ChannelChip['id']>('all');
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState<string>('__inbox');
  const [extraFilters, setExtraFilters] = useState<InboxViewFilters>({});

  // Map chip → server filter for useCrmChats
  const channelFilter: ChatChannelFilter = chip === 'unread' ? 'all' : chip;

  const { data: threads = [], isLoading } = useCrmChats(open ? channelFilter : undefined);
  const { views } = useCrmInboxViews();
  const { set: draftSet } = useDraftContactIds();
  const { pinned, isPinned, toggle: togglePin } = useChatPins();
  const flags = useCrmInboxFlags();

  // Realtime — when an activity event fires, refresh the feed so new messages
  // appear without manual refetch.
  useEffect(() => {
    if (!open) return;
    const ch = supabase
      .channel('messages-drawer-activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_activity_events' }, () => {
        qc.invalidateQueries({ queryKey: ['crm-chats'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, qc]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  // Counts for chip labels (computed from the loaded set — cheap)
  const counts = useMemo(() => {
    const c = { all: 0, unread: 0, email: 0, sms: 0, whatsapp: 0 } as Record<string, number>;
    for (const t of threads) {
      c.all += 1;
      if ((t.unread_count ?? 0) > 0) c.unread += 1;
      if (t.channel === 'email') c.email += 1;
      else if (t.channel === 'sms') c.sms += 1;
      else if (t.channel === 'whatsapp') c.whatsapp += 1;
    }
    return c;
  }, [threads]);

  // Apply view filters + search + chip locally
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = threads;

    if (chip === 'unread') list = list.filter(t => (t.unread_count ?? 0) > 0);

    if (extraFilters.unreadOnly) list = list.filter(t => (t.unread_count ?? 0) > 0);
    if (extraFilters.starredOnly) list = list.filter(t => (t as any).is_starred);
    if (extraFilters.hasFailures) list = list.filter(t => !!(t as any).last_failure_at);

    if (q) {
      list = list.filter(t => {
        const name = (formatContactName(t.first_name, t.last_name) || t.email || t.phone || '').toLowerCase();
        const preview = cleanPreview(t.last_message_preview).toLowerCase();
        const subject = (t.subject ?? '').toLowerCase();
        return name.includes(q) || preview.includes(q) || subject.includes(q)
          || (t.email ?? '').toLowerCase().includes(q)
          || (t.phone ?? '').toLowerCase().includes(q);
      });
    }

    return sortByPinned(list, pinned);
  }, [threads, chip, search, extraFilters, pinned]);

  const allViews: (Pick<InboxView, 'id' | 'name' | 'channel' | 'filters'> & { builtin?: boolean })[] = [
    ...DEFAULT_VIEWS.map(v => ({ ...v, builtin: true })),
    ...views.map(v => ({ id: v.id, name: v.name, channel: v.channel as ChatChannelFilter, filters: v.filters })),
  ];

  const activeViewName = allViews.find(v => v.id === activeView)?.name ?? 'Inbox';

  const applyView = (v: typeof allViews[number]) => {
    setActiveView(v.id);
    setExtraFilters(v.filters);
    if (v.channel === 'text') setChip('sms');
    else setChip(v.channel as ChannelChip['id']);
  };

  const totalUnread = counts.unread;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground">Messages</h2>
            {totalUnread > 0 && (
              <Pill tone="primary" size="sm">{totalUnread} unread</Pill>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-8 px-2 inline-flex items-center gap-1 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  aria-label="Saved views"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span className="max-w-[110px] truncate">{activeViewName}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                  Built-in
                </DropdownMenuLabel>
                {allViews.filter(v => v.builtin).map(v => (
                  <DropdownMenuItem key={v.id} onClick={() => applyView(v)} className="text-[13px]">
                    {v.name}
                  </DropdownMenuItem>
                ))}
                {allViews.some(v => !v.builtin) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                      Saved
                    </DropdownMenuLabel>
                    {allViews.filter(v => !v.builtin).map(v => (
                      <DropdownMenuItem key={v.id} onClick={() => applyView(v)} className="text-[13px]">
                        {v.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Link
              to={isCrmMember ? '/crm/chats' : '/dashboard'}
              onClick={onClose}
              className="w-8 h-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
              aria-label="Open full inbox"
              title="Open full inbox"
            >
              <Maximize2 className="w-4 h-4" />
            </Link>
            <button
              onClick={onClose}
              className="w-8 h-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, message…"
            className="w-full h-9 pl-8 pr-3 rounded-md border border-border/60 bg-background text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
        </div>

        {/* Channel chips */}
        <div className="flex items-center gap-1 mt-3 -mx-1 px-1 overflow-x-auto no-scrollbar">
          {CHANNEL_CHIPS.map(c => {
            const n = counts[c.id as keyof typeof counts] ?? 0;
            const active = chip === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setChip(c.id)}
                className={cn(
                  'shrink-0 h-7 px-2.5 rounded-full inline-flex items-center gap-1.5 text-[11.5px] font-medium tracking-tight transition-colors border',
                  active
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : 'bg-transparent text-muted-foreground border-border/50 hover:text-foreground hover:border-border',
                )}
              >
                {c.label}
                {n > 0 && (
                  <span className={cn(
                    'tabular-nums text-[10.5px]',
                    active ? 'text-primary/80' : 'text-muted-foreground/70',
                  )}>{n > 99 ? '99+' : n}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 min-h-0">
        {isLoading ? (
          <div className="text-center text-[12px] text-muted-foreground py-10">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState query={search} onClear={() => setSearch('')} onClose={onClose} />
        ) : (
          <ul className="py-1">
            {filtered.slice(0, 80).map(t => (
              <ConversationRow
                key={t.id}
                t={t}
                isPinned={isPinned(t.id)}
                hasDraft={draftSet.has(t.contact_id)}
                onTogglePin={() => togglePin(t.id)}
                onMarkRead={() => flags.markRead(t.id).then(() => toast.success('Marked read'))}
                onSnooze={(iso) => flags.snooze(t.id, iso).then(() => toast.success(iso ? 'Snoozed' : 'Unsnoozed'))}
                onOpen={onClose}
              />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function EmptyState({ query, onClear, onClose }: { query: string; onClear: () => void; onClose: () => void }) {
  if (query) {
    return (
      <div className="text-center py-12 px-6">
        <p className="text-[13px] text-foreground font-medium">No matches for "{query}"</p>
        <button
          onClick={onClear}
          className="mt-2 text-[12px] text-primary hover:underline"
        >
          Clear search
        </button>
      </div>
    );
  }
  return (
    <div className="text-center py-14 px-6">
      <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 border border-primary/20 inline-flex items-center justify-center">
        <MessageSquare className="w-5 h-5 text-primary" strokeWidth={1.6} />
      </div>
      <p className="mt-3 text-[14px] font-semibold text-foreground tracking-tight">You're caught up</p>
      <p className="mt-1 text-[12px] text-muted-foreground">Nothing to triage right now.</p>
      <Link
        to="/crm/chats/new"
        onClick={onClose}
        className="inline-flex items-center gap-1 mt-3 text-[12px] text-primary hover:underline"
      >
        Start a new conversation <ExternalLink className="w-3 h-3" />
      </Link>
    </div>
  );
}

function ConversationRow({
  t, isPinned, hasDraft, onTogglePin, onMarkRead, onSnooze, onOpen,
}: {
  t: ChatThread;
  isPinned: boolean;
  hasDraft: boolean;
  onTogglePin: () => void;
  onMarkRead: () => void;
  onSnooze: (iso: string | null) => void;
  onOpen: () => void;
}) {
  const name = formatContactName(t.first_name, t.last_name) || t.email || t.phone || 'Unknown';
  const unread = (t.unread_count ?? 0) > 0;
  const snoozeText = snoozedLabel(t.snoozed_until);
  const previewText = t.subject || cleanPreview(t.last_message_preview) || '(no messages yet)';
  const prefix = !t.subject && t.last_message_direction === 'outbound' ? 'You: ' : '';

  return (
    <li className="relative group/row">
      <Link
        to={`/crm/chats/${t.id}`}
        onClick={onOpen}
        className={cn(
          'flex items-start gap-2.5 px-4 py-3 border-b border-border/40 transition-colors',
          'crm-row-hover',
          unread && 'bg-primary/[0.025]',
        )}
      >
        {/* Gold unread dot rail */}
        <span
          className={cn(
            'mt-1.5 w-1.5 h-1.5 rounded-full shrink-0',
            unread ? 'bg-primary' : 'bg-transparent',
          )}
        />

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {isPinned && (
                <Pin className="w-3 h-3 text-primary -rotate-45 shrink-0" strokeWidth={2.6} />
              )}
              <span
                className={cn(
                  'text-[13px] truncate tracking-tight',
                  unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/85',
                )}
              >
                {name}
              </span>
            </div>
            <span className="text-[10.5px] text-muted-foreground/70 tabular-nums shrink-0">
              {fmtTime(t.last_message_at)}
            </span>
          </div>

          <div
            className={cn(
              'text-[11.5px] line-clamp-1 mt-0.5 leading-snug',
              unread ? 'text-foreground/80' : 'text-muted-foreground',
            )}
          >
            {prefix}{previewText}
          </div>

          {/* Meta chips */}
          <div className="flex items-center flex-wrap gap-1 mt-1.5">
            <Pill tone={t.channel === 'email' ? 'info' : t.channel === 'whatsapp' ? 'success' : 'neutral'} size="sm">
              {channelLabel(t.channel)}
            </Pill>
            {hasDraft && (
              <Pill tone="warning" size="sm">Draft</Pill>
            )}
            {snoozeText && (
              <Pill tone="muted" size="sm">
                <Clock4 className="w-2.5 h-2.5" />
                {snoozeText.replace(/^Snoozed · /, '')}
              </Pill>
            )}
          </div>
        </div>
      </Link>

      {/* Hover row actions */}
      <div className="absolute right-2 top-2 hidden group-hover/row:flex group-focus-within/row:flex items-center gap-0.5 bg-background/95 backdrop-blur-sm border border-border/60 rounded-full px-1 py-0.5 shadow-sm">
        <SnoozeBtn isSnoozed={!!snoozeText} onSnooze={onSnooze} />
        {unread && (
          <RowIconBtn title="Mark read" onClick={onMarkRead}>
            <MailOpen className="w-3.5 h-3.5" />
          </RowIconBtn>
        )}
        <RowIconBtn title={isPinned ? 'Unpin' : 'Pin to top'} onClick={onTogglePin}>
          {isPinned ? <PinOff className="w-3.5 h-3.5 text-primary" /> : <Pin className="w-3.5 h-3.5 -rotate-45" />}
        </RowIconBtn>
      </div>
    </li>
  );
}

function RowIconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick(); }}
      title={title}
      aria-label={title}
      className="w-6 h-6 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70"
    >
      {children}
    </button>
  );
}

function SnoozeBtn({ isSnoozed, onSnooze }: { isSnoozed: boolean; onSnooze: (iso: string | null) => void }) {
  const presets = useMemo(() => snoozePresets(), []);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
          title="Snooze"
          aria-label="Snooze"
          className="w-6 h-6 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70"
        >
          {isSnoozed
            ? <Bell className="w-3.5 h-3.5 text-amber-500" />
            : <BellOff className="w-3.5 h-3.5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1" onClick={(e) => e.stopPropagation()}>
        {presets.map(p => (
          <button
            key={p.id}
            onClick={() => onSnooze(p.iso)}
            className="w-full text-left px-2.5 py-2 rounded-md hover:bg-muted text-[13px] flex items-center gap-2"
          >
            <Clock4 className="w-3.5 h-3.5 text-muted-foreground" /> {p.label}
          </button>
        ))}
        {isSnoozed && (
          <>
            <div className="h-px my-1 bg-border" />
            <button
              onClick={() => onSnooze(null)}
              className="w-full text-left px-2.5 py-2 rounded-md hover:bg-muted text-[13px] flex items-center gap-2 text-amber-600 dark:text-amber-400"
            >
              <Bell className="w-3.5 h-3.5" /> Unsnooze now
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
