import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Bell, Menu, LayoutDashboard, Users, Kanban, Mail, MessageCircle,
  LayoutTemplate, BookUser, Zap, CalendarDays, BarChart3, Settings,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import type { LucideIcon } from 'lucide-react';

interface CrmNavItem { label: string; path: string; icon: LucideIcon; }

const crmNavItems: CrmNavItem[] = [
  { label: 'CRM Dashboard',     path: '/crm/dashboard',    icon: LayoutDashboard },
  { label: 'Leads',             path: '/crm/leads',        icon: Users },
  { label: 'Pipeline',          path: '/crm/pipeline',     icon: Kanban },
  { label: 'Email Center',      path: '/crm/email',        icon: Mail },
  { label: 'WhatsApp',          path: '/crm/whatsapp',     icon: MessageCircle },
  { label: 'Templates',         path: '/crm/templates',    icon: LayoutTemplate },
  { label: 'Contacts',          path: '/crm/contacts',     icon: BookUser },
  { label: 'Automations',       path: '/crm/automations',  icon: Zap },
  { label: 'Showings Calendar', path: '/crm/calendar',     icon: CalendarDays },
  { label: 'Reports',           path: '/crm/reports',      icon: BarChart3 },
  { label: 'CRM Settings',      path: '/crm/settings',     icon: Settings },
];

const ownerAdminOnlyPaths = new Set(['/crm/automations', '/crm/settings']);

const GOLD = 'hsl(39 67% 55%)';
const GOLD_BG = 'hsl(39 67% 55% / 0.12)';
const DARK_BG = 'hsl(222 25% 9%)';
const INACTIVE_TEXT = 'hsl(220 10% 64%)';

const ROUTE_TITLES: { match: string; title: string }[] = [
  { match: '/crm/dashboard',    title: 'Dashboard' },
  { match: '/crm/leads',        title: 'Leads & Contacts' },
  { match: '/crm/pipeline',     title: 'Pipeline' },
  { match: '/crm/email',        title: 'Email Center' },
  { match: '/crm/whatsapp',     title: 'WhatsApp' },
  { match: '/crm/templates',    title: 'Templates' },
  { match: '/crm/contacts',     title: 'Contacts' },
  { match: '/crm/automations',  title: 'Automations' },
  { match: '/crm/calendar',     title: 'Calendar' },
  { match: '/crm/reports',      title: 'Reports' },
  { match: '/crm/integrations', title: 'Integrations' },
  { match: '/crm/settings',     title: 'CRM Settings' },
];

export function CrmHeader() {
  const { user } = useAuth();
  const { isOwnerOrAdmin } = useCrmAccess();
  const location = useLocation();
  const initials = user?.email?.slice(0, 2).toUpperCase() || 'U';
  const [sheetOpen, setSheetOpen] = useState(false);

  const visibleNav = crmNavItems.filter(item =>
    !ownerAdminOnlyPaths.has(item.path) || isOwnerOrAdmin,
  );

  // Resolve a section label (e.g. "Leads & Contacts") for the current route.
  // Pages render their own H1, so we keep this as a small breadcrumb above it.
  const sectionTitle = ROUTE_TITLES.find(r => location.pathname.startsWith(r.match))?.title;

  // Close mobile sheet on route change
  useEffect(() => { setSheetOpen(false); }, [location.pathname]);

  return (
    <header
      className="sticky top-0 z-40 border-b border-border/60 bg-card/70 backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center justify-between h-12 sm:h-13 px-3 sm:px-4 lg:px-6">
        {/* Left: Hamburger (< lg) + breadcrumb */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
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
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: GOLD }}>
                    CRM
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
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors duration-150',
                          isActive ? 'font-semibold' : 'hover:opacity-80',
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

          <div className="flex items-baseline gap-2 min-w-0">
            <span
              className="text-[10.5px] font-semibold uppercase tracking-[0.12em] shrink-0"
              style={{ color: GOLD }}
            >
              CRM
            </span>
            {sectionTitle && (
              <>
                <span className="text-muted-foreground/40 text-xs">/</span>
                <span className="text-[12.5px] font-medium text-foreground/80 truncate">
                  {sectionTitle}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: Bell + Avatar */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            className="relative h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-[16px] h-[16px]" strokeWidth={1.8} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
          </button>
          <div
            className="w-7 h-7 sm:w-[30px] sm:h-[30px] rounded-full flex items-center justify-center text-[10.5px] font-bold text-white shrink-0"
            style={{ background: GOLD }}
          >
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
