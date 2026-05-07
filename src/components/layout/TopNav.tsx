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
  ChevronDown, LayoutDashboard, GitBranch, Handshake, DollarSign, Building2,
  Receipt, TrendingUp, BarChart2, Network,
  Users, Kanban, Mail, MessageCircle, LayoutTemplate, BookUser, Zap,
  CalendarDays, BarChart3, Settings, Plug, ShieldAlert, LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GlobalLeadSearch } from '@/components/crm/GlobalLeadSearch';

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
          { label: 'Inbox',        path: '/crm/inbox',     icon: Mail,           description: 'Email, SMS & WhatsApp' },
          { label: 'Email Center', path: '/crm/email',     icon: MessageCircle,  description: 'Campaigns & broadcasts' },
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

// Theme toggle and other utility buttons live in the right rail (RightRail.tsx).

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

  // Hide top header on mobile for ALL routes — the bottom nav handles primary
  // nav, and individual pages render their own mobile header so the top bar
  // doesn't waste vertical space with just a logo.
  return (
    <>
      <header
        className="hidden lg:block sticky top-0 z-40 backdrop-blur-xl native-chrome"
        style={{ background: NAV_BG, borderBottom: `1px solid ${NAV_BORDER}`, paddingTop: 'env(safe-area-inset-top, 0px)', paddingRight: '52px' }}
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
                      {isOpen && <span className="absolute left-0 right-0 -bottom-3 h-3" aria-hidden />}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    onMouseEnter={() => openWithDelay(section.label)}
                    onMouseLeave={scheduleClose}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    forceMount={undefined}
                    className={cn(
                      'border-0 shadow-2xl origin-top',
                      'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                      'data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-150',
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

          {/* Right-aligned global CRM search */}
          <div className="flex-1 flex justify-end">
            {isCrmMember && location.pathname.startsWith('/crm') && (
              <div className="hidden md:block">
                <GlobalLeadSearch />
              </div>
            )}
          </div>
          <div className="hidden lg:block w-2" />
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

