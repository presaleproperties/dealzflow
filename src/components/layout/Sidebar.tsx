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

// Context so AppLayout can subscribe without polling
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
          'relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-150',
          isCollapsed && 'justify-center px-0',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/50 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent/60',
        )}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full bg-sidebar-primary" />
        )}
        <item.icon
          className={cn(
            'flex-shrink-0 transition-all duration-150',
            isCollapsed ? 'w-[18px] h-[18px]' : 'w-[16px] h-[16px]',
            isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/40',
          )}
          strokeWidth={1.75}
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
          <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
        </Tooltip>
      );
    }
    return linkEl;
  };

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col h-screen fixed left-0 top-0 transition-all duration-300 ease-in-out z-40',
        isCollapsed ? 'w-[56px]' : 'w-56',
      )}
    >
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'hsl(var(--sidebar-background))',
          boxShadow: '1px 0 0 0 hsl(var(--sidebar-border))',
        }}
      />

      {/* Logo */}
      <div className="relative px-3.5 pt-5 pb-4 flex items-center gap-2.5 min-h-[60px]">
        <Link to="/dashboard" className="flex items-center gap-2.5 group">
          <img
            src={logoMark}
            alt="Dealzflow"
            className="w-7 h-7 rounded-lg flex-shrink-0 transition-opacity duration-200 group-hover:opacity-80"
          />
          <span
            className={cn(
              'transition-all duration-300 font-semibold text-[14px] tracking-[-0.02em] whitespace-nowrap overflow-hidden',
              'text-sidebar-foreground/90',
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
        className="absolute -right-3 top-[52px] w-5 h-5 rounded-full flex items-center justify-center bg-background border border-border text-foreground/70 hover:text-foreground hover:border-primary/60 shadow-sm transition-all duration-200 z-10"
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed
          ? <ChevronRight className="w-2.5 h-2.5" />
          : <ChevronLeft className="w-2.5 h-2.5" />
        }
      </button>

      {/* Navigation */}
      <nav className="relative flex-1 px-2 py-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {navSections.map((section) => (
          <div key={section.label} className="mb-3">
            {!isCollapsed ? (
              <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/30">
                {section.label}
              </div>
            ) : (
              <div className="border-t border-sidebar-border/40 mx-2 my-2" />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.path} item={item} />
              ))}
            </div>
          </div>
        ))}

        <div className="border-t border-sidebar-border/30 mx-1 my-1" />

        {standaloneItems.map((item) => (
          <NavLink key={item.path} item={item} />
        ))}

        {isAdmin && (
          <>
            <div className="border-t border-sidebar-border/30 mx-1 my-1" />
            {isCollapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    to="/admin"
                    className={cn(
                      'flex items-center justify-center py-2 rounded-lg transition-all duration-150',
                      location.pathname === '/admin'
                        ? 'text-warning bg-warning/10'
                        : 'text-warning/40 hover:text-warning hover:bg-warning/8',
                    )}
                  >
                    <ShieldAlert className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">Admin</TooltipContent>
              </Tooltip>
            ) : (
              <Link
                to="/admin"
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-150',
                  location.pathname === '/admin'
                    ? 'bg-warning/10 text-warning'
                    : 'text-warning/40 hover:text-warning hover:bg-warning/8',
                )}
              >
                <ShieldAlert className="w-[16px] h-[16px] flex-shrink-0" strokeWidth={1.75} />
                <span>Admin</span>
              </Link>
            )}
          </>
        )}
      </nav>

      {/* Sign out */}
      <div className="relative px-2 py-3 border-t border-sidebar-border/40">
        {isCollapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className="flex items-center justify-center w-full py-1.5 rounded-lg text-sidebar-foreground/25 hover:text-destructive/70 hover:bg-destructive/8 transition-all duration-150"
              >
                <span className="text-base leading-none">↑</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">Sign Out</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={signOut}
            className="flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-lg text-[13px] font-medium text-sidebar-foreground/30 hover:text-destructive/80 hover:bg-destructive/8 transition-all duration-150"
          >
            Sign out
          </button>
        )}
      </div>
    </aside>
  );
}

// Lightweight hook — listens to custom event instead of polling
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
