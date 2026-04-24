import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import logoMark from '@/assets/logo-mark.png';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useAdmin';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import {
  Bell, Search, Settings2, ShieldAlert, LogOut, ChevronDown, Menu, X,
  Command, LayoutDashboard, GitBranch, Handshake, DollarSign, Building2,
  Receipt, TrendingUp, BarChart2, Network,
  Users, Kanban, Mail, MessageCircle, LayoutTemplate, BookUser, Zap,
  CalendarDays, BarChart3, Settings, Plug,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface NavChild { label: string; path: string; icon: LucideIcon; description?: string; ownerAdminOnly?: boolean; crmOnly?: boolean; }
interface NavSection { label: string; path?: string; children?: NavChild[]; crmOnly?: boolean; }

const SECTIONS: NavSection[] = [
  {
    label: 'Workspace',
    children: [
      { label: 'Command Center', path: '/command-center', icon: Command,         description: 'Daily HQ & focus' },
      { label: 'Dashboard',      path: '/dashboard',      icon: LayoutDashboard, description: 'KPIs & overview' },
    ],
  },
  {
    label: 'Production',
    children: [
      { label: 'Pipeline',         path: '/pipeline',  icon: GitBranch,  description: 'Deal flow stages' },
      { label: 'Deals',            path: '/deals',     icon: Handshake,  description: 'All transactions' },
      { label: 'Payouts',          path: '/payouts',   icon: DollarSign, description: 'Commission tracking' },
      { label: 'Client Inventory', path: '/inventory', icon: Building2,  description: 'Client portfolio' },
    ],
  },
  {
    label: 'Finance',
    children: [
      { label: 'Expenses',  path: '/expenses',  icon: Receipt,   description: 'Track spending' },
      { label: 'Forecast',  path: '/forecast',  icon: TrendingUp, description: 'Revenue projections' },
      { label: 'Analytics', path: '/analytics', icon: BarChart2, description: 'Business insights' },
    ],
  },
  {
    label: 'CRM',
    crmOnly: true,
    children: [
      { label: 'CRM Dashboard',  path: '/crm/dashboard',   icon: LayoutDashboard, description: 'CRM overview' },
      { label: 'Leads',          path: '/crm/leads',       icon: Users,           description: 'All leads & contacts' },
      { label: 'Pipeline',       path: '/crm/pipeline',    icon: Kanban,          description: 'Lead pipeline' },
      { label: 'Email Center',   path: '/crm/email',       icon: Mail,            description: 'Campaigns & inbox' },
      { label: 'WhatsApp',       path: '/crm/whatsapp',    icon: MessageCircle,   description: 'Conversations' },
      { label: 'Templates',      path: '/crm/templates',   icon: LayoutTemplate,  description: 'Email templates' },
      { label: 'Calendar',       path: '/crm/calendar',    icon: CalendarDays,    description: 'Showings & events' },
      { label: 'Reports',        path: '/crm/reports',     icon: BarChart3,       description: 'CRM analytics' },
      { label: 'Automations',    path: '/crm/automations', icon: Zap,             description: 'Triggers & workflows', ownerAdminOnly: true },
      { label: 'Integrations',   path: '/crm/integrations',icon: Plug,            description: 'Connect platforms',    ownerAdminOnly: true },
      { label: 'CRM Settings',   path: '/crm/settings',    icon: Settings,        description: 'CRM configuration',    ownerAdminOnly: true },
    ],
  },
  {
    label: 'Network',
    path: '/network',
  },
];

const GOLD = 'hsl(39 67% 55%)';
const GOLD_BG = 'hsl(39 67% 55% / 0.12)';
const DARK_BG = 'hsl(222 25% 9%)';
const DARK_BORDER = 'hsl(222 20% 14% / 0.8)';
const INACTIVE_TEXT = 'hsl(220 8% 65%)';

function isPathActive(pathname: string, path: string): boolean {
  if (path === '/dashboard') return pathname === '/dashboard';
  return pathname === path || pathname.startsWith(path + '/');
}

export function TopNav() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { isMember: isCrmMember, isOwnerOrAdmin: isCrmAdmin } = useCrmAccess();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  // Close on route change
  useEffect(() => { setOpenSection(null); setMobileOpen(false); }, [location.pathname]);

  const visibleSections = SECTIONS.filter(s => !s.crmOnly || isCrmMember);

  const filterChildren = (children?: NavChild[]) =>
    (children ?? []).filter(c => !c.ownerAdminOnly || isCrmAdmin);

  const isSectionActive = (s: NavSection) => {
    if (s.path) return isPathActive(location.pathname, s.path);
    return filterChildren(s.children).some(c => isPathActive(location.pathname, c.path));
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() || 'U';

  function openWithDelay(label: string) {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpenSection(label);
  }

  function scheduleClose() {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setOpenSection(null), 120);
  }

  return (
    <>
      <header
        className="sticky top-0 z-40 backdrop-blur-xl"
        style={{ background: DARK_BG, borderBottom: `1px solid ${DARK_BORDER}`, paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center h-[54px] px-3 sm:px-4 lg:px-6 gap-2 sm:gap-4">
          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="lg:hidden h-9 w-9 flex items-center justify-center rounded-lg transition-colors hover:bg-white/5"
                style={{ color: INACTIVE_TEXT }}
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" strokeWidth={2} />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[280px] border-r-0" style={{ background: DARK_BG }}>
              <MobileNavSheet
                sections={visibleSections}
                filterChildren={filterChildren}
                isAdmin={!!isAdmin}
                onSignOut={signOut}
                pathname={location.pathname}
              />
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 group shrink-0">
            <img
              src={logoMark}
              alt="Dealzflow"
              className="w-[26px] h-[26px] rounded-[7px] transition-opacity group-hover:opacity-80"
            />
            <span className="hidden sm:inline-block font-semibold text-[15px] tracking-[-0.02em] text-white">
              Dealz<span style={{ color: GOLD }}>flow</span>
            </span>
          </Link>

          {/* Divider */}
          <div className="hidden lg:block h-6 w-px" style={{ background: 'hsl(222 20% 18%)' }} />

          {/* Desktop top nav */}
          <nav className="hidden lg:flex items-center gap-0.5 flex-1">
            {visibleSections.map(section => {
              const sectionActive = isSectionActive(section);

              if (section.path) {
                return (
                  <Link
                    key={section.label}
                    to={section.path}
                    className="flex items-center h-9 px-3 rounded-lg text-[13px] transition-colors"
                    style={{
                      color: sectionActive ? GOLD : INACTIVE_TEXT,
                      background: sectionActive ? GOLD_BG : 'transparent',
                      fontWeight: sectionActive ? 600 : 500,
                    }}
                  >
                    {section.label}
                  </Link>
                );
              }

              const children = filterChildren(section.children);
              if (!children.length) return null;
              const isOpen = openSection === section.label;

              return (
                <DropdownMenu
                  key={section.label}
                  open={isOpen}
                  onOpenChange={(open) => setOpenSection(open ? section.label : null)}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      onMouseEnter={() => openWithDelay(section.label)}
                      onMouseLeave={scheduleClose}
                      className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] transition-colors hover:bg-white/5 focus:outline-none"
                      style={{
                        color: sectionActive ? GOLD : INACTIVE_TEXT,
                        background: sectionActive ? GOLD_BG : 'transparent',
                        fontWeight: sectionActive ? 600 : 500,
                      }}
                    >
                      {section.label}
                      <ChevronDown
                        className={cn('w-3 h-3 transition-transform duration-200 opacity-70', isOpen && 'rotate-180')}
                        strokeWidth={2.2}
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    onMouseEnter={() => openWithDelay(section.label)}
                    onMouseLeave={scheduleClose}
                    className="p-1.5 min-w-[260px] border-0 shadow-2xl"
                    style={{ background: 'hsl(222 25% 12%)', border: `1px solid ${DARK_BORDER}` }}
                  >
                    {children.map(child => {
                      const childActive = isPathActive(location.pathname, child.path);
                      const ChildIcon = child.icon;
                      return (
                        <Link
                          key={child.path}
                          to={child.path}
                          onClick={() => setOpenSection(null)}
                          className="flex items-start gap-2.5 px-2.5 py-2 rounded-md transition-colors group"
                          style={{
                            background: childActive ? GOLD_BG : 'transparent',
                            color: childActive ? GOLD : 'hsl(220 10% 80%)',
                          }}
                          onMouseEnter={(e) => {
                            if (!childActive) e.currentTarget.style.background = 'hsl(222 20% 16%)';
                          }}
                          onMouseLeave={(e) => {
                            if (!childActive) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div
                            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                            style={{
                              background: childActive ? 'hsl(39 67% 55% / 0.18)' : 'hsl(222 20% 16%)',
                            }}
                          >
                            <ChildIcon
                              className="w-3.5 h-3.5"
                              strokeWidth={childActive ? 2.2 : 1.8}
                              style={{ color: childActive ? GOLD : 'hsl(220 10% 70%)' }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold leading-tight">
                              {child.label}
                            </div>
                            {child.description && (
                              <div className="text-[11px] mt-0.5 leading-tight" style={{ color: 'hsl(220 8% 55%)' }}>
                                {child.description}
                              </div>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>

          {/* Spacer for mobile */}
          <div className="flex-1 lg:hidden" />

          {/* Right utility cluster */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
              style={{ color: INACTIVE_TEXT }}
              aria-label="Search"
            >
              <Search className="w-[15px] h-[15px]" strokeWidth={1.8} />
            </button>
            <button
              className="relative h-9 w-9 flex items-center justify-center rounded-lg transition-colors hover:bg-white/5"
              style={{ color: INACTIVE_TEXT }}
              aria-label="Notifications"
            >
              <Bell className="w-[15px] h-[15px]" strokeWidth={1.8} />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full" style={{ background: 'hsl(0 80% 60%)' }} />
            </button>
            <Link
              to="/settings"
              aria-label="Settings"
              className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
              style={{ color: isPathActive(location.pathname, '/settings') ? GOLD : INACTIVE_TEXT }}
            >
              <Settings2 className="w-[15px] h-[15px]" strokeWidth={1.8} />
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 flex items-center gap-1.5 rounded-full pr-1 pl-0.5 py-0.5 transition-colors hover:bg-white/5 focus:outline-none"
                  aria-label="Account menu"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10.5px] font-bold text-white"
                    style={{ background: GOLD }}
                  >
                    {initials}
                  </div>
                  <ChevronDown className="hidden sm:block w-3 h-3 opacity-60" style={{ color: INACTIVE_TEXT }} strokeWidth={2.2} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="p-1.5 min-w-[200px] border-0"
                style={{ background: 'hsl(222 25% 12%)', border: `1px solid ${DARK_BORDER}` }}
              >
                <div className="px-2.5 py-2 mb-1 border-b" style={{ borderColor: 'hsl(222 20% 16%)' }}>
                  <div className="text-[11px]" style={{ color: 'hsl(220 8% 55%)' }}>Signed in as</div>
                  <div className="text-[12.5px] font-medium truncate" style={{ color: 'hsl(220 10% 85%)' }}>
                    {user?.email}
                  </div>
                </div>
                <Link
                  to="/settings"
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors"
                  style={{ color: 'hsl(220 10% 80%)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(222 20% 16%)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Settings2 className="w-4 h-4" strokeWidth={1.8} />
                  Settings
                </Link>
                {isAdmin && (
                  <Link
                    to="/admin"
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors"
                    style={{ color: 'hsl(38 90% 60%)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(38 90% 60% / 0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <ShieldAlert className="w-4 h-4" strokeWidth={1.8} />
                    Admin
                  </Link>
                )}
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors"
                  style={{ color: 'hsl(0 70% 65%)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(0 70% 65% / 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <LogOut className="w-4 h-4" strokeWidth={1.8} />
                  Sign out
                </button>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </>
  );
}

function MobileNavSheet({
  sections,
  filterChildren,
  isAdmin,
  onSignOut,
  pathname,
}: {
  sections: NavSection[];
  filterChildren: (c?: NavChild[]) => NavChild[];
  isAdmin: boolean;
  onSignOut: () => void;
  pathname: string;
}) {
  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-4 h-[56px] border-b"
        style={{ borderColor: DARK_BORDER }}
      >
        <Link to="/dashboard" className="flex items-center gap-2">
          <img src={logoMark} alt="Dealzflow" className="w-[24px] h-[24px] rounded-[6px]" />
          <span className="font-semibold text-[14px] tracking-[-0.02em] text-white">
            Dealz<span style={{ color: GOLD }}>flow</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
        {sections.map(section => {
          if (section.path) {
            const active = isPathActive(pathname, section.path);
            return (
              <Link
                key={section.label}
                to={section.path}
                className="flex items-center px-3 py-2.5 rounded-lg text-[13px]"
                style={{
                  color: active ? GOLD : INACTIVE_TEXT,
                  background: active ? GOLD_BG : 'transparent',
                  fontWeight: active ? 600 : 500,
                }}
              >
                {section.label}
              </Link>
            );
          }
          const children = filterChildren(section.children);
          if (!children.length) return null;
          return (
            <div key={section.label}>
              <div
                className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: 'hsl(220 8% 50%)' }}
              >
                {section.label}
              </div>
              <div className="space-y-0.5">
                {children.map(child => {
                  const active = isPathActive(pathname, child.path);
                  const Icon = child.icon;
                  return (
                    <Link
                      key={child.path}
                      to={child.path}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px]"
                      style={{
                        color: active ? GOLD : INACTIVE_TEXT,
                        background: active ? GOLD_BG : 'transparent',
                        fontWeight: active ? 600 : 500,
                      }}
                    >
                      <Icon className="w-4 h-4 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="pt-2 mt-2 border-t space-y-0.5" style={{ borderColor: DARK_BORDER }}>
          <Link
            to="/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px]"
            style={{
              color: isPathActive(pathname, '/settings') ? GOLD : INACTIVE_TEXT,
              background: isPathActive(pathname, '/settings') ? GOLD_BG : 'transparent',
            }}
          >
            <Settings2 className="w-4 h-4" strokeWidth={1.8} />
            Settings
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px]"
              style={{ color: 'hsl(38 90% 60%)' }}
            >
              <ShieldAlert className="w-4 h-4" strokeWidth={1.8} />
              Admin
            </Link>
          )}
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px]"
            style={{ color: 'hsl(0 70% 65%)' }}
          >
            <LogOut className="w-4 h-4" strokeWidth={1.8} />
            Sign out
          </button>
        </div>
      </nav>
    </div>
  );
}
