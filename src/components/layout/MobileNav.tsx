import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { Command, LayoutDashboard, GitBranch, Handshake, BarChart2, Settings2 } from 'lucide-react';

const navItems = [
  { label: 'HQ',       path: '/command-center', icon: Command },
  { label: 'Home',     path: '/dashboard',      icon: LayoutDashboard },
  { label: 'Pipeline', path: '/pipeline',       icon: GitBranch },
  { label: 'Deals',    path: '/deals',          icon: Handshake },
  { label: 'Settings', path: '/settings',       icon: Settings2 },
];

export function MobileNav() {
  const location = useLocation();

  const NAVY = 'hsl(222 25% 10%)';
  const GOLD = 'hsl(39 67% 55%)';
  const BORDER = 'hsl(222 20% 16% / 0.8)';
  const MUTED_ICON = 'hsl(220 10% 50%)';

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
      <div
        className="absolute inset-0"
        style={{
          background: NAVY,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      />

      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: BORDER }}
      />

      <div className="relative flex justify-around items-center px-1 md:px-6 pt-2.5 pb-2">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => triggerHaptic('light')}
              className="relative flex flex-col items-center gap-1.5 flex-1 py-1 transition-all duration-200 active:scale-[0.88] active:opacity-60 select-none outline-none"
            >
              <span
                className={cn(
                  'absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full transition-all duration-300 ease-out',
                  isActive ? 'w-5 h-[2px] opacity-100' : 'w-0 h-[2px] opacity-0',
                )}
                style={{ background: GOLD }}
              />

              <div
                className={cn(
                  'flex items-center justify-center rounded-[14px] transition-all duration-250',
                  'w-11 h-8 md:w-12 md:h-8',
                  isActive ? 'scale-105' : 'scale-100',
                )}
                style={isActive ? {
                  background: 'hsl(39 67% 55% / 0.15)',
                  boxShadow: '0 0 0 1px hsl(39 67% 55% / 0.2), 0 2px 8px hsl(39 67% 55% / 0.15)',
                } : undefined}
              >
                <Icon
                  strokeWidth={isActive ? 2.3 : 1.8}
                  className="transition-all duration-200 w-[19px] h-[19px] md:w-5 md:h-5"
                  style={{ color: isActive ? GOLD : MUTED_ICON }}
                />
              </div>

              <span
                className={cn(
                  'text-[10.5px] md:text-[11px] tracking-tight leading-none transition-all duration-200',
                  isActive ? 'font-bold' : 'font-semibold',
                )}
                style={{ color: isActive ? GOLD : MUTED_ICON }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
    </nav>
  );
}
