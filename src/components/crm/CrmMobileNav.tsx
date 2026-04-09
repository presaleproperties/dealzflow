import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import {
  LayoutDashboard, Users, Kanban, MoreHorizontal,
  Mail, LayoutTemplate, BookUser, Zap, CalendarDays, BarChart3, Settings, X,
} from 'lucide-react';
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface NavItem { label: string; path: string; icon: LucideIcon; }

const primaryItems: NavItem[] = [
  { label: 'Dashboard', path: '/crm/dashboard',  icon: LayoutDashboard },
  { label: 'Leads',     path: '/crm/leads',      icon: Users },
  { label: 'Pipeline',  path: '/crm/pipeline',   icon: Kanban },
  { label: 'Email',     path: '/crm/email',       icon: Mail },
];

const moreItems: NavItem[] = [
  { label: 'Email Center',      path: '/crm/email',       icon: Mail },
  { label: 'Templates',         path: '/crm/templates',   icon: LayoutTemplate },
  { label: 'Contacts',          path: '/crm/contacts',    icon: BookUser },
  { label: 'Automations',       path: '/crm/automations', icon: Zap },
  { label: 'Showings Calendar', path: '/crm/calendar',    icon: CalendarDays },
  { label: 'Reports',           path: '/crm/reports',     icon: BarChart3 },
  { label: 'CRM Settings',     path: '/crm/settings',    icon: Settings },
];

const ownerAdminOnlyPaths = new Set(['/crm/automations', '/crm/settings']);

const GOLD = 'hsl(39 67% 55%)';
const MUTED_ICON = 'hsl(220 10% 50%)';
const DARK_BG = 'hsl(222 25% 10%)';

export function CrmMobileNav() {
  const location = useLocation();
  const { isOwnerOrAdmin } = useCrmAccess();
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleMoreItems = moreItems.filter(item =>
    !ownerAdminOnlyPaths.has(item.path) || isOwnerOrAdmin
  );

  const isMoreActive = visibleMoreItems.some(
    item => location.pathname === item.path || location.pathname.startsWith(item.path)
  );

  return (
    <>
      {/* Bottom sheet overlay */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/50"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute bottom-0 inset-x-0 rounded-t-2xl animate-in slide-in-from-bottom duration-200"
            style={{ background: DARK_BG }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-4 pb-2">
              <span className="text-sm font-bold text-white/90">More</span>
              <button onClick={() => setMoreOpen(false)} className="p-1">
                <X className="w-4 h-4" style={{ color: MUTED_ICON }} />
              </button>
            </div>
            <nav className="px-3 pb-4 space-y-0.5 max-h-[50vh] overflow-y-auto">
              {visibleMoreItems.map(item => {
                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => { setMoreOpen(false); triggerHaptic('light'); }}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors"
                    style={{
                      color: isActive ? GOLD : 'hsl(220 10% 70%)',
                      background: isActive ? 'hsl(39 67% 55% / 0.12)' : undefined,
                    }}
                  >
                    <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
                    <span className={cn('text-sm', isActive ? 'font-semibold' : 'font-medium')}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
            <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
          </div>
        </div>
      )}

      {/* Bottom nav bar — only visible on mobile < 640px, hidden on tablet+ */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50">
        <div className="absolute inset-0" style={{ background: DARK_BG }} />
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'rgba(255,255,255,0.1)' }}
        />

        <div className="relative flex items-center justify-around h-14 px-1">
          {primaryItems.map(item => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/crm/dashboard' && location.pathname.startsWith(item.path));
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => triggerHaptic('light')}
                className="flex flex-col items-center gap-1 flex-1 py-1 select-none active:scale-90 active:opacity-60 transition-all duration-150"
              >
                <Icon
                  className="w-5 h-5"
                  strokeWidth={isActive ? 2.3 : 1.8}
                  style={{ color: isActive ? GOLD : MUTED_ICON }}
                />
                <span
                  className={cn('text-[10px] leading-none', isActive ? 'font-bold' : 'font-medium')}
                  style={{ color: isActive ? GOLD : MUTED_ICON }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => { setMoreOpen(true); triggerHaptic('light'); }}
            className="flex flex-col items-center gap-1 flex-1 py-1 select-none active:scale-90 active:opacity-60 transition-all duration-150"
          >
            <MoreHorizontal
              className="w-5 h-5"
              strokeWidth={isMoreActive ? 2.3 : 1.8}
              style={{ color: isMoreActive ? GOLD : MUTED_ICON }}
            />
            <span
              className={cn('text-[10px] leading-none', isMoreActive ? 'font-bold' : 'font-medium')}
              style={{ color: isMoreActive ? GOLD : MUTED_ICON }}
            >
              More
            </span>
          </button>
        </div>

        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </nav>
    </>
  );
}
