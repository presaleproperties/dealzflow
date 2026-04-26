import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Filter, MoreHorizontal, Plus, Mail, MessageSquare, Phone } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCrmChats, type ChatChannel } from '@/hooks/useCrmChats';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatContactName } from '@/lib/formatters';

const FILTERS: { id: ChatChannel | 'all'; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'email',    label: 'Email' },
  { id: 'sms',      label: 'SMS' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

function initialsFromName(first?: string | null, last?: string | null, fallback?: string | null): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (f || l) return `${f[0] ?? ''}${l[0] ?? ''}`.toUpperCase() || '?';
  if (fallback) return fallback.slice(0, 2).toUpperCase();
  return '?';
}

// Deterministic color per contact id — matches Lofty's colored avatar grid feel
function avatarBg(id: string): string {
  const palette = [
    'hsl(38 88% 55%)',   // amber
    'hsl(355 78% 60%)',  // coral
    'hsl(155 60% 45%)',  // emerald
    'hsl(220 75% 60%)',  // blue
    'hsl(265 65% 60%)',  // violet
    'hsl(195 75% 50%)',  // cyan
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function channelChip(c: ChatChannel) {
  switch (c) {
    case 'sms':      return { Icon: MessageSquare, color: 'hsl(var(--primary))' };
    case 'whatsapp': return { Icon: MessageSquare, color: 'hsl(155 60% 45%)' };
    case 'email':
    default:         return { Icon: Mail, color: 'hsl(220 75% 55%)' };
  }
}

export default function CrmChatsPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ChatChannel | 'all'>('all');
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

  const totalUnread = threads.reduce((sum, t) => sum + (t.unread_count ?? 0), 0);

  return (
    <div className="flex flex-1 min-h-0 h-full flex-col">
      {/* Mobile header — Lofty-style: title left, search icon right */}
      <div className="-mx-3 sm:-mx-4 sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-1.5">
          <div className="flex items-baseline gap-2">
            <h1 className="text-[19px] font-semibold text-foreground tracking-tight">
              Chats
            </h1>
            {totalUnread > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-bold bg-primary/15 text-primary">
                {totalUnread}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSearchOpen(v => !v)}
            className={`h-11 w-11 ${searchOpen || search ? 'text-primary' : 'text-foreground'}`}
            aria-label="Search chats"
          >
            <Search className="w-6 h-6" strokeWidth={2} />
          </Button>
        </div>

        {searchOpen && (
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
              <input
                type="search"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, message…"
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-muted/50 border border-border/60 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60"
              />
            </div>
          </div>
        )}

        {/* Channel filter pills */}
        <div className="flex items-center gap-1.5 px-3 pb-2 overflow-x-auto scrollbar-hide">
          {FILTERS.map(f => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all border ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent border-border/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 -mx-3 sm:-mx-4 bg-card">
        {isLoading ? (
          <div className="px-4 py-12 text-center text-[13px] text-muted-foreground">Loading conversations…</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <div className="text-[14px] font-semibold text-foreground mb-1">No conversations yet</div>
            <p className="text-[12px] text-muted-foreground mb-4">
              {search ? 'No threads match your search.' : 'Email and SMS conversations will appear here.'}
            </p>
            {!search && (
              <Button asChild size="sm" variant="outline">
                <Link to="/crm/leads">Browse leads</Link>
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {filtered.map(t => {
              const { Icon, color } = channelChip(t.channel);
              const name = formatContactName(t.first_name, t.last_name) || t.email || t.phone || 'Unknown';
              const initials = initialsFromName(t.first_name, t.last_name, t.email);
              const time = t.last_message_at
                ? formatDistanceToNowStrict(new Date(t.last_message_at), { addSuffix: false })
                : '';
              const isUnread = (t.unread_count ?? 0) > 0;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => navigate(`/crm/leads/${t.contact_id}`)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/30 active:bg-muted/40 transition-colors"
                  >
                    {/* Avatar with channel chip */}
                    <div className="relative shrink-0">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[15px] font-semibold"
                        style={{ background: avatarBg(t.contact_id) }}
                      >
                        {initials}
                      </div>
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-background flex items-center justify-center border-2 border-card"
                      >
                        <Icon className="w-3 h-3" style={{ color }} strokeWidth={2.4} />
                      </div>
                      {isUnread && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center border-2 border-card">
                          {t.unread_count > 9 ? '9+' : t.unread_count}
                        </span>
                      )}
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className={`text-[15px] truncate tracking-tight ${isUnread ? 'font-bold text-foreground' : 'font-semibold text-foreground'}`}>
                          {name}
                        </h3>
                        {time && (
                          <span className={`text-[11px] whitespace-nowrap shrink-0 ${isUnread ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                            {time}
                          </span>
                        )}
                      </div>
                      <p className={`text-[13px] truncate leading-snug mt-0.5 ${isUnread ? 'text-foreground/80' : 'text-muted-foreground'}`}>
                        {t.last_message_direction === 'outbound' && (
                          <span className="text-muted-foreground/70 mr-1">You:</span>
                        )}
                        {t.last_message_preview || (t.channel === 'email' ? t.email : t.phone) || 'No messages yet'}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* FAB — start new conversation (routes to leads to pick a contact) */}
      <button
        onClick={() => navigate('/crm/leads')}
        aria-label="Start new conversation"
        className="lg:hidden fixed right-4 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl active:scale-95 transition-all flex items-center justify-center"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
      >
        <Plus className="w-6 h-6" strokeWidth={2.2} />
      </button>
    </div>
  );
}
