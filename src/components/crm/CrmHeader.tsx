import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, Menu, X, LayoutDashboard, Users, Kanban, Mail, MessageCircle, LayoutTemplate, BookUser, Zap, CalendarDays, BarChart3, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';
import { LeadStatusBadge } from '@/components/crm/leads/LeadStatusBadge';
import type { LucideIcon } from 'lucide-react';

interface CrmNavItem { label: string; path: string; icon: LucideIcon; }

const crmNavItems: CrmNavItem[] = [
  { label: 'CRM Dashboard',    path: '/crm/dashboard',   icon: LayoutDashboard },
  { label: 'Leads',            path: '/crm/leads',       icon: Users },
  { label: 'Pipeline',         path: '/crm/pipeline',    icon: Kanban },
  { label: 'Email Center',     path: '/crm/email',       icon: Mail },
  { label: 'WhatsApp',         path: '/crm/whatsapp',    icon: MessageCircle },
  { label: 'Templates',        path: '/crm/templates',   icon: LayoutTemplate },
  { label: 'Contacts',         path: '/crm/contacts',    icon: BookUser },
  { label: 'Automations',      path: '/crm/automations', icon: Zap },
  { label: 'Showings Calendar', path: '/crm/calendar',   icon: CalendarDays },
  { label: 'Reports',          path: '/crm/reports',     icon: BarChart3 },
  { label: 'CRM Settings',     path: '/crm/settings',    icon: Settings },
];

const ownerAdminOnlyPaths = new Set(['/crm/automations', '/crm/settings']);

const GOLD = 'hsl(39 67% 55%)';
const GOLD_BG = 'hsl(39 67% 55% / 0.12)';
const DARK_BG = 'hsl(222 25% 10%)';
const INACTIVE_TEXT = 'hsl(220 10% 64%)';

function GlobalSearchDropdown({ query, onClose }: { query: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: contacts = [] } = useCrmContacts();

  const results = useMemo(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    return contacts
      .filter(c =>
        c.first_name?.toLowerCase().includes(q) ||
        c.last_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      )
      .slice(0, 8);
  }, [contacts, query]);

  if (query.length < 2) return null;

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
      {results.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">No results found</div>
      ) : (
        results.map(c => (
          <button
            key={c.id}
            onClick={() => { navigate(`/crm/leads/${c.id}`); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {formatContactName(c.first_name, c.last_name)}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">{c.email ?? c.phone ?? '—'}</p>
            </div>
            <LeadStatusBadge status={c.status} />
          </button>
        ))
      )}
    </div>
  );
}

export function CrmHeader() {
  const { user } = useAuth();
  const { isOwnerOrAdmin } = useCrmAccess();
  const location = useLocation();
  const initials = user?.email?.slice(0, 2).toUpperCase() || 'U';
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const visibleNav = crmNavItems.filter(item =>
    !ownerAdminOnlyPaths.has(item.path) || isOwnerOrAdmin
  );

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, []);

  // Clear search on route change
  useEffect(() => {
    setSearchQuery('');
    setShowDropdown(false);
    setSearchOpen(false);
  }, [location.pathname]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value.slice(0, 200));
    setShowDropdown(value.length >= 2);
  };

  const closeSearch = () => {
    setSearchQuery('');
    setShowDropdown(false);
    setSearchOpen(false);
  };

  return (
    <header
      className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
    <div className="flex items-center justify-between h-12 sm:h-14 px-3 sm:px-4 lg:px-6">
      {/* Left: Hamburger (< 1024px) + CRM label */}
      <div className="flex items-center gap-2 min-w-0">
        <Sheet>
          <SheetTrigger asChild>
            <button className="lg:hidden shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <Menu className="w-[18px] h-[18px]" strokeWidth={2.2} />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="p-0 w-[260px] border-r-0"
            style={{ background: DARK_BG }}
          >
            <div className="flex flex-col h-full">
              <div className="px-4 pt-5 pb-3">
                <span className="text-sm font-bold tracking-tight" style={{ color: GOLD }}>
                  CRM Navigation
                </span>
              </div>
              <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
                {visibleNav.map(item => {
                  const isActive = location.pathname === item.path ||
                    (item.path !== '/crm/dashboard' && location.pathname.startsWith(item.path));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                        isActive ? 'font-semibold' : 'hover:opacity-80'
                      )}
                      style={{
                        color: isActive ? GOLD : INACTIVE_TEXT,
                        background: isActive ? GOLD_BG : undefined,
                      }}
                    >
                      <Icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </SheetContent>
        </Sheet>

        {!searchOpen && (
          <span className="text-sm font-bold tracking-tight shrink-0" style={{ color: GOLD }}>
            CRM
          </span>
        )}
      </div>

      {/* Center: Search */}
      <div ref={searchRef} className="hidden sm:block relative w-full max-w-[280px] lg:max-w-sm mx-4">
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            onFocus={() => { if (searchQuery.length >= 2) setShowDropdown(true); }}
            placeholder="Search leads, projects..."
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
          {searchQuery && (
            <button onClick={closeSearch} className="shrink-0 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {showDropdown && <GlobalSearchDropdown query={debouncedQuery} onClose={closeSearch} />}
      </div>

      {/* Mobile: expanded search overlay */}
      {searchOpen && (
        <div ref={searchRef} className="sm:hidden relative flex-1 mx-2">
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              onFocus={() => { if (searchQuery.length >= 2) setShowDropdown(true); }}
              placeholder="Search..."
              autoFocus
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
            />
            <button onClick={closeSearch} className="shrink-0 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          {showDropdown && <GlobalSearchDropdown query={debouncedQuery} onClose={closeSearch} />}
        </div>
      )}

      {/* Right: Search icon (mobile) + Bell + Avatar */}
      <div className={cn('flex items-center gap-2 sm:gap-3 shrink-0', searchOpen && 'sm:flex hidden')}>
        {!searchOpen && (
          <button
            onClick={() => setSearchOpen(true)}
            className="sm:hidden p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <Search className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        <button className="relative p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
          <Bell className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-muted-foreground" />
          <span className="absolute top-0.5 right-0.5 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-red-500 rounded-full border-2 border-card" />
        </button>
        <div
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold text-white shrink-0"
          style={{ background: GOLD }}
        >
          {initials}
        </div>
      </div>
    </div>
    </header>
  );
}
