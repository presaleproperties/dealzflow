import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import logoMark from '@/assets/logo-mark.png';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useAdmin';
import { useState, useEffect, createContext, useContext } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChevronLeft, ChevronRight,
  LayoutDashboard, GitBranch, Handshake, DollarSign,
  Receipt, TrendingUp, BarChart2, Building2, Network, Settings2, ShieldAlert,
  LogOut, Command, Users,
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
      { label: 'Leads',            path: '/leads',     icon: Users },
    ],
  },
  {
    label: 'Network',
    items: [
      { label: 'Network', path: '/network', icon: Network },
    ],
  },
];

const standaloneItems: NavItem[] = [
  { label: 'Settings', path: '/settings', icon: Settings2 },
];

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

export const SidebarCollapsedContext = createContext<boolean>(false);

export function Sidebar() {
  const location = useLocation();
  const { signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
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

  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = location.pathname === item.path ||
      (item.path !== '/dashboard' && location.pathname.startsWith(item.path));

    const linkEl = (
      <Link
        to={item.path}
        className={cn(
          'relative flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 group select-none',
          isCollapsed ? 'justify-center px-0 py-2 mx-1.5' : 'px-2.5 py-[6px]',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-foreground/50 hover:text-foreground/80 hover:bg-muted/60',
        )}
      >
        <item.icon
          className={cn(
            'flex-shrink-0 transition-all duration-150',
            isCollapsed ? 'w-[16px] h-[16px]' : 'w-[15px] h-[15px]',
            isActive ? 'text-primary opacity-100' : 'opacity-60 group-hover:opacity-80',
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
      className={cn(
        'hidden md:flex flex-col h-screen fixed left-0 top-0 transition-all duration-300 ease-in-out z-40',
        'bg-card border-r border-border/60',
        isCollapsed ? 'w-[54px]' : 'w-[218px]',
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-2.5 h-[56px] border-b border-border/50',
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
              'transition-all duration-300 font-semibold text-[13.5px] tracking-[-0.02em] whitespace-nowrap overflow-hidden text-foreground',
              isCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-auto opacity-100',
            )}
          >
            Dealz<span className="text-primary">flow</span>
          </span>
        </Link>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapse}
        className={cn(
          'absolute -right-[11px] top-[56px] -translate-y-1/2 w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all duration-200 z-10',
          'bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/40',
          'shadow-[0_1px_4px_0_hsl(0_0%_0%/0.1)]',
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
        isCollapsed ? 'px-0' : 'px-2.5',
      )}>
        {navSections.map((section) => (
          <div key={section.label} className="mb-4">
            {!isCollapsed ? (
              <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/50">
                {section.label}
              </div>
            ) : (
              <div className="h-px mx-2 my-2 bg-border/50" />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.path} item={item} />
              ))}
            </div>
          </div>
        ))}

        <div className="h-px mx-2 my-1 bg-border/40" />

        {standaloneItems.map((item) => (
          <NavLink key={item.path} item={item} />
        ))}

        {isAdmin && (
          <>
            <div className="h-px mx-2 my-1 bg-border/40" />
            {isCollapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    to="/admin"
                    className={cn(
                      'flex items-center justify-center py-2 mx-1.5 rounded-lg transition-all duration-150',
                      location.pathname === '/admin'
                        ? 'text-warning bg-warning/10'
                        : 'text-warning/40 hover:text-warning hover:bg-warning/10',
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
                  'flex items-center gap-2.5 px-2.5 py-[6px] rounded-lg text-[13px] font-medium transition-all duration-150',
                  location.pathname === '/admin'
                    ? 'bg-warning/10 text-warning'
                    : 'text-warning/40 hover:text-warning hover:bg-warning/10',
                )}
              >
                <ShieldAlert className="w-[15px] h-[15px] flex-shrink-0" strokeWidth={1.8} />
                <span>Admin</span>
              </Link>
            )}
          </>
        )}
      </nav>

      {/* Sign out */}
      <div className="px-2.5 py-3 border-t border-border/50">
        {isCollapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className="flex items-center justify-center w-full py-2 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/8 transition-all duration-150"
              >
                <LogOut className="w-[14px] h-[14px]" strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium text-xs">Sign Out</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={signOut}
            className="flex items-center gap-2.5 w-full px-2.5 py-[6px] rounded-lg text-[12.5px] font-medium text-muted-foreground/50 hover:text-destructive hover:bg-destructive/8 transition-all duration-150"
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
