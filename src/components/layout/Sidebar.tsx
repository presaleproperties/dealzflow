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
  LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem { label: string; path: string; icon: LucideIcon; }
interface NavSection { label: string; items: NavItem[]; }

const navSections: NavSection[] = [
  {
    label: 'Production',
    items: [
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
        'relative flex items-center gap-2.5 rounded-[10px] text-[13px] font-medium transition-all duration-200 group',
          isCollapsed ? 'justify-center px-0 py-2.5 mx-1' : 'px-2.5 py-[7px]',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
        )}
      >
        {/* Active indicator */}
        {isActive && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
            style={{ background: 'hsl(var(--sidebar-primary))' }}
          />
        )}
        <item.icon
          className={cn(
            'flex-shrink-0 transition-all duration-200',
            isCollapsed ? 'w-[17px] h-[17px]' : 'w-[15px] h-[15px]',
            isActive
              ? 'opacity-100'
              : 'opacity-50 group-hover:opacity-75',
          )}
          style={isActive ? { color: 'hsl(var(--sidebar-primary))' } : undefined}
          strokeWidth={isActive ? 2.1 : 1.75}
        />
        {!isCollapsed && (
          <span className="truncate">{item.label}</span>
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
        isCollapsed ? 'w-[54px]' : 'w-[218px]',
      )}
    >
      {/* Background — very deep with subtle noise feel */}
      <div
        className="absolute inset-0"
        style={{
          background: 'hsl(var(--sidebar-background))',
          boxShadow: '1px 0 0 0 hsl(var(--sidebar-border) / 0.8)',
        }}
      />

      {/* Logo */}
      <div className={cn(
        'relative flex items-center gap-2.5 min-h-[58px]',
        isCollapsed ? 'justify-center px-0 pt-4 pb-3' : 'px-3.5 pt-4 pb-3',
      )}>
        <Link to="/dashboard" className="flex items-center gap-2.5 group">
          <img
            src={logoMark}
            alt="Dealzflow"
            className={cn(
              'rounded-[9px] flex-shrink-0 transition-all duration-200 group-hover:opacity-80',
              isCollapsed ? 'w-6 h-6' : 'w-[26px] h-[26px]',
            )}
          />
          <span
            className={cn(
              'transition-all duration-300 font-bold text-[14px] tracking-[-0.03em] whitespace-nowrap overflow-hidden',
              'text-sidebar-foreground/92',
              isCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-auto opacity-100',
            )}
          >
            Dealz<span style={{ color: 'hsl(var(--sidebar-primary))' }}>flow</span>
          </span>
        </Link>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapse}
        className="absolute -right-[13px] top-[50px] w-[26px] h-[26px] rounded-full flex items-center justify-center transition-all duration-200 z-10"
        style={{
          background: 'hsl(var(--sidebar-background))',
          border: '1.5px solid hsl(var(--sidebar-border))',
          color: 'hsl(var(--sidebar-foreground) / 0.7)',
          boxShadow: '0 2px 8px -2px hsl(0 0% 0% / 0.18), 0 0 0 0.5px hsl(var(--sidebar-border))',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--sidebar-primary))')}
        onMouseLeave={e => (e.currentTarget.style.color = 'hsl(var(--sidebar-foreground) / 0.7)')}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed
          ? <ChevronRight className="w-3 h-3" />
          : <ChevronLeft className="w-3 h-3" />
        }
      </button>

      {/* Sep */}
      <div className="relative mx-3 h-px" style={{ background: 'hsl(var(--sidebar-border) / 0.5)' }} />

      {/* Navigation */}
      <nav className={cn(
        'relative flex-1 py-2 space-y-0.5 overflow-y-auto overflow-x-hidden',
        isCollapsed ? 'px-0' : 'px-2',
      )}>
        {navSections.map((section) => (
          <div key={section.label} className="mb-3">
            {!isCollapsed ? (
              <div className="px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-sidebar-foreground/22">
                {section.label}
              </div>
            ) : (
              <div className="h-px mx-2 my-2" style={{ background: 'hsl(var(--sidebar-border) / 0.4)' }} />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.path} item={item} />
              ))}
            </div>
          </div>
        ))}

        <div className="h-px mx-2 my-1" style={{ background: 'hsl(var(--sidebar-border) / 0.35)' }} />

        {standaloneItems.map((item) => (
          <NavLink key={item.path} item={item} />
        ))}

        {isAdmin && (
          <>
            <div className="h-px mx-2 my-1" style={{ background: 'hsl(var(--sidebar-border) / 0.35)' }} />
            {isCollapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    to="/admin"
                    className={cn(
                      'flex items-center justify-center py-2.5 mx-1 rounded-[10px] transition-all duration-200',
                      location.pathname === '/admin'
                        ? 'text-warning bg-warning/12'
                        : 'text-warning/35 hover:text-warning hover:bg-warning/10',
                    )}
                  >
                    <ShieldAlert className="w-[17px] h-[17px]" strokeWidth={1.75} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium text-xs">Admin</TooltipContent>
              </Tooltip>
            ) : (
              <Link
                to="/admin"
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-[7px] rounded-[10px] text-[13px] font-medium transition-all duration-200',
                  location.pathname === '/admin'
                    ? 'bg-warning/12 text-warning'
                    : 'text-warning/35 hover:text-warning hover:bg-warning/10',
                )}
              >
                <ShieldAlert className="w-[15px] h-[15px] flex-shrink-0" strokeWidth={1.75} />
                <span>Admin</span>
              </Link>
            )}
          </>
        )}
      </nav>

      {/* Sign out */}
      <div
        className="relative px-2 py-3"
        style={{ borderTop: '1px solid hsl(var(--sidebar-border) / 0.45)' }}
      >
        {isCollapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className="flex items-center justify-center w-full py-2 rounded-[10px] text-sidebar-foreground/22 hover:text-destructive/70 hover:bg-destructive/8 transition-all duration-200"
              >
                <LogOut className="w-[14px] h-[14px]" strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium text-xs">Sign Out</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={signOut}
            className="flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-[10px] text-[12.5px] font-medium text-sidebar-foreground/28 hover:text-destructive/75 hover:bg-destructive/8 transition-all duration-200"
          >
            <LogOut className="w-[14px] h-[14px] flex-shrink-0" strokeWidth={1.75} />
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
