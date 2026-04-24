import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Bell, Menu, LayoutDashboard, Users, Send, BarChart3, Settings,
  Kanban, Mail, MessageCircle, LayoutTemplate, BookUser, Zap, CalendarDays,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { LucideIcon } from 'lucide-react';
import { GlobalLeadSearch } from '@/components/crm/GlobalLeadSearch';

interface NavChild { label: string; path: string; icon: LucideIcon; ownerAdminOnly?: boolean; }
interface NavSection { label: string; icon: LucideIcon; path?: string; children?: NavChild[]; }

const NAV_SECTIONS: NavSection[] = [
  
  {
    label: 'Leads',
    icon: Users,
    children: [
      { label: 'Leads & Contacts', path: '/crm/leads',     icon: Users },
      { label: 'Pipeline',         path: '/crm/pipeline',  icon: Kanban },
      { label: 'Contacts',         path: '/crm/contacts',  icon: BookUser },
      { label: 'Calendar',         path: '/crm/calendar',  icon: CalendarDays },
    ],
  },
  {
    label: 'Outreach',
    icon: Send,
    children: [
      { label: 'Email Center', path: '/crm/email',       icon: Mail },
      { label: 'Templates',    path: '/crm/templates',   icon: LayoutTemplate },
      { label: 'Automations',  path: '/crm/automations', icon: Zap, ownerAdminOnly: true },
    ],
  },
  { label: 'Insights', icon: BarChart3, path: '/crm/reports' },
];

const SETTINGS_ITEM: NavChild = { label: 'CRM Settings', path: '/crm/settings', icon: Settings, ownerAdminOnly: true };

const GOLD = 'hsl(var(--primary))';
const GOLD_BG = 'hsl(var(--primary) / 0.12)';
const DARK_BG = 'hsl(var(--background))';
const INACTIVE_TEXT = 'hsl(var(--muted-foreground))';

const ROUTE_TITLES: { match: string; title: string }[] = [
  
  { match: '/crm/leads',        title: 'Leads & Contacts' },
  { match: '/crm/pipeline',     title: 'Pipeline' },
  { match: '/crm/email',        title: 'Email Center' },
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
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const filterChildren = (children?: NavChild[]) =>
    (children ?? []).filter(c => !c.ownerAdminOnly || isOwnerOrAdmin);

  const sectionTitle = ROUTE_TITLES.find(r => location.pathname.startsWith(r.match))?.title;

  useEffect(() => { setSheetOpen(false); setOpenMenu(null); }, [location.pathname]);

  const isSectionActive = (section: NavSection) => {
    if (section.path) return location.pathname.startsWith(section.path);
    return filterChildren(section.children).some(c => location.pathname.startsWith(c.path));
  };

  return (
    <header
      className="sticky top-0 z-40 border-b border-border/60 bg-card/70 backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center justify-between h-12 sm:h-13 px-3 sm:px-4 lg:px-6 gap-3">
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
                <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-3">
                  {NAV_SECTIONS.map(section => {
                    const children = filterChildren(section.children);
                    if (section.path) {
                      const isActive = location.pathname.startsWith(section.path);
                      const Icon = section.icon;
                      return (
                        <Link
                          key={section.label}
                          to={section.path}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
                          style={{
                            color: isActive ? GOLD : INACTIVE_TEXT,
                            background: isActive ? GOLD_BG : undefined,
                            fontWeight: isActive ? 600 : 500,
                          }}
                        >
                          <Icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
                          {section.label}
                        </Link>
                      );
                    }
                    if (!children.length) return null;
                    return (
                      <div key={section.label}>
                        <div
                          className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                          style={{ color: 'hsl(220 10% 50%)' }}
                        >
                          {section.label}
                        </div>
                        <div className="space-y-0.5">
                          {children.map(child => {
                            const isActive = location.pathname.startsWith(child.path);
                            const Icon = child.icon;
                            return (
                              <Link
                                key={child.path}
                                to={child.path}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
                                style={{
                                  color: isActive ? GOLD : INACTIVE_TEXT,
                                  background: isActive ? GOLD_BG : undefined,
                                  fontWeight: isActive ? 600 : 500,
                                }}
                              >
                                <Icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {isOwnerOrAdmin && (
                    <div>
                      <div
                        className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                        style={{ color: 'hsl(220 10% 50%)' }}
                      >
                        Admin
                      </div>
                      <Link
                        to={SETTINGS_ITEM.path}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
                        style={{
                          color: location.pathname.startsWith(SETTINGS_ITEM.path) ? GOLD : INACTIVE_TEXT,
                          background: location.pathname.startsWith(SETTINGS_ITEM.path) ? GOLD_BG : undefined,
                        }}
                      >
                        <Settings className="w-4 h-4 shrink-0" strokeWidth={1.8} />
                        {SETTINGS_ITEM.label}
                      </Link>
                    </div>
                  )}
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

        {/* Center: Desktop top nav (lg+) */}
        <nav className="hidden lg:flex items-center gap-1 mx-auto">
          {NAV_SECTIONS.map(section => {
            const isActive = isSectionActive(section);
            const Icon = section.icon;

            if (section.path) {
              return (
                <Link
                  key={section.label}
                  to={section.path}
                  className={cn(
                    'flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] transition-colors',
                  )}
                  style={{
                    color: isActive ? GOLD : INACTIVE_TEXT,
                    background: isActive ? GOLD_BG : undefined,
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  <Icon className="w-[14px] h-[14px]" strokeWidth={isActive ? 2.2 : 1.8} />
                  {section.label}
                </Link>
              );
            }

            const children = filterChildren(section.children);
            if (!children.length) return null;

            return (
              <Popover
                key={section.label}
                open={openMenu === section.label}
                onOpenChange={open => setOpenMenu(open ? section.label : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] transition-colors hover:bg-muted/40"
                    style={{
                      color: isActive ? GOLD : INACTIVE_TEXT,
                      background: isActive ? GOLD_BG : undefined,
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <Icon className="w-[14px] h-[14px]" strokeWidth={isActive ? 2.2 : 1.8} />
                    {section.label}
                    <ChevronDown className="w-3 h-3 opacity-60" strokeWidth={2} />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={6}
                  className="p-1.5 w-56 border-border/60"
                >
                  {children.map(child => {
                    const childActive = location.pathname.startsWith(child.path);
                    const ChildIcon = child.icon;
                    return (
                      <Link
                        key={child.path}
                        to={child.path}
                        onClick={() => setOpenMenu(null)}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors hover:bg-muted/60"
                        style={{
                          color: childActive ? GOLD : 'hsl(var(--foreground))',
                          background: childActive ? GOLD_BG : undefined,
                          fontWeight: childActive ? 600 : 500,
                        }}
                      >
                        <ChildIcon className="w-4 h-4 opacity-80" strokeWidth={childActive ? 2.2 : 1.8} />
                        {child.label}
                      </Link>
                    );
                  })}
                </PopoverContent>
              </Popover>
            );
          })}
        </nav>

        {/* Right: Search + icon cluster + Avatar */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="w-[200px] sm:w-[260px] lg:w-[320px]">
            <GlobalLeadSearch />
          </div>

          <div className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-muted/30 px-0.5 py-0.5">
            {isOwnerOrAdmin && (
              <Link
                to={SETTINGS_ITEM.path}
                aria-label="CRM Settings"
                className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-background/80"
                style={{
                  color: location.pathname.startsWith(SETTINGS_ITEM.path) ? GOLD : INACTIVE_TEXT,
                }}
              >
                <Settings className="w-[15px] h-[15px]" strokeWidth={1.8} />
              </Link>
            )}
            <button
              className="relative h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-[15px] h-[15px]" strokeWidth={1.8} />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full ring-1 ring-background" />
            </button>
          </div>

          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ring-2 ring-background shadow-sm"
            style={{ background: GOLD }}
          >
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
