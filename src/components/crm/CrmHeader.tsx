import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Bell, Menu, X, LayoutDashboard, Users, Kanban, Mail, MessageCircle, LayoutTemplate, BookUser, Zap, CalendarDays, BarChart3, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
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

export function CrmHeader() {
  const { user } = useAuth();
  const { isOwnerOrAdmin } = useCrmAccess();
  const location = useLocation();
  const initials = user?.email?.slice(0, 2).toUpperCase() || 'U';
  const [searchOpen, setSearchOpen] = useState(false);

  const visibleNav = crmNavItems.filter(item =>
    !ownerAdminOnlyPaths.has(item.path) || isOwnerOrAdmin
  );

  return (
    <header
      className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
    <div className="flex items-center justify-between h-12 sm:h-14 px-3 sm:px-4 lg:px-6">
      {/* Left: Hamburger (< 1024px) + CRM label */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Hamburger for < 1024px */}
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

        {/* CRM label - hide when mobile search is open */}
        {!searchOpen && (
          <span className="text-sm font-bold tracking-tight shrink-0" style={{ color: GOLD }}>
            CRM
          </span>
        )}
      </div>

      {/* Center: Search */}
      {/* Desktop/tablet: inline search bar */}
      <div className="hidden sm:flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 w-full max-w-[280px] lg:max-w-sm mx-4">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Search leads, projects..."
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
        />
      </div>

      {/* Mobile: expanded search overlay */}
      {searchOpen && (
        <div className="sm:hidden flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 flex-1 mx-2">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            autoFocus
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
          <button onClick={() => setSearchOpen(false)} className="shrink-0 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Right: Search icon (mobile) + Bell + Avatar */}
      <div className={cn('flex items-center gap-2 sm:gap-3 shrink-0', searchOpen && 'sm:flex hidden')}>
        {/* Mobile search toggle */}
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
