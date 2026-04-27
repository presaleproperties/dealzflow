import { useLocation, Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import logoMark from '@/assets/logo-mark.png';

/**
 * Mobile-only sticky app header. The desktop TopNav is `hidden lg:block`,
 * which left mobile screens with no header at all — making content collide
 * with the iOS notch / status bar in PWA mode. This thin header restores a
 * native, app-like top bar across both Workspace and CRM on phones/tablets.
 *
 * Heights:
 *   - status-bar safe area (env(safe-area-inset-top))
 *   - 44px content row (Apple HIG nav bar)
 */
const ROUTE_TITLES: { match: string; title: string }[] = [
  { match: '/dashboard', title: 'Home' },
  { match: '/pipeline', title: 'Pipeline' },
  { match: '/deals', title: 'Deals' },
  { match: '/inventory', title: 'Clients' },
  { match: '/payouts', title: 'Payouts' },
  { match: '/network', title: 'Network' },
  { match: '/expenses', title: 'Expenses' },
  { match: '/forecast', title: 'Forecast' },
  { match: '/analytics', title: 'Analytics' },
  { match: '/settings', title: 'Settings' },
  { match: '/admin', title: 'Admin' },
  { match: '/crm/leads', title: 'Leads' },
  { match: '/crm/pipeline', title: 'Pipeline' },
  { match: '/crm/contacts', title: 'Contacts' },
  { match: '/crm/calendar', title: 'Calendar' },
  { match: '/crm/email', title: 'Email' },
  { match: '/crm/templates', title: 'Templates' },
  { match: '/crm/automations', title: 'Automations' },
  { match: '/crm/reports', title: 'Reports' },
  { match: '/crm/integrations', title: 'Integrations' },
  { match: '/crm/settings', title: 'CRM Settings' },
  { match: '/crm/chats', title: 'Chats' },
  { match: '/crm', title: 'CRM' },
];

export function MobileAppHeader() {
  const { pathname } = useLocation();
  // Match the longest prefix so deeper routes resolve before shallow ones
  const title =
    [...ROUTE_TITLES]
      .sort((a, b) => b.match.length - a.match.length)
      .find((r) => pathname.startsWith(r.match))?.title ?? 'Dealzflow';

  const isCrm = pathname.startsWith('/crm');

  return (
    <header
      className="lg:hidden sticky top-0 z-30 shrink-0"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div
        className="absolute inset-0 backdrop-blur-2xl backdrop-saturate-[180%]"
        style={{ background: 'hsl(var(--background) / 0.85)' }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, hsl(var(--border) / 0.7) 10%, hsl(var(--border) / 0.7) 90%, transparent)',
        }}
      />
      <div className="relative flex items-center justify-between h-11 px-4">
        <Link to="/dashboard" className="flex items-center gap-2 min-w-0 active:opacity-70 transition-opacity">
          <img src={logoMark} alt="" className="h-5 w-5 shrink-0" />
          <div className="flex items-baseline gap-1.5 min-w-0">
            {isCrm && (
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.12em] shrink-0"
                style={{ color: 'hsl(var(--primary))' }}
              >
                CRM
              </span>
            )}
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-foreground truncate">
              {title}
            </span>
          </div>
        </Link>
        <button
          aria-label="Notifications"
          className="relative h-9 w-9 -mr-1.5 flex items-center justify-center rounded-full text-muted-foreground active:bg-muted/60 transition-colors"
        >
          <Bell className="h-[17px] w-[17px]" strokeWidth={1.8} />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full ring-1 ring-background" />
        </button>
      </div>
    </header>
  );
}
