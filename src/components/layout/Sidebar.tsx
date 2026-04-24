import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import logoMark from '@/assets/logo-mark.png';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useAdmin';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { useState, useEffect, createContext } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChevronLeft, ChevronRight, ChevronDown,
  LayoutDashboard, GitBranch, Handshake, DollarSign,
  Receipt, TrendingUp, BarChart2, Building2, Network, Settings2, ShieldAlert,
  LogOut, Command, Users, Kanban, Mail, LayoutTemplate,
  Zap, CalendarDays, BarChart3, Settings, Plug,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem { label: string; path: string; icon: LucideIcon; }
interface NavSection { id: string; label: string; items: NavItem[]; defaultOpen?: boolean; }

const navSections: NavSection[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    defaultOpen: true,
    items: [
      { label: 'Command Center', path: '/command-center', icon: Command },
      { label: 'Dashboard',      path: '/dashboard',      icon: LayoutDashboard },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    defaultOpen: true,
    items: [
      { label: 'Pipeline',         path: '/pipeline',  icon: GitBranch },
      { label: 'Deals',            path: '/deals',     icon: Handshake },
      { label: 'Payouts',          path: '/payouts',   icon: DollarSign },
      { label: 'Client Inventory', path: '/inventory', icon: Building2 },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    defaultOpen: true,
    items: [
      { label: 'Expenses',  path: '/expenses',  icon: Receipt },
      { label: 'Forecast',  path: '/forecast',  icon: TrendingUp },
      { label: 'Analytics', path: '/analytics', icon: BarChart2 },
    ],
  },
  {
    id: 'network',
    label: 'Network',
    defaultOpen: false,
    items: [
      { label: 'Network', path: '/network', icon: Network },
    ],
  },
];

const crmNavItems: NavItem[] = [
  { label: 'Dashboard',    path: '/crm/dashboard',    icon: LayoutDashboard },
  { label: 'Leads',        path: '/crm/leads',        icon: Users },
  { label: 'Pipeline',     path: '/crm/pipeline',     icon: Kanban },
  { label: 'Email Center', path: '/crm/email',        icon: Mail },
  { label: 'Templates',    path: '/crm/templates',    icon: LayoutTemplate },
  { label: 'Automations',  path: '/crm/automations',  icon: Zap },
  { label: 'Calendar',     path: '/crm/calendar',     icon: CalendarDays },
  { label: 'Reports',      path: '/crm/reports',      icon: BarChart3 },
  { label: 'Settings',     path: '/crm/settings',     icon: Settings },
  { label: 'Integrations', path: '/crm/integrations', icon: Plug },
];

const ownerAdminOnlyCrmPaths = new Set(['/crm/automations', '/crm/settings', '/crm/integrations']);

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';
const SIDEBAR_GROUPS_KEY    = 'sidebar-groups-open-v2';

// Gold accent palette
const GOLD = 'hsl(39 67% 55%)';
const GOLD_BG_ACTIVE = 'hsl(39 67% 55% / 0.10)';
const DARK_BG = 'hsl(222 25% 9%)';
const DARK_BORDER = 'hsl(222 20% 14% / 0.7)';
const INACTIVE_TEXT = 'hsl(220 8% 60%)';
const SECTION_LABEL = 'hsl(220 6% 50%)';

export const SidebarCollapsedContext = createContext<boolean>(false);

function readGroupsState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SIDEBAR_GROUPS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return {};
}

export function Sidebar({ forceVisible = false }: { forceVisible?: boolean }) {
  const location = useLocation();
  const { signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { isMember: isCrmMember, isOwnerOrAdmin: isCrmAdmin } = useCrmAccess();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === 'true';
  });
  const [groupsOpen, setGroupsOpen] = useState<Record<string, boolean>>(readGroupsState);

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      window.dispatchEvent(new CustomEvent('sidebar-collapsed-change', { detail: next }));
      return next;
    });
  };

  const persistGroups = (next: Record<string, boolean>) => {
    setGroupsOpen(next);
    try { localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(next)); } catch { /* noop */ }
  };

  const isActivePath = (path: string) =>
    location.pathname === path || (path !== '/dashboard' && location.pathname.startsWith(path));

  const isGroupOpen = (sec: NavSection) => {
    // Always open if any child is active
    if (sec.items.some(i => isActivePath(i.path))) return true;
    if (sec.id in groupsOpen) return groupsOpen[sec.id];
    return sec.defaultOpen ?? true;
  };

  const sbBg = { background: DARK_BG };
  const sbBorder = `1px solid ${DARK_BORDER}`;

  const NavLink = ({ item, indent = false }: { item: NavItem; indent?: boolean }) => {
    const isActive = isActivePath(item.path);
    const linkEl = (
      <Link
        to={item.path}
        className={cn(
          'relative flex items-center gap-3 rounded-lg text-[13px] transition-colors duration-150 group select-none',
          isCollapsed ? 'justify-center w-10 h-10 mx-auto' : 'h-9 px-2.5',
          indent && !isCollapsed && 'ml-[18px]',
        )}
        style={{
          background: isActive ? GOLD_BG_ACTIVE : 'transparent',
          color: isActive ? GOLD : INACTIVE_TEXT,
          fontWeight: isActive ? 600 : 500,
        }}
      >
        {/* Active indicator bar */}
        {isActive && !isCollapsed && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full"
            style={{ background: GOLD }}
            aria-hidden
          />
        )}
        <item.icon
          className={cn('flex-shrink-0', isCollapsed ? 'w-[17px] h-[17px]' : 'w-[15px] h-[15px]')}
          strokeWidth={isActive ? 2 : 1.6}
        />
        {!isCollapsed && (
          <span className="truncate leading-none tracking-[-0.005em]">{item.label}</span>
        )}
      </Link>
    );

    if (isCollapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium text-xs">{item.label}</TooltipContent>
        </Tooltip>
      );
    }
    return linkEl;
  };

  const SectionHeader = ({ section }: { section: NavSection }) => {
    const open = isGroupOpen(section);
    return (
      <button
        onClick={() => persistGroups({ ...groupsOpen, [section.id]: !open })}
        className="w-full group flex items-center gap-1 px-2.5 h-7 text-[10.5px] font-semibold uppercase tracking-[0.08em] transition-colors hover:text-foreground/80"
        style={{ color: SECTION_LABEL }}
      >
        <ChevronDown
          className={cn(
            'w-3 h-3 transition-transform duration-200 opacity-60 group-hover:opacity-100',
            !open && '-rotate-90',
          )}
          strokeWidth={2}
        />
        <span>{section.label}</span>
      </button>
    );
  };

  return (
    <aside
      style={{ ...sbBg, borderRight: sbBorder }}
      className={cn(
        'flex-col h-screen transition-all duration-300 ease-in-out z-40',
        forceVisible ? 'flex relative w-full' : 'hidden lg:flex fixed left-0 top-0',
        !forceVisible && (isCollapsed ? 'w-[60px]' : 'w-[232px]'),
      )}
    >
      {/* Logo */}
      <div
        style={{ borderBottom: sbBorder }}
        className={cn(
          'flex items-center h-[56px]',
          isCollapsed ? 'justify-center px-0' : 'px-4',
        )}>
        <Link to="/dashboard" className="flex items-center gap-2.5 group">
          <img
            src={logoMark}
            alt="Dealzflow"
            className={cn(
              'rounded-[8px] flex-shrink-0 transition-opacity duration-200 group-hover:opacity-80',
              isCollapsed ? 'w-6 h-6' : 'w-[26px] h-[26px]',
            )}
          />
          <span
            className={cn(
              'transition-all duration-300 font-semibold text-[14px] tracking-[-0.02em] whitespace-nowrap overflow-hidden text-white',
              isCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-auto opacity-100',
            )}
          >
            Dealz<span style={{ color: GOLD }}>flow</span>
          </span>
        </Link>
      </div>

      {/* Collapse toggle */}
      {!forceVisible && (
        <button
          onClick={toggleCollapse}
          style={{ background: DARK_BG, borderColor: 'hsl(222 20% 22%)' }}
          className={cn(
            'absolute -right-[11px] top-[56px] -translate-y-1/2 w-[22px] h-[22px] rounded-full border flex items-center justify-center transition-colors duration-200 z-10',
            'text-[hsl(220_10%_55%)] hover:text-[hsl(39_67%_55%)] shadow-[0_1px_6px_0_hsl(0_0%_0%/0.4)]',
          )}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed
            ? <ChevronRight className="w-2.5 h-2.5" />
            : <ChevronLeft className="w-2.5 h-2.5" />}
        </button>
      )}

      {/* Navigation */}
      <nav className={cn(
        'flex-1 py-3 overflow-y-auto overflow-x-hidden',
        isCollapsed ? 'px-0 flex flex-col items-center' : 'px-2',
      )}>
        {navSections.map((section, si) => {
          const open = isGroupOpen(section);
          if (isCollapsed) {
            return (
              <div key={section.id} className="w-full flex flex-col items-center">
                {si > 0 && <div className="h-px w-7 my-2" style={{ background: 'hsl(222 20% 16%)' }} />}
                <div className="space-y-1 w-full flex flex-col items-center">
                  {section.items.map(item => <NavLink key={item.path} item={item} />)}
                </div>
              </div>
            );
          }
          return (
            <div key={section.id} className="mb-1.5">
              <SectionHeader section={section} />
              {open && (
                <div className="space-y-0.5 mt-0.5">
                  {section.items.map(item => <NavLink key={item.path} item={item} />)}
                </div>
              )}
            </div>
          );
        })}

        {/* CRM Section */}
        {isCrmMember && (() => {
          const crmSection: NavSection = {
            id: 'crm',
            label: 'CRM',
            items: crmNavItems.filter(i => !ownerAdminOnlyCrmPaths.has(i.path) || isCrmAdmin),
            defaultOpen: true,
          };
          const open = isGroupOpen(crmSection);
          if (isCollapsed) {
            return (
              <div className="w-full flex flex-col items-center">
                <div className="h-px w-7 my-2" style={{ background: 'hsl(222 20% 16%)' }} />
                <div className="space-y-1 w-full flex flex-col items-center">
                  {crmSection.items.map(item => <NavLink key={item.path} item={item} />)}
                </div>
              </div>
            );
          }
          return (
            <div className="mb-1.5 mt-1">
              <button
                onClick={() => persistGroups({ ...groupsOpen, [crmSection.id]: !open })}
                className="w-full group flex items-center gap-1 px-2.5 h-7 text-[10.5px] font-semibold uppercase tracking-[0.08em] transition-colors"
                style={{ color: GOLD }}
              >
                <ChevronDown
                  className={cn('w-3 h-3 transition-transform duration-200 opacity-80', !open && '-rotate-90')}
                  strokeWidth={2}
                />
                <span>CRM</span>
              </button>
              {open && (
                <div className="space-y-0.5 mt-0.5">
                  {crmSection.items.map(item => <NavLink key={item.path} item={item} />)}
                </div>
              )}
            </div>
          );
        })()}

        {/* System group */}
        <div className={cn('mt-2 pt-2', !isCollapsed && 'border-t')}
          style={!isCollapsed ? { borderColor: 'hsl(222 20% 14%)' } : undefined}
        >
          {isCollapsed && <div className="h-px w-7 mx-auto mb-2" style={{ background: 'hsl(222 20% 16%)' }} />}
          <div className={cn('space-y-0.5', isCollapsed && 'w-full flex flex-col items-center')}>
            <NavLink item={{ label: 'Settings', path: '/settings', icon: Settings2 }} />
          </div>

          {isAdmin && (
            <div className={cn('mt-0.5', isCollapsed && 'w-full flex justify-center')}>
              {isCollapsed ? (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link
                      to="/admin"
                      className={cn(
                        'flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-150',
                        location.pathname === '/admin'
                          ? 'text-warning bg-warning/15'
                          : 'text-warning/50 hover:text-warning hover:bg-warning/10',
                      )}
                    >
                      <ShieldAlert className="w-[16px] h-[16px]" strokeWidth={1.7} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium text-xs">Admin</TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  to="/admin"
                  className={cn(
                    'flex items-center gap-3 px-2.5 h-9 rounded-lg text-[13px] font-medium transition-colors duration-150',
                    location.pathname === '/admin'
                      ? 'bg-warning/15 text-warning'
                      : 'text-warning/50 hover:text-warning hover:bg-warning/10',
                  )}
                >
                  <ShieldAlert className="w-[15px] h-[15px] flex-shrink-0" strokeWidth={1.7} />
                  <span>Admin</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Sign out */}
      <div style={{ borderTop: sbBorder }}
        className={cn('px-2 py-3', isCollapsed && 'flex justify-center px-0')}>
        {isCollapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-150 hover:text-destructive hover:bg-destructive/10"
                style={{ color: INACTIVE_TEXT }}
              >
                <LogOut className="w-[14px] h-[14px]" strokeWidth={1.7} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium text-xs">Sign Out</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full px-2.5 h-9 rounded-lg text-[12.5px] font-medium transition-colors duration-150 hover:text-destructive hover:bg-destructive/10"
            style={{ color: INACTIVE_TEXT }}
          >
            <LogOut className="w-[14px] h-[14px] flex-shrink-0" strokeWidth={1.7} />
            <span>Sign out</span>
          </button>
        )}
      </div>
    </aside>
  );
}

export function useSidebarCollapsed() {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  });

  useEffect(() => {
    const handler = (e: Event) => {
      setIsCollapsed((e as CustomEvent<boolean>).detail);
    };
    window.addEventListener('sidebar-collapsed-change', handler);
    return () => window.removeEventListener('sidebar-collapsed-change', handler);
  }, []);

  return isCollapsed;
}
