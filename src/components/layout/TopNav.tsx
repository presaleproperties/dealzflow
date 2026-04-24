import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import logoMark from '@/assets/logo-mark.png';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useAdmin';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import {
  Bell, Search, Settings2, ShieldAlert, LogOut, ChevronDown, Menu, X,
  Command, LayoutDashboard, GitBranch, Handshake, DollarSign, Building2,
  Receipt, TrendingUp, BarChart2, Network, Sun, Moon, Monitor,
  Users, Kanban, Mail, MessageCircle, LayoutTemplate, BookUser, Zap,
  CalendarDays, BarChart3, Settings, Plug,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface NavChild { label: string; path: string; icon: LucideIcon; description?: string; ownerAdminOnly?: boolean; crmOnly?: boolean; }
interface NavGroup { label: string; children: NavChild[]; }
interface NavSection { label: string; path?: string; children?: NavChild[]; groups?: NavGroup[]; crmOnly?: boolean; }

const SECTIONS: NavSection[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
  },
  {
    label: 'Production',
    children: [
      { label: 'Pipeline',         path: '/pipeline',  icon: GitBranch,  description: 'Deal flow stages' },
      { label: 'Deals',            path: '/deals',     icon: Handshake,  description: 'All transactions' },
      { label: 'Payouts',          path: '/payouts',   icon: DollarSign, description: 'Commission tracking' },
      { label: 'Client Inventory', path: '/inventory', icon: Building2,  description: 'Client portfolio' },
      { label: 'Network',          path: '/network',   icon: Network,    description: 'Agent network & revshare' },
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
    groups: [
      {
        label: 'Engage',
        children: [
          
          { label: 'Leads',         path: '/crm/leads',     icon: Users,           description: 'All leads & contacts' },
          { label: 'Pipeline',      path: '/crm/pipeline',  icon: Kanban,          description: 'Lead pipeline' },
          { label: 'Calendar',      path: '/crm/calendar',  icon: CalendarDays,    description: 'Showings & events' },
        ],
      },
      {
        label: 'Marketing',
        children: [
          { label: 'Email Center', path: '/crm/email',     icon: Mail,           description: 'Campaigns & inbox' },
          { label: 'Templates',    path: '/crm/templates', icon: LayoutTemplate, description: 'Email templates' },
          { label: 'Reports',      path: '/crm/reports',   icon: BarChart3,      description: 'CRM analytics' },
        ],
      },
      {
        label: 'Admin',
        children: [
          { label: 'Automations',  path: '/crm/automations',  icon: Zap,      description: 'Triggers & workflows', ownerAdminOnly: true },
          { label: 'Integrations', path: '/crm/integrations', icon: Plug,     description: 'Connect platforms',    ownerAdminOnly: true },
          { label: 'CRM Settings', path: '/crm/settings',     icon: Settings, description: 'CRM configuration',    ownerAdminOnly: true },
        ],
      },
    ],
  },
];

// Themed tokens — driven by index.css (light/dark switch automatically)
const GOLD = 'hsl(var(--primary))';
const GOLD_BG = 'hsl(var(--primary) / 0.12)';
const NAV_BG = 'hsl(var(--background) / 0.92)';
const NAV_BORDER = 'hsl(var(--border) / 0.8)';
const INACTIVE_TEXT = 'hsl(var(--muted-foreground))';
const HOVER_BG = 'hsl(var(--muted) / 0.6)';
const SURFACE_BG = 'hsl(var(--card))';
const SURFACE_STRONG = 'hsl(var(--popover))';
const FG_STRONG = 'hsl(var(--foreground))';
const FG_MUTED = 'hsl(var(--muted-foreground))';

const THEME_CYCLE: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];

function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings({ silent: true });

  // On mount: restore theme from DB if user is logged in
  useEffect(() => {
    if (settings?.theme && settings.theme !== theme) {
      setTheme(settings.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.theme]);

  function handleCycle() {
    const current = (theme as 'light' | 'dark' | 'system') ?? 'system';
    const idx = THEME_CYCLE.indexOf(current);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
    if (user) updateSettings.mutate({ theme: next });
  }

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const label = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System';

  return (
    <button
      onClick={handleCycle}
      aria-label={`Theme: ${label}. Click to cycle.`}
      title={`Theme: ${label}`}
      className="h-9 w-9 flex items-center justify-center rounded-lg transition-colors hover:bg-foreground/5"
      style={{ color: INACTIVE_TEXT }}
    >
      <Icon className="w-[15px] h-[15px]" strokeWidth={1.8} />
    </button>
  );
}

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
  const [signOutOpen, setSignOutOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const requestSignOut = () => setSignOutOpen(true);

  // Close on route change
  useEffect(() => { setOpenSection(null); setMobileOpen(false); }, [location.pathname]);

  const visibleSections = SECTIONS.filter(s => !s.crmOnly || isCrmMember);

  const filterChildren = (children?: NavChild[]) =>
    (children ?? []).filter(c => !c.ownerAdminOnly || isCrmAdmin);

  const filterGroups = (groups?: NavGroup[]) =>
    (groups ?? [])
      .map(g => ({ ...g, children: filterChildren(g.children) }))
      .filter(g => g.children.length > 0);

  const isSectionActive = (s: NavSection) => {
    if (s.path) return isPathActive(location.pathname, s.path);
    if (s.groups) {
      return filterGroups(s.groups).some(g =>
        g.children.some(c => isPathActive(location.pathname, c.path))
      );
    }
    return filterChildren(s.children).some(c => isPathActive(location.pathname, c.path));
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() || 'U';

  function openWithDelay(label: string) {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    // Instant swap when moving between triggers — no flicker
    setOpenSection(prev => (prev === label ? prev : label));
  }

  function scheduleClose() {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setOpenSection(null), 180);
  }

  return (
    <>
      <header
        className="sticky top-0 z-40 backdrop-blur-xl"
        style={{ background: NAV_BG, borderBottom: `1px solid ${NAV_BORDER}`, paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center h-[54px] px-3 sm:px-4 lg:px-6 gap-2 sm:gap-4">
          {/* Mobile hamburger removed — bottom tab bar handles primary nav on mobile/tablet */}

          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 group shrink-0">
            <img
              src={logoMark}
              alt="Dealzflow"
              className="w-[26px] h-[26px] rounded-[7px] transition-opacity group-hover:opacity-80"
            />
            <span className="hidden sm:inline-block font-semibold text-[15px] tracking-[-0.02em] text-foreground">
              Dealz<span style={{ color: GOLD }}>flow</span>
            </span>
          </Link>

          {/* Divider */}
          <div className="hidden lg:block h-6 w-px" style={{ background: 'hsl(var(--border))' }} />

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

              const groups = section.groups ? filterGroups(section.groups) : null;
              const children = !groups ? filterChildren(section.children) : [];
              const hasContent = groups ? groups.length > 0 : children.length > 0;
              if (!hasContent) return null;
              const isOpen = openSection === section.label;
              const isMega = !!groups;

              const renderItem = (child: NavChild) => {
                const childActive = isPathActive(location.pathname, child.path);
                const ChildIcon = child.icon;
                return (
                  <Link
                    key={child.path}
                    to={child.path}
                    onClick={() => setOpenSection(null)}
                    className="relative flex items-start gap-2.5 px-2.5 py-2 rounded-md transition-all duration-200 ease-out group will-change-transform"
                    style={{
                      background: childActive ? GOLD_BG : 'transparent',
                      color: childActive ? GOLD : FG_STRONG,
                    }}
                    onMouseEnter={(e) => {
                      if (!childActive) {
                        e.currentTarget.style.background = HOVER_BG;
                        e.currentTarget.style.transform = 'translateX(2px)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!childActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.transform = 'translateX(0)';
                      }
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all duration-200 ease-out group-hover:scale-105"
                      style={{
                        background: childActive ? 'hsl(var(--primary) / 0.18)' : HOVER_BG,
                      }}
                    >
                      <ChildIcon
                        className="w-3.5 h-3.5 transition-transform duration-200 ease-out"
                        strokeWidth={childActive ? 2.2 : 1.8}
                        style={{ color: childActive ? GOLD : FG_MUTED }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold leading-tight">
                        {child.label}
                      </div>
                      {child.description && (
                        <div className="text-[11px] mt-0.5 leading-tight" style={{ color: FG_MUTED }}>
                          {child.description}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              };

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
                      onFocus={() => openWithDelay(section.label)}
                      className="relative flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] transition-colors duration-150 ease-out focus:outline-none"
                      style={{
                        color: sectionActive || isOpen ? GOLD : INACTIVE_TEXT,
                        background: sectionActive ? GOLD_BG : isOpen ? HOVER_BG : 'transparent',
                        fontWeight: sectionActive ? 600 : 500,
                      }}
                    >
                      {section.label}
                      <ChevronDown
                        className={cn('w-3 h-3 transition-transform duration-300 ease-out opacity-70', isOpen && 'rotate-180')}
                        strokeWidth={2.2}
                      />
                      {/* Bridge under trigger to keep hover continuous into menu */}
                      {isOpen && <span className="absolute left-0 right-0 -bottom-2 h-2" aria-hidden />}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={2}
                    onMouseEnter={() => openWithDelay(section.label)}
                    onMouseLeave={scheduleClose}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    className={cn(
                      'border-0 shadow-2xl origin-top',
                      'data-[state=open]:animate-in data-[state=closed]:animate-out',
                      'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
                      'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
                      'data-[state=open]:slide-in-from-top-1 data-[state=closed]:slide-out-to-top-1',
                      'data-[state=open]:duration-150 data-[state=closed]:duration-100',
                      isMega ? 'p-2 min-w-[640px]' : 'p-1.5 min-w-[260px]',
                    )}
                    style={{
                      background: SURFACE_STRONG,
                      border: `1px solid ${NAV_BORDER}`,
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      boxShadow: '0 20px 48px -12px hsl(0 0% 0% / 0.6), 0 8px 16px -8px hsl(0 0% 0% / 0.4)',
                    }}
                  >
                    {/* Invisible hover bridge to prevent flicker between trigger and menu */}
                    <div className="absolute -top-3 left-0 right-0 h-3" aria-hidden />
                    {isMega ? (
                      <div
                        className="grid gap-x-3 gap-y-1"
                        style={{ gridTemplateColumns: `repeat(${groups!.length}, minmax(0, 1fr))` }}
                      >
                        {groups!.map(group => (
                          <div key={group.label} className="min-w-[200px]">
                            <div
                              className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                              style={{ color: FG_MUTED }}
                            >
                              {group.label}
                            </div>
                            <div className="space-y-0.5">
                              {group.children.map(renderItem)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      children.map(renderItem)
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>

          {/* Spacer for mobile */}
          <div className="flex-1 lg:hidden" />

          {/* Right utility cluster */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <ThemeToggleButton />
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
                style={{ background: SURFACE_STRONG, border: `1px solid ${NAV_BORDER}` }}
              >
                <div className="px-2.5 py-2 mb-1 border-b" style={{ borderColor: HOVER_BG }}>
                  <div className="text-[11px]" style={{ color: FG_MUTED }}>Signed in as</div>
                  <div className="text-[12.5px] font-medium truncate" style={{ color: FG_STRONG }}>
                    {user?.email}
                  </div>
                </div>
                <Link
                  to="/settings"
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors"
                  style={{ color: FG_STRONG }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Settings2 className="w-4 h-4" strokeWidth={1.8} />
                  Settings
                </Link>
                {isAdmin && (
                  <Link
                    to="/admin"
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors"
                    style={{ color: 'hsl(var(--warning))' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--warning) / 0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <ShieldAlert className="w-4 h-4" strokeWidth={1.8} />
                    Admin
                  </Link>
                )}
                <button
                  onClick={requestSignOut}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors"
                  style={{ color: 'hsl(var(--destructive))' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(var(--destructive) / 0.1)'; }}
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

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to sign back in to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setSignOutOpen(false); signOut(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        className="flex items-center justify-between px-5 h-[60px] border-b shrink-0"
        style={{ borderColor: NAV_BORDER }}
      >
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <img src={logoMark} alt="Dealzflow" className="w-[26px] h-[26px] rounded-[7px]" />
          <span className="font-semibold text-[15px] tracking-[-0.02em] text-foreground">
            Dealz<span style={{ color: GOLD }}>flow</span>
          </span>
        </Link>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-3 py-5 space-y-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        {sections.map(section => {
          if (section.path) {
            const active = isPathActive(pathname, section.path);
            return (
              <Link
                key={section.label}
                to={section.path}
                className="flex items-center min-h-[44px] px-3.5 rounded-xl text-[14px] active:scale-[0.98] transition-transform"
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
                className="px-3.5 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: FG_MUTED }}
              >
                {section.label}
              </div>
              <div className="space-y-1">
                {children.map(child => {
                  const active = isPathActive(pathname, child.path);
                  const Icon = child.icon;
                  return (
                    <Link
                      key={child.path}
                      to={child.path}
                      className="flex items-center gap-3.5 min-h-[44px] px-3.5 rounded-xl text-[14px] active:scale-[0.98] transition-transform"
                      style={{
                        color: active ? GOLD : INACTIVE_TEXT,
                        background: active ? GOLD_BG : 'transparent',
                        fontWeight: active ? 600 : 500,
                      }}
                    >
                      <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="pt-4 mt-2 border-t space-y-1" style={{ borderColor: NAV_BORDER }}>
          <Link
            to="/settings"
            className="flex items-center gap-3.5 min-h-[44px] px-3.5 rounded-xl text-[14px] active:scale-[0.98] transition-transform"
            style={{
              color: isPathActive(pathname, '/settings') ? GOLD : INACTIVE_TEXT,
              background: isPathActive(pathname, '/settings') ? GOLD_BG : 'transparent',
              fontWeight: isPathActive(pathname, '/settings') ? 600 : 500,
            }}
          >
            <Settings2 className="w-[18px] h-[18px]" strokeWidth={1.8} />
            Settings
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className="flex items-center gap-3.5 min-h-[44px] px-3.5 rounded-xl text-[14px] active:scale-[0.98] transition-transform"
              style={{ color: 'hsl(var(--warning))', fontWeight: 500 }}
            >
              <ShieldAlert className="w-[18px] h-[18px]" strokeWidth={1.8} />
              Admin
            </Link>
          )}
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-3.5 min-h-[44px] px-3.5 rounded-xl text-[14px] active:scale-[0.98] transition-transform"
            style={{ color: 'hsl(var(--destructive))', fontWeight: 500 }}
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.8} />
            Sign out
          </button>
        </div>
      </nav>
    </div>
  );
}
