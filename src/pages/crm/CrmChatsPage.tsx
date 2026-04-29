import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Search, Plus, Mail, MessageSquare, X, Sparkles } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useCrmChats, type ChatChannel, type ChatChannelFilter } from '@/hooks/useCrmChats';
import { usePrefetchChatThread } from '@/hooks/usePrefetchCrm';
import { formatContactName } from '@/lib/format';

/**
 * Inbox channel toggle. "Text" is a combined view of SMS + WhatsApp so the
 * user only has to think in two real-world buckets (Email vs Text). One row
 * per (client, channel) is preserved by the underlying hook aggregation.
 */
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

// Deterministic gradient per contact id — premium feel vs flat color
function avatarGradient(id: string): string {
  const palette = [
    ['hsl(38 88% 58%)',  'hsl(28 85% 48%)'],   // amber → bronze
    ['hsl(355 78% 62%)', 'hsl(345 70% 50%)'],  // coral → rose
    ['hsl(155 55% 48%)', 'hsl(165 55% 38%)'],  // emerald → teal
    ['hsl(220 75% 62%)', 'hsl(232 70% 52%)'],  // blue → indigo
    ['hsl(265 60% 62%)', 'hsl(280 55% 50%)'],  // violet → purple
    ['hsl(195 75% 52%)', 'hsl(210 70% 44%)'],  // cyan → blue
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

export default function CrmChatsPage() {
  const navigate = useNavigate();
  const prefetchThread = usePrefetchChatThread();
  const [filter, setFilter] = useState<ChatChannelFilter>('all');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const { data: threads = [], isLoading } = useCrmChats(filter);

  const filtered = useMemo(() => {
    if (!search.trim()) return threads;
    const s = search.toLowerCase();
    return threads.filter(t => {
      const name = formatContactName(t.first_name, t.last_name).toLowerCase();
      return name.includes(s)
        || (t.email ?? '').toLowerCase().includes(s)
        || (t.phone ?? '').includes(s)
        || (t.last_message_preview ?? '').toLowerCase().includes(s);
    });
  }, [threads, search]);

  // Per-pill unread counts. "text" rolls up SMS + WhatsApp into a single
  // bucket so the segmented control mirrors the simplified two-channel UX.
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

  return (
    <div className="flex flex-1 min-h-0 h-full flex-col">
      {/* Premium glassmorphic header */}
      <div
        className="-mx-3 sm:-mx-4 sticky top-0 z-20 bg-background/85 backdrop-blur-xl border-b border-border/60"
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-2">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold text-foreground tracking-[-0.02em] leading-none">
              Chats
            </h1>
            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
              {counts.all > 0
                ? <><span className="text-primary font-bold">{counts.all}</span> unread · {threads.length} total</>
                : <>{threads.length} {threads.length === 1 ? 'conversation' : 'conversations'}</>
              }
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSearchOpen(v => !v);
              if (searchOpen) setSearch('');
            }}
            className={`h-10 w-10 rounded-full ${searchOpen || search ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
            aria-label="Search chats"
          >
            {searchOpen ? <X className="w-5 h-5" strokeWidth={2.2} /> : <Search className="w-5 h-5" strokeWidth={2} />}
          </Button>
        </div>

        {searchOpen && (
          <div className="px-4 pb-2.5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
              <input
                type="search"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, or message…"
                className="w-full h-11 pl-10 pr-3 rounded-xl bg-muted/60 border border-border/40 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
              />
            </div>
          </div>
        )}

        {/* Segmented filter — premium pill group */}
        <div className="px-3 pb-2.5">
          <div className="flex items-center gap-1 p-1 rounded-full bg-muted/40 border border-border/40 overflow-x-auto scrollbar-hide">
            {FILTERS.map(f => {
              const active = filter === f.id;
              const unread = counts[f.id] ?? 0;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`relative inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all flex-1 justify-center ${
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'bg-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f.label}
                  {unread > 0 && (
                    <span className={`min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      active ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary'
                    }`}>
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 -mx-3 sm:-mx-4">
        {isLoading ? (
          <ul className="divide-y divide-border/40">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-muted/60 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-muted/60" />
                  <div className="h-3 w-2/3 rounded bg-muted/40" />
                </div>
              </li>
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-20 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center mb-4">
              <Sparkles className="w-7 h-7 text-primary" strokeWidth={1.6} />
            </div>
            <div className="text-[15px] font-semibold text-foreground mb-1.5 tracking-tight">
              {search ? 'No matches found' : 'Your inbox is clear'}
            </div>
            <p className="text-[13px] text-muted-foreground mb-5 max-w-[260px] leading-relaxed">
              {search
                ? 'Try a different name, email, or keyword.'
                : 'Start a conversation with a lead to see threads appear here.'}
            </p>
            {!search && (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link to="/crm/leads">Browse leads</Link>
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {filtered.map(t => {
              const { Icon, color } = channelChip(t.channel);
              const name = formatContactName(t.first_name, t.last_name) || t.email || t.phone || 'Unknown';
              const initials = initialsFromName(t.first_name, t.last_name, t.email);
              const time = t.last_message_at
                ? formatDistanceToNowStrict(new Date(t.last_message_at), { addSuffix: false })
                : '';
              const isUnread = (t.unread_count ?? 0) > 0;
              return (
                <li key={t.id} className="relative">
                  {/* Subtle gold accent bar for unread */}
                  {isUnread && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-r-full"
                      style={{ background: 'hsl(var(--primary))' }}
                    />
                  )}
                  <button
                    onPointerEnter={() => prefetchThread(t.id)}
                    onTouchStart={() => prefetchThread(t.id)}
                    onClick={() => navigate(`/crm/chats/${t.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 active:bg-muted/50 transition-colors"
                  >
                    {/* Gradient avatar with channel chip */}
                    <div className="relative shrink-0">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[15px] font-semibold shadow-sm ring-1 ring-white/10"
                        style={{ background: avatarGradient(t.contact_id) }}
                      >
                        {initials}
                      </div>
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-background flex items-center justify-center shadow-sm"
                        style={{ boxShadow: '0 0 0 2px hsl(var(--background))' }}
                      >
                        <Icon className="w-[10px] h-[10px]" style={{ color }} strokeWidth={2.6} />
                      </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className={`text-[15px] truncate tracking-[-0.01em] ${isUnread ? 'font-bold text-foreground' : 'font-semibold text-foreground/90'}`}>
                          {name}
                        </h3>
                        {time && (
                          <span className={`text-[11px] whitespace-nowrap shrink-0 tabular-nums ${isUnread ? 'text-primary font-bold' : 'text-muted-foreground/80 font-medium'}`}>
                            {time}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className={`text-[13px] truncate leading-snug flex-1 min-w-0 ${isUnread ? 'text-foreground/85' : 'text-muted-foreground'}`}>
                          {t.last_message_direction === 'outbound' && (
                            <span className="text-muted-foreground/60 mr-1">You:</span>
                          )}
                          {t.last_message_preview || (t.channel === 'email' ? t.email : t.phone) || 'No messages yet'}
                        </p>
                        {isUnread && (
                          <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-sm shadow-primary/30">
                            {t.unread_count > 99 ? '99+' : t.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* No per-page FAB — conversations start from Leads / Lead Detail. */}
    </div>
  );
}
