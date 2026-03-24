import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { LayoutDashboard, GitBranch, Handshake, BarChart2, Settings2 } from 'lucide-react';

const navItems = [
  { label: 'Home',      path: '/dashboard', icon: LayoutDashboard },
  { label: 'Pipeline',  path: '/pipeline',  icon: GitBranch },
  { label: 'Deals',     path: '/deals',     icon: Handshake },
  { label: 'Analytics', path: '/analytics', icon: BarChart2 },
  { label: 'Settings',  path: '/settings',  icon: Settings2 },
];

export function MobileNav() {
  const location = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
      {/* Deep frosted glass */}
      <div
        className="absolute inset-0"
        style={{
          background: 'hsl(var(--background) / 0.9)',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        }}
      />

      {/* Top hairline */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, hsl(var(--border) / 0.8) 15%, hsl(var(--border) / 0.8) 85%, transparent)',
        }}
      />

      {/* Items row */}
      <div className="relative flex justify-around items-center px-1 md:px-6 pt-2 pb-1.5">
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
              className="relative flex flex-col items-center gap-1 flex-1 py-1 transition-all duration-200 active:scale-[0.88] active:opacity-60 select-none outline-none"
            >
              {/* Active indicator dot */}
              <span
                className={cn(
                  'absolute -top-2 left-1/2 -translate-x-1/2 rounded-full transition-all duration-300 ease-out',
                  isActive ? 'w-1 h-1 opacity-100' : 'w-0 h-0 opacity-0',
                )}
                style={{ background: 'hsl(var(--primary))' }}
              />

              {/* Icon container */}
              <div
                className={cn(
                  'flex items-center justify-center rounded-[12px] transition-all duration-250',
                  'w-10 h-7 md:w-12 md:h-8',
                  isActive ? 'scale-105' : 'scale-100',
                )}
                style={isActive ? {
                  background: 'hsl(var(--primary) / 0.1)',
                  boxShadow: '0 1px 4px hsl(var(--primary) / 0.12)',
                } : undefined}
              >
                <Icon
                  strokeWidth={isActive ? 2.2 : 1.7}
                  className={cn(
                    'transition-all duration-200',
                    'w-[18px] h-[18px] md:w-5 md:h-5',
                  )}
                  style={{
                    color: isActive
                      ? 'hsl(var(--primary))'
                      : 'hsl(var(--muted-foreground) / 0.45)',
                  }}
                />
              </div>

              {/* Label */}
              <span
                className={cn(
                  'text-[9.5px] md:text-[10.5px] tracking-tight leading-none transition-all duration-200',
                  isActive ? 'font-bold' : 'font-medium',
                )}
                style={{
                  color: isActive
                    ? 'hsl(var(--primary))'
                    : 'hsl(var(--muted-foreground) / 0.45)',
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* iOS safe area spacer */}
      <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
    </nav>
  );
}
