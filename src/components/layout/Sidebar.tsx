import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import logoMark from '@/assets/logo-mark.png';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useAdmin';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { useState, useEffect, createContext, useContext } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChevronLeft, ChevronRight,
  LayoutDashboard, GitBranch, Handshake, DollarSign,
  Receipt, TrendingUp, BarChart2, Building2, Network, Settings2, ShieldAlert,
  LogOut, Command, Users, Kanban, Mail, MessageCircle, LayoutTemplate,
  BookUser, Zap, CalendarDays, BarChart3, Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem { label: string; path: string; icon: LucideIcon; }
interface NavSection { label: string; items: NavItem[]; }

const navSections: NavSection[] = [
  {
    label: 'Production',
    items: [
      { label: 'Command Center',   path: '/command-center', icon: Command },
      { label: 'Dashboard',        path: '/dashboard', icon: LayoutDashboard },
      { label: 'Pipeline',         path: '/pipeline',  icon: GitBranch },
      { label: 'Deals',            path: '/deals',     icon: Handshake },
      { label: 'Payouts',          path: '/payouts',   icon: DollarSign },
      { label: 'Expenses',         path: '/expenses',  icon: Receipt },
      { label: 'Forecast',         path: '/forecast',  icon: TrendingUp },
      { label: 'Analytics',        path: '/analytics', icon: BarChart2 },
      { label: 'Client Inventory', path: '/inventory', icon: Building2 },
      
    ],
  },
  {
    label: 'Network',
    items: [
      { label: 'Network', path: '/network', icon: Network },
    ],
  },
];

const crmNavItems: NavItem[] = [
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

const ownerAdminOnlyCrmPaths = new Set(['/crm/automations', '/crm/settings']);

const standaloneItems: NavItem[] = [
  { label: 'Settings', path: '/settings', icon: Settings2 },
];

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

// Gold accent palette
const GOLD = 'hsl(39 67% 55%)';
const GOLD_BG = 'hsl(39 67% 55% / 0.12)';
const DARK_BG = 'hsl(222 25% 10%)';
const DARK_BORDER = 'hsl(222 20% 16% / 0.6)';
const INACTIVE_TEXT = 'hsl(220 10% 64%)';
const SECTION_LABEL = 'hsl(224 8% 46%)';

export const SidebarCollapsedContext = createContext<boolean>(false);

export function Sidebar({ forceVisible = false }: { forceVisible?: boolean }) {
  const location = useLocation();
  const { signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { isMember: isCrmMember, isOwnerOrAdmin: isCrmAdmin } = useCrmAccess();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === 'true';
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      window.dispatchEvent(new CustomEvent('sidebar-collapsed-change', { detail: next }));
      return next;
    });
  };

  const sbBg = { background: DARK_BG };
  const sbBorder = `1px solid ${DARK_BORDER}`;

  const navItemStyle = (isActive: boolean) => ({
    background: isActive ? GOLD_BG : undefined,
    color: isActive ? GOLD : INACTIVE_TEXT,
  });

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = location.pathname === item.path ||
      (item.path !== '/dashboard' && location.pathname.startsWith(item.path));

    const linkEl = (
      <Link
        to={item.path}
        style={navItemStyle(isActive)}
        className={cn(
          'relative flex items-center gap-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 group select-none',
          'hover:bg-[hsl(39_67%_55%_/_0.08)] hover:text-white',
          isCollapsed ? 'justify-center w-10 h-10 mx-auto' : 'px-2.5 py-[6px]',
        )}
      >
        <item.icon
          className={cn(
            'flex-shrink-0 transition-all duration-150',
            isCollapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]',
          )}
          strokeWidth={isActive ? 2.2 : 1.8}
        />
        {!isCollapsed && (
          <span className="truncate leading-none">{item.label}</span>
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

  return (
    <aside
      style={{ ...sbBg, borderRight: sbBorder }}
      className={cn(
        'flex-col h-screen transition-all duration-300 ease-in-out z-40',
        forceVisible ? 'flex relative w-full' : 'hidden md:flex fixed left-0 top-0',
        !forceVisible && (isCollapsed ? 'w-[60px]' : 'w-[218px]'),
      )}
    >
      {/* Logo */}
      <div
        style={{ borderBottom: sbBorder }}
        className={cn(
          'flex items-center gap-2.5 h-[56px]',
          isCollapsed ? 'justify-center px-0' : 'px-4',
        )}>
        <Link to="/dashboard" className="flex items-center gap-2.5 group">
          <img
            src={logoMark}
            alt="Dealzflow"
            className={cn(
              'rounded-[8px] flex-shrink-0 transition-all duration-200 group-hover:opacity-80',
              isCollapsed ? 'w-6 h-6' : 'w-[25px] h-[25px]',
            )}
          />
          <span
            className={cn(
              'transition-all duration-300 font-semibold text-[13.5px] tracking-[-0.02em] whitespace-nowrap overflow-hidden text-white',
              isCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-auto opacity-100',
            )}
          >
            Dealz<span style={{ color: GOLD }}>flow</span>
          </span>
        </Link>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapse}
        style={{ background: DARK_BG, borderColor: 'hsl(222 20% 22%)' }}
        className={cn(
          'absolute -right-[11px] top-[56px] -translate-y-1/2 w-[22px] h-[22px] rounded-full border flex items-center justify-center transition-all duration-200 z-10',
          'text-[hsl(220_10%_55%)] hover:text-[hsl(39_67%_55%)]',
          'shadow-[0_1px_6px_0_hsl(0_0%_0%/0.4)]',
        )}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed
          ? <ChevronRight className="w-2.5 h-2.5" />
          : <ChevronLeft className="w-2.5 h-2.5" />
        }
      </button>

      {/* Navigation */}
      <nav className={cn(
        'flex-1 py-3 overflow-y-auto overflow-x-hidden',
        isCollapsed ? 'px-0 flex flex-col items-center' : 'px-2.5',
      )}>
        {navSections.map((section, si) => (
          <div key={section.label} className={cn('mb-3', isCollapsed && 'w-full flex flex-col items-center')}>
            {!isCollapsed ? (
              <div className="px-2.5 pb-1 pt-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em]"
                style={{ color: SECTION_LABEL }}>
                {section.label}
              </div>
            ) : si > 0 ? (
              <div className="h-px w-8 my-2" style={{ background: 'hsl(222 20% 18%)' }} />
            ) : null}
            <div className={cn('space-y-0.5', isCollapsed && 'w-full flex flex-col items-center')}>
              {section.items.map((item) => (
                <NavLink key={item.path} item={item} />
              ))}
            </div>
          </div>
        ))}

        <div className="h-px w-full my-1" style={{ background: 'hsl(222 20% 16%)' }} />

        <div className={cn('space-y-0.5', isCollapsed && 'w-full flex flex-col items-center')}>
          {standaloneItems.map((item) => (
            <NavLink key={item.path} item={item} />
          ))}
        </div>

        {isAdmin && (
          <>
            <div className="h-px w-full my-1" style={{ background: 'hsl(222 20% 16%)' }} />
            <div className={cn(isCollapsed && 'w-full flex justify-center')}>
              {isCollapsed ? (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link
                      to="/admin"
                      className={cn(
                        'flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150',
                        location.pathname === '/admin'
                          ? 'text-warning bg-warning/20'
                          : 'text-warning/40 hover:text-warning hover:bg-warning/15',
                      )}
                    >
                      <ShieldAlert className="w-[16px] h-[16px]" strokeWidth={1.8} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium text-xs">Admin</TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  to="/admin"
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-[6px] rounded-xl text-[13px] font-medium transition-all duration-150',
                    location.pathname === '/admin'
                      ? 'bg-warning/20 text-warning'
                      : 'text-warning/40 hover:text-warning hover:bg-warning/15',
                  )}
                >
                  <ShieldAlert className="w-[15px] h-[15px] flex-shrink-0" strokeWidth={1.8} />
                  <span>Admin</span>
                </Link>
              )}
            </div>
          </>
        )}
      </nav>

      {/* Sign out */}
      <div style={{ borderTop: sbBorder }}
        className={cn('px-2.5 py-3', isCollapsed && 'flex justify-center px-0')}>
        {isCollapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150 hover:text-destructive hover:bg-destructive/15"
                style={{ color: INACTIVE_TEXT }}
              >
                <LogOut className="w-[14px] h-[14px]" strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium text-xs">Sign Out</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={signOut}
            className="flex items-center gap-2.5 w-full px-2.5 py-[6px] rounded-xl text-[12.5px] font-medium transition-all duration-150 hover:text-destructive hover:bg-destructive/15"
            style={{ color: INACTIVE_TEXT }}
          >
            <LogOut className="w-[14px] h-[14px] flex-shrink-0" strokeWidth={1.8} />
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
