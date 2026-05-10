import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Search, Mail, MessageSquare, X, Sparkles, CornerUpLeft, SlidersHorizontal,
  Paperclip, Archive, Clock4, MailOpen, MoreHorizontal, BookmarkPlus,
  Trash2, AlertCircle, CheckSquare, Square, ArchiveRestore, BellOff, Bell,
  ChevronRight, ChevronDown, Pin, PinOff,
} from 'lucide-react';
import { format, isThisWeek, isToday, isYesterday } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useCrmChats, type ChatChannel, type ChatChannelFilter } from '@/hooks/useCrmChats';
import { useCrmInboxFlags, snoozePresets } from '@/hooks/useCrmInboxFlags';
import { useCrmInboxViews, type InboxView, type InboxViewFilters } from '@/hooks/useCrmInboxViews';
import { usePrefetchChatThread } from '@/hooks/usePrefetchCrm';
import { useEmailThreadsForContact } from '@/hooks/useEmailThreadsForContact';
import { formatContactName } from '@/lib/format';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { InboxEmpty } from '@/components/crm/inbox/InboxEmpty';
import { ChannelGreenLight } from '@/components/crm/shared/LiveStatusBar';
import { useChatPins } from '@/hooks/useChatPins';

/**
 * Strip HTML, collapse whitespace, decode common entities so email previews
 * don't render as raw markup. Drops quoted ">"-prefixed lines and "On … wrote:"
 * headers that bloat the snippet with no signal.
 */
function cleanPreview(raw?: string | null): string {
  if (!raw) return '';
  let s = String(raw);
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<\/?(br|p|div|li|tr|h[1-6])[^>]*>/gi, ' ');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.split('\n').filter(l => !/^\s*>/.test(l) && !/^On .+wrote:\s*$/i.test(l)).join(' ');
  return s.replace(/\s+/g, ' ').trim();
}

function smartTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, 'EEE');
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return format(d, sameYear ? 'MMM d' : 'MMM d, yy');
}

function snoozedLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (d.getTime() <= Date.now()) return null;
  if (isToday(d))     return `Snoozed · ${format(d, 'h:mm a')}`;
  if (isYesterday(d)) return 'Snoozed';
  return `Snoozed · ${format(d, 'MMM d, h:mm a')}`;
}

const FILTERS: { id: ChatChannelFilter; label: string }[] = [
  { id: 'all',   label: 'All' },
  { id: 'email', label: 'Email' },
  { id: 'text',  label: 'Text' },
];

function initialsFromName(first?: string | null, last?: string | null, fallback?: string | null): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (f || l) return `${f[0] ?? ''}${l[0] ?? ''}`.toUpperCase() || '?';
  if (fallback) return fallback.slice(0, 2).toUpperCase();
  return '?';
}

function avatarGradient(id: string): string {
  const palette = [
    ['hsl(38 88% 58%)',  'hsl(28 85% 48%)'],
    ['hsl(355 78% 62%)', 'hsl(345 70% 50%)'],
    ['hsl(155 55% 48%)', 'hsl(165 55% 38%)'],
    ['hsl(220 75% 62%)', 'hsl(232 70% 52%)'],
    ['hsl(265 60% 62%)', 'hsl(280 55% 50%)'],
    ['hsl(195 75% 52%)', 'hsl(210 70% 44%)'],
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const [a, b] = palette[h % palette.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

function channelChip(c: ChatChannel) {
  switch (c) {
    case 'sms':      return { Icon: MessageSquare, color: 'hsl(199 89% 48%)', label: 'SMS' };
    case 'whatsapp': return { Icon: MessageSquare, color: 'hsl(155 60% 45%)', label: 'WhatsApp' };
    case 'email':
    default:         return { Icon: Mail,          color: 'hsl(220 75% 55%)', label: 'Email' };
  }
}

type DateRangeKey = 'any' | 'today' | '7d' | '30d' | 'custom';

export default function CrmChatsPage() {
  const navigate = useNavigate();
  const { conversationId: activeId } = useParams<{ conversationId?: string }>();
  const prefetchThread = usePrefetchChatThread();
  const flags = useCrmInboxFlags();
  const { views, create: createView, remove: removeView } = useCrmInboxViews();

  const [filter, setFilter] = useState<ChatChannelFilter>('all');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sender, setSender] = useState('');
  const [subject, setSubject] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeKey>('any');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [attachmentsOnly, setAttachmentsOnly] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [hasFailures, setHasFailures] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);

  // Bulk-select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { if (!selectMode) setSelected(new Set()); }, [selectMode]);

  // Per-row hover/menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // Outlook-style expanded email rows: contact_id → expanded?
  const [expandedEmail, setExpandedEmail] = useState<Set<string>>(new Set());

  const { data: threads = [], isLoading } = useCrmChats(filter, { showArchived, showCampaigns });

  const dateBounds = useMemo<{ from: number | null; to: number | null }>(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    if (dateRange === 'today') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      return { from: start.getTime(), to: null };
    }
    if (dateRange === '7d') return { from: now - 7 * day, to: null };
    if (dateRange === '30d') return { from: now - 30 * day, to: null };
    if (dateRange === 'custom') {
      const f = customFrom ? new Date(customFrom).getTime() : null;
      const t = customTo ? new Date(customTo + 'T23:59:59').getTime() : null;
      return { from: f, to: t };
    }
    return { from: null, to: null };
  }, [dateRange, customFrom, customTo]);

  // Pin-to-top: shared store across page + right-rail drawer.
  const { pinned, isPinned, toggle: togglePinId, pinMany } = useChatPins();
  const togglePin = (id: string) => {
    const wasPinned = isPinned(id);
    togglePinId(id);
    toast.success(wasPinned ? 'Unpinned' : 'Pinned to top');
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const sndr = sender.trim().toLowerCase();
    const subj = subject.trim().toLowerCase();
    const list = threads.filter(t => {
      const name = formatContactName(t.first_name, t.last_name).toLowerCase();
      const email = (t.email ?? '').toLowerCase();
      const phone = t.phone ?? '';
      const preview = cleanPreview(t.last_message_preview).toLowerCase();
      const tSubject = (t.subject ?? '').toLowerCase();

      if (s) {
        const inAny = name.includes(s) || email.includes(s) || phone.includes(s)
          || preview.includes(s) || tSubject.includes(s);
        if (!inAny) return false;
      }
      if (sndr && !(name.includes(sndr) || email.includes(sndr) || phone.includes(sndr))) return false;
      if (subj && !tSubject.includes(subj)) return false;
      if (unreadOnly && (t.unread_count ?? 0) === 0) return false;
      if (attachmentsOnly && !t.has_attachment) return false;
      if (starredOnly && !t.is_starred) return false;
      if (hasFailures) {
        const s2 = (t.last_outbound_status ?? '').toLowerCase();
        if (s2 !== 'failed' && s2 !== 'undelivered') return false;
      }
      if (dateBounds.from || dateBounds.to) {
        const ts = t.last_message_at ? new Date(t.last_message_at).getTime() : 0;
        if (dateBounds.from && ts < dateBounds.from) return false;
        if (dateBounds.to && ts > dateBounds.to) return false;
      }
      return true;
    });
    // Stable sort: pinned to top, otherwise preserve original order from server.
    return list.sort((a, b) => {
      const ap = pinned.has(a.id) ? 1 : 0;
      const bp = pinned.has(b.id) ? 1 : 0;
      return bp - ap;
    });
  }, [threads, search, sender, subject, unreadOnly, attachmentsOnly, starredOnly, hasFailures, dateBounds, pinned]);

  const activeFilterCount =
    (sender ? 1 : 0) + (subject ? 1 : 0) + (dateRange !== 'any' ? 1 : 0)
    + (unreadOnly ? 1 : 0) + (attachmentsOnly ? 1 : 0) + (starredOnly ? 1 : 0)
    + (hasFailures ? 1 : 0);

  const clearFilters = () => {
    setSender(''); setSubject(''); setDateRange('any');
    setCustomFrom(''); setCustomTo('');
    setUnreadOnly(false); setAttachmentsOnly(false);
    setStarredOnly(false); setHasFailures(false);
  };

  const counts = useMemo(() => {
    const c: Record<ChatChannelFilter, number> = { all: 0, email: 0, sms: 0, whatsapp: 0, text: 0 };
    for (const t of threads) {
      const u = t.unread_count ?? 0;
      c.all += u;
      c[t.channel] += u;
      if (t.channel === 'sms' || t.channel === 'whatsapp') c.text += u;
    }
    return c;
  }, [threads]);

  // Apply a saved view
  const applyView = (v: InboxView) => {
    setFilter(v.channel);
    setSearch(v.query ?? '');
    const f: InboxViewFilters = v.filters ?? {};
    setSender(f.sender ?? '');
    setSubject(f.subject ?? '');
    setDateRange((f.dateRange ?? 'any') as DateRangeKey);
    setCustomFrom(f.customFrom ?? '');
    setCustomTo(f.customTo ?? '');
    setUnreadOnly(!!f.unreadOnly);
    setAttachmentsOnly(!!f.attachmentsOnly);
    setStarredOnly(!!f.starredOnly);
    setHasFailures(!!f.hasFailures);
    setShowArchived(!!f.showArchived);
    setShowCampaigns(!!f.showCampaigns);
    setActiveViewId(v.id);
  };

  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  // Built-in (system) views surfaced as chips alongside user views
  const builtinViews = useMemo(() => [
    { id: '__inbox',    name: 'Inbox',    channel: 'all' as ChatChannelFilter, filters: {} as InboxViewFilters },
    { id: '__unread',   name: 'Unread',   channel: 'all' as ChatChannelFilter, filters: { unreadOnly: true } as InboxViewFilters },
    { id: '__starred',  name: 'Starred',  channel: 'all' as ChatChannelFilter, filters: { starredOnly: true } as InboxViewFilters },
    { id: '__failed',   name: 'Failed',   channel: 'all' as ChatChannelFilter, filters: { hasFailures: true } as InboxViewFilters },
    { id: '__campaigns', name: 'Campaigns', channel: 'all' as ChatChannelFilter, filters: { showCampaigns: true } as InboxViewFilters },
    { id: '__archive',  name: 'Archived', channel: 'all' as ChatChannelFilter, filters: { showArchived: true } as InboxViewFilters },
  ], []);
  const applyBuiltin = (b: typeof builtinViews[number]) => {
    setFilter(b.channel);
    setSearch('');
    setSender(''); setSubject(''); setDateRange('any');
    setCustomFrom(''); setCustomTo('');
    setUnreadOnly(!!b.filters.unreadOnly);
    setAttachmentsOnly(!!b.filters.attachmentsOnly);
    setStarredOnly(!!b.filters.starredOnly);
    setHasFailures(!!b.filters.hasFailures);
    setShowArchived(!!b.filters.showArchived);
    setShowCampaigns(!!b.filters.showCampaigns);
    setActiveViewId(b.id);
  };
  // Default to Inbox on first mount
  useEffect(() => { if (activeViewId == null) setActiveViewId('__inbox'); }, [activeViewId]);

  // Keyboard navigation
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => { setCursor(0); }, [filter, search, sender, subject, unreadOnly, attachmentsOnly, dateRange, customFrom, customTo, starredOnly, hasFailures, showArchived]);

  useEffect(() => {
    const isTyping = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !isTyping(e.target))) {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
        return;
      }
      if (e.key === 'Escape') {
        if (selectMode) { setSelectMode(false); return; }
        if (search) { setSearch(''); return; }
        if (searchOpen) { setSearchOpen(false); return; }
      }
      if (isTyping(e.target)) return;
      if (filtered.length === 0) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor(c => Math.min(filtered.length - 1, c + 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor(c => Math.max(0, c - 1));
      } else if (e.key === 'Enter') {
        const t = filtered[cursor];
        if (t) navigate(`/crm/chats/${t.id}`);
      } else if (e.key === 'x') {
        // Toggle select on cursor row (Gmail-style)
        const t = filtered[cursor];
        if (!t) return;
        e.preventDefault();
        setSelectMode(true);
        setSelected(prev => {
          const next = new Set(prev); if (next.has(t.id)) next.delete(t.id); else next.add(t.id); return next;
        });
      } else if (e.key === 'e') {
        const t = filtered[cursor]; if (!t) return; e.preventDefault();
        flags.archive(t.id, !t.is_archived);
      } else if (e.key === 's') {
        const t = filtered[cursor]; if (!t) return; e.preventDefault();
        flags.star(t.id, !t.is_starred);
      } else if (e.key === 'u') {
        const t = filtered[cursor]; if (!t) return; e.preventDefault();
        if ((t.unread_count ?? 0) > 0) flags.markRead(t.id); else flags.markUnread(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, cursor, navigate, search, searchOpen, selectMode, flags]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  // Save current state as a view
  const [savePopOpen, setSavePopOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const handleSaveView = async () => {
    if (!newViewName.trim()) { toast.error('Name your view'); return; }
    await createView.mutateAsync({
      name: newViewName.trim(),
      channel: filter,
      query: search,
      filters: {
        sender, subject, dateRange, customFrom, customTo,
        unreadOnly, attachmentsOnly, starredOnly, hasFailures, showArchived,
      },
      pinned: true,
    });
    setNewViewName(''); setSavePopOpen(false);
  };

  // Bulk-action helpers
  const selectedIds = Array.from(selected);
  const allOnPageSelected = filtered.length > 0 && filtered.every(t => selected.has(t.id));
  const toggleSelectAll = () => {
    setSelected(prev => {
      if (allOnPageSelected) return new Set();
      const next = new Set(prev);
      filtered.forEach(t => next.add(t.id));
      return next;
    });
  };

  const bulkDone = (msg: string) => {
    toast.success(msg);
    setSelected(new Set());
    setSelectMode(false);
  };

  return (
    <div className="flex flex-1 min-h-0 h-full flex-col">
      <div className="hidden md:block px-3 sm:px-4 pt-2">
        <ChannelGreenLight />
      </div>
      {/* Premium glassmorphic header */}
      <div className="-mx-3 sm:-mx-4 sticky top-0 z-20 bg-background/85 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-2">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold text-foreground tracking-[-0.02em] leading-none">Chats</h1>
            <p className="hidden sm:block text-[11px] text-muted-foreground mt-1 font-medium">
              {selectMode && selected.size > 0
                ? <><span className="text-primary font-bold">{selected.size}</span> selected</>
                : counts.all > 0
                  ? <><span className="text-primary font-bold">{counts.all}</span> unread · {threads.length} total</>
                  : <>{threads.length} {threads.length === 1 ? 'conversation' : 'conversations'}</>
              }
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost" size="icon"
              onClick={() => setSelectMode(v => !v)}
              className={`h-10 w-10 rounded-full ${selectMode ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
              aria-label="Select threads"
              title="Select (x)"
            >
              {selectMode ? <CheckSquare className="w-[18px] h-[18px]" strokeWidth={2} /> : <Square className="w-[18px] h-[18px]" strokeWidth={2} />}
            </Button>
            <Button
              variant="ghost" size="icon"
              onClick={() => setFiltersOpen(v => !v)}
              className={`relative h-10 w-10 rounded-full ${filtersOpen || activeFilterCount > 0 ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
              aria-label="Filters" aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="w-[18px] h-[18px]" strokeWidth={2} />
              {activeFilterCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center shadow-sm tabular-nums">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button
              variant="ghost" size="icon"
              onClick={() => { setSearchOpen(v => !v); if (searchOpen) setSearch(''); }}
              className={`h-10 w-10 rounded-full ${searchOpen || search ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
              aria-label="Search chats"
            >
              {searchOpen ? <X className="w-5 h-5" strokeWidth={2.2} /> : <Search className="w-5 h-5" strokeWidth={2} />}
            </Button>
          </div>
        </div>

        {/* Contextual action bar — only renders once at least one row is
            selected. Floats above the bottom nav so the header stays clean. */}
        {selectMode && selected.size > 0 && (
          <div
            className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-full border border-border/60 bg-background/95 backdrop-blur shadow-lg px-1.5 py-1"
            style={{ bottom: 'calc(var(--bottom-nav-pad, 16px) + 12px)' }}
          >
            <span className="px-2.5 text-[11.5px] font-semibold tabular-nums text-foreground">
              {selected.size}
            </span>
            <span className="h-5 w-px bg-border/60" />
            <BulkBtn title="Mark read" onClick={async () => { await flags.markRead(selectedIds); bulkDone('Marked read'); }}>
              <MailOpen className="w-4 h-4" />
            </BulkBtn>
            <BulkBtn title="Pin to top" onClick={() => { pinMany(selectedIds, true); bulkDone('Pinned'); }}>
              <Pin className="w-4 h-4" />
            </BulkBtn>
            <BulkBtn title={showArchived ? 'Restore' : 'Archive'}
              onClick={async () => {
                if (showArchived) { await flags.archive(selectedIds, false); bulkDone('Restored'); }
                else { await flags.archive(selectedIds, true); bulkDone('Archived'); }
              }}>
              {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </BulkBtn>
            <BulkBtn title="Delete"
              tone="destructive"
              onClick={async () => {
                const n = selectedIds.length;
                if (!window.confirm(`Delete ${n} chat${n === 1 ? '' : 's'}? Underlying emails and texts are preserved — only the inbox conversation is removed.`)) return;
                await flags.remove(selectedIds);
                bulkDone(`Deleted ${n}`);
              }}>
              <Trash2 className="w-4 h-4" />
            </BulkBtn>
            <span className="h-5 w-px bg-border/60" />
            <button
              onClick={toggleSelectAll}
              className="h-8 px-2.5 rounded-full text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              {allOnPageSelected ? 'Clear' : 'All'}
            </button>
          </div>
        )}

        {searchOpen && (
          <div className="px-4 pb-2.5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
              <input
                ref={searchRef} type="search" autoFocus
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, or message…  (⌘K)"
                className="w-full h-11 pl-10 pr-16 rounded-xl bg-muted/60 border border-border/40 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
              />
              <kbd className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center h-5 px-1.5 rounded border border-border/60 bg-background/80 text-[10px] font-medium text-muted-foreground tabular-nums">esc</kbd>
            </div>
          </div>
        )}

        {filtersOpen && (
          <div className="px-4 pb-3 space-y-2.5 border-t border-border/40 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={sender} onChange={(e) => setSender(e.target.value)}
                placeholder="From sender / email…"
                className="w-full h-9 px-3 rounded-lg bg-muted/60 border border-border/40 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject contains…"
                className="w-full h-9 px-3 rounded-lg bg-muted/60 border border-border/40 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {([
                { id: 'any',    label: 'Any time' },
                { id: 'today',  label: 'Today' },
                { id: '7d',     label: '7 days' },
                { id: '30d',    label: '30 days' },
                { id: 'custom', label: 'Custom' },
              ] as { id: DateRangeKey; label: string }[]).map(opt => {
                const active = dateRange === opt.id;
                return (
                  <button key={opt.id} onClick={() => setDateRange(opt.id)}
                    className={`h-7 px-2.5 rounded-full text-[11px] font-semibold transition-colors ${
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:text-foreground border border-border/40'
                    }`}>
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {dateRange === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-9 px-3 rounded-lg bg-muted/60 border border-border/40 text-[13px] text-foreground" />
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="h-9 px-3 rounded-lg bg-muted/60 border border-border/40 text-[13px] text-foreground" />
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <FilterChip active={unreadOnly} onClick={() => setUnreadOnly(v => !v)}>
                  <span className={`w-1.5 h-1.5 rounded-full ${unreadOnly ? 'bg-primary-foreground' : 'bg-primary'}`} />
                  Unread
                </FilterChip>
                <FilterChip active={attachmentsOnly} onClick={() => setAttachmentsOnly(v => !v)}>
                  <Paperclip className="w-3 h-3" strokeWidth={2.4} /> Attachments
                </FilterChip>
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground">Clear all</button>
                )}
                <Popover open={savePopOpen} onOpenChange={setSavePopOpen}>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary/15 border border-primary/30">
                      <BookmarkPlus className="w-3 h-3" /> Save view
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 p-2">
                    <p className="text-[11px] text-muted-foreground mb-1.5 px-1">Save current filters as a smart folder.</p>
                    <Input autoFocus value={newViewName} onChange={(e) => setNewViewName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveView()}
                      placeholder="e.g. Hot leads, Failed today" className="h-8 text-[13px]" />
                    <div className="flex justify-end mt-2">
                      <Button size="sm" className="h-7 text-[11px]" onClick={handleSaveView}>Save</Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        )}

        {/* Channel pill group */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1 p-1 rounded-full bg-muted/40 border border-border/40 overflow-x-auto scrollbar-hide">
            {FILTERS.map(f => {
              const active = filter === f.id;
              const unread = counts[f.id] ?? 0;
              return (
                <button
                  key={f.id} onClick={() => { setFilter(f.id); setActiveViewId(null); }}
                  className={`relative inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all flex-1 justify-center ${
                    active ? 'bg-background text-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:text-foreground'
                  }`}>
                  {f.label}
                  {unread > 0 && (
                    <span className={`min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${active ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary'}`}>
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Saved views chip strip removed — pin-to-top + Inbox/Unread chips
            in advanced filters cover the same ground without a second pill row. */}
      </div>

      {/* Thread list */}
      <div className="flex-1 -mx-3 sm:-mx-4">
        {isLoading ? (
          <ul>
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="inbox-row-skeleton">
                <div className="w-12 h-12 rounded-full shrink-0 bg-muted/50" />
                <div className="flex-1 space-y-1.5 self-center">
                  <div className="h-3 w-1/3 rounded bg-muted/60" />
                  <div className="h-3 w-2/3 rounded bg-muted/40" />
                </div>
              </li>
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <InboxEmpty
            kind="chats"
            actionLabel={search ? undefined : 'Browse leads'}
            onAction={search ? undefined : () => navigate('/crm/leads')}
          />
        ) : (
          <ul ref={listRef} role="listbox" aria-label="Conversations">
            {filtered.map((t, idx) => {
              const { Icon, color, label: chLabel } = channelChip(t.channel);
              const name = formatContactName(t.first_name, t.last_name) || t.email || t.phone || 'Unknown';
              const initials = initialsFromName(t.first_name, t.last_name, t.email);
              const time = smartTime(t.last_message_at);
              const fullTime = t.last_message_at ? format(new Date(t.last_message_at), 'PPpp') : '';
              const isUnread = (t.unread_count ?? 0) > 0;
              const isActive = activeId === t.id;
              const isCursor = idx === cursor;
              const preview = cleanPreview(t.last_message_preview);
              const fallback = t.channel === 'email' ? t.email : t.phone;
              const isSelected = selected.has(t.id);
              const failed = (t.last_outbound_status ?? '').toLowerCase() === 'failed' || (t.last_outbound_status ?? '').toLowerCase() === 'undelivered';
              const snoozeText = snoozedLabel(t.snoozed_until);

              return (
                <li key={t.id} className="relative" data-row-index={idx} role="option" aria-selected={isActive}>
                  {(isUnread || isCursor) && !selectMode && (
                    <span aria-hidden
                      className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full transition-all ${isCursor ? 'h-9 w-[3px]' : 'h-7 w-[3px]'}`}
                      style={{ background: isUnread ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.55)' }} />
                  )}
                  <div
                    onPointerEnter={() => { prefetchThread(t.id); setCursor(idx); }}
                    onTouchStart={() => prefetchThread(t.id)}
                    data-active={isActive || undefined}
                    data-unread={isUnread || undefined}
                    className={`inbox-row group items-center !gap-2.5 ${
                      isCursor && !isActive ? 'bg-muted/40' : ''
                    } ${isSelected && !isActive ? 'bg-primary/[0.05]' : ''}`}>
                    {/* Bulk-select checkbox replaces avatar in select mode */}
                    {selectMode ? (
                      <button
                        onClick={() => setSelected(prev => {
                          const next = new Set(prev); if (next.has(t.id)) next.delete(t.id); else next.add(t.id); return next;
                        })}
                        className="shrink-0 w-12 h-12 flex items-center justify-center rounded-full hover:bg-muted/50"
                        aria-label={isSelected ? 'Deselect' : 'Select'}
                      >
                        {isSelected
                          ? <CheckSquare className="w-5 h-5 text-primary" strokeWidth={2.2} />
                          : <Square className="w-5 h-5 text-muted-foreground" strokeWidth={2} />}
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/crm/chats/${t.id}`)}
                        className="relative shrink-0"
                        aria-label="Open thread"
                      >
                        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[15px] font-semibold shadow-sm ring-1 ring-white/10"
                          style={{ background: avatarGradient(t.contact_id) }}>
                          {initials}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-background flex items-center justify-center"
                          style={{ boxShadow: '0 0 0 2px hsl(var(--background))' }} title={chLabel}>
                          <Icon className="w-[10px] h-[10px]" style={{ color }} strokeWidth={2.6} />
                        </div>
                      </button>
                    )}

                    {/* Body */}
                    <button
                      onClick={() => selectMode
                        ? setSelected(prev => { const n = new Set(prev); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })
                        : navigate(`/crm/chats/${t.id}`)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        {pinned.has(t.id) && <Pin className="w-3 h-3 text-primary shrink-0 -rotate-45" strokeWidth={2.6} />}
                        <h3 className={`text-[15px] truncate tracking-[-0.01em] leading-tight flex-1 min-w-0 ${isUnread ? 'font-bold text-foreground' : 'font-semibold text-foreground/90'}`}>
                          {name}
                        </h3>
                        {time && (
                          <time dateTime={t.last_message_at ?? undefined} title={fullTime}
                            className={`text-[11px] whitespace-nowrap shrink-0 tabular-nums leading-tight ${isUnread ? 'text-primary font-bold' : 'text-muted-foreground/80 font-medium'}`}>
                            {time}
                          </time>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className={`text-[13px] truncate leading-snug flex-1 min-w-0 ${isUnread ? 'text-foreground/85' : 'text-muted-foreground'}`}>
                          {failed && <AlertCircle className="inline-block w-3 h-3 mr-1 -mt-0.5 align-middle text-destructive" strokeWidth={2.4} aria-label="Last send failed" />}
                          {t.last_message_direction === 'outbound' && !failed && (
                            <CornerUpLeft className="inline-block w-3 h-3 mr-1 -mt-0.5 align-middle text-muted-foreground/60" strokeWidth={2.2} aria-label="You replied" />
                          )}
                          {t.has_attachment && (
                            <Paperclip className="inline-block w-3 h-3 mr-1 -mt-0.5 align-middle text-muted-foreground/70" strokeWidth={2.2} aria-label="Has attachment" />
                          )}
                          {t.subject ? (
                            // Subject alone reads cleanest in the rail (Gmail/Outlook
                            // compact view). Appending " — preview" caused the
                            // subject to truncate mid-title on narrow rails.
                            <span className={isUnread ? 'font-semibold text-foreground' : 'text-foreground/85'}>{t.subject}</span>
                          ) : (preview || fallback || 'No messages yet')}
                        </p>
                        {snoozeText && (
                          <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            <Clock4 className="w-2.5 h-2.5" /> {snoozeText.replace(/^Snoozed · /, '')}
                          </span>
                        )}
                        {isUnread && !selectMode && (
                          <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm shadow-primary/30 tabular-nums">
                            {t.unread_count > 99 ? '99+' : t.unread_count}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Outlook-style expand chevron — email rows only.
                        Lazy-loads subject threads on first expand. */}
                    {t.channel === 'email' && !selectMode && (
                      <button
                        type="button"
                        title={expandedEmail.has(t.contact_id) ? 'Hide email threads' : 'Show email threads'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedEmail((prev) => {
                            const next = new Set(prev);
                            if (next.has(t.contact_id)) next.delete(t.contact_id);
                            else next.add(t.contact_id);
                            return next;
                          });
                        }}
                        className={`absolute right-1 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full flex items-center justify-center bg-background/80 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-opacity ${expandedEmail.has(t.contact_id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
                        aria-expanded={expandedEmail.has(t.contact_id)}
                      >
                        {expandedEmail.has(t.contact_id)
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRight className="w-4 h-4" />}
                      </button>
                    )}

                    {/* Per-row inline actions — pin + delete */}
                    {!selectMode && (
                      <div className="hidden sm:flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <RowAction title={pinned.has(t.id) ? 'Unpin' : 'Pin to top'}
                          onClick={() => togglePin(t.id)}>
                          {pinned.has(t.id)
                            ? <PinOff className="w-4 h-4 text-muted-foreground" />
                            : <Pin className="w-4 h-4 text-muted-foreground" />}
                        </RowAction>
                        <RowAction title="Delete chat"
                          onClick={() => {
                            if (!window.confirm('Delete this chat? Underlying emails and texts are preserved — only the inbox conversation is removed.')) return;
                            flags.remove(t.id).then(() => toast.success('Chat deleted'));
                          }}>
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </RowAction>
                      </div>
                    )}
                  </div>

                  {/* Expanded subject-thread sub-list (Outlook conversation view) */}
                  {t.channel === 'email' && expandedEmail.has(t.contact_id) && (
                    <EmailThreadSubList
                      contactId={t.contact_id}
                      conversationId={t.id}
                      activeId={activeId}
                      onPick={(threadId) => navigate(`/crm/chats/${t.id}?thread=${threadId}`)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:text-foreground border border-border/40'
      }`}>
      {children}
    </button>
  );
}

function BulkBtn({ title, onClick, tone, children }: { title: string; onClick: () => void; tone?: 'destructive'; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick} title={title} aria-label={title}
      className={`h-8 w-8 rounded-full inline-flex items-center justify-center transition-colors ${
        tone === 'destructive'
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}

function RowAction({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={title} aria-label={title}
      className="h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-background border border-transparent hover:border-border/60 transition-colors">
      {children}
    </button>
  );
}

function SnoozeMenu({ isSnoozed, onSnooze }: { isSnoozed: boolean; onSnooze: (iso: string | null) => void }) {
  const presets = useMemo(() => snoozePresets(), []);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button onClick={(e) => e.stopPropagation()} title="Snooze" aria-label="Snooze"
          className="h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-background border border-transparent hover:border-border/60">
          {isSnoozed ? <Bell className="w-4 h-4 text-amber-500" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1" onClick={(e) => e.stopPropagation()}>
        {presets.map(p => (
          <button key={p.id} onClick={() => onSnooze(p.iso)}
            className="w-full text-left px-2.5 py-2 rounded-md hover:bg-muted text-[13px] flex items-center gap-2">
            <Clock4 className="w-3.5 h-3.5 text-muted-foreground" /> {p.label}
          </button>
        ))}
        {isSnoozed && (
          <>
            <div className="h-px my-1 bg-border" />
            <button onClick={() => onSnooze(null)}
              className="w-full text-left px-2.5 py-2 rounded-md hover:bg-muted text-[13px] flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Bell className="w-3.5 h-3.5" /> Unsnooze now
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Outlook-style sub-list of subject-grouped email threads for one contact.
 * Shown when the user expands an email row in the chats list. Each sub-row
 * routes to the same conversation page but with a `?thread=<id>` filter so
 * the thread page only renders messages from that subject thread.
 */
function EmailThreadSubList({
  contactId,
  conversationId,
  activeId,
  onPick,
}: {
  contactId: string;
  conversationId: string;
  activeId: string | null;
  onPick: (threadId: string) => void;
}) {
  const { data: threads = [], isLoading } = useEmailThreadsForContact(contactId);

  if (isLoading) {
    return (
      <div className="pl-[68px] pr-4 pb-2 text-[12px] text-muted-foreground/70">
        Loading threads…
      </div>
    );
  }
  if (threads.length === 0) {
    return (
      <div className="pl-[68px] pr-4 pb-2 text-[12px] text-muted-foreground/70 italic">
        No subject threads yet.
      </div>
    );
  }

  return (
    <ul className="pl-[68px] pr-2 pb-2 space-y-0.5 border-l-2 border-border/40 ml-[27px]">
      {threads.map((th) => {
        const isUnread = (th.unread_count ?? 0) > 0;
        const time = smartTime(th.last_message_at);
        const subject = (th.subject || '(no subject)').trim();
        return (
          <li key={th.id}>
            <button
              type="button"
              onClick={() => onPick(th.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                activeId === conversationId
                  ? 'hover:bg-primary/10'
                  : 'hover:bg-muted/40'
              }`}
            >
              <Mail className="w-3 h-3 shrink-0 text-muted-foreground/70" strokeWidth={2.2} />
              <span className={`flex-1 min-w-0 truncate text-[12.5px] leading-tight ${
                isUnread ? 'font-semibold text-foreground' : 'text-foreground/85'
              }`}>
                {subject}
              </span>
              {th.message_count > 1 && (
                <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground/70 font-medium">
                  {th.message_count}
                </span>
              )}
              {isUnread && (
                <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9.5px] font-bold flex items-center justify-center tabular-nums">
                  {th.unread_count > 99 ? '99+' : th.unread_count}
                </span>
              )}
              {time && (
                <time className={`shrink-0 text-[10.5px] tabular-nums ${
                  isUnread ? 'text-primary font-bold' : 'text-muted-foreground/70 font-medium'
                }`}>
                  {time}
                </time>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
