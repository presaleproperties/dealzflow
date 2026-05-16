/**
 * Tier 7 — Top sub-nav (CRM).
 *
 * Reduced to the 6 daily-loop primary tabs. No more "More" dropdown.
 * Secondary surfaces (Templates / Automations / Integrations / Team /
 * Settings / SMS Queue) live in the left collapsible <CrmSideRail />.
 * Behavior pages are demoted into a section inside /crm/leads/:id.
 */
import { Link, useLocation } from 'react-router-dom';
import { useCrmAccess } from '@/contexts/CrmAccessContext';

interface Tab {
  label: string;
  path: string;
  matchPrefix?: string;
  ownerAdminOnly?: boolean;
  ownerOnly?: boolean;
}

const PRIMARY: Tab[] = [
  { label: 'Inbox',     path: '/crm/inbox' },
  { label: 'Leads',     path: '/crm/leads' },
  { label: 'Pipeline',  path: '/crm/pipeline' },
  { label: 'Campaigns', path: '/crm/campaigns' },
  { label: 'Calendar',  path: '/crm/calendar' },
  { label: 'Reports',   path: '/crm/reports', ownerOnly: true },
];

const GOLD = 'hsl(var(--primary))';
const INACTIVE = 'hsl(var(--muted-foreground))';

function isActive(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(path + '/');
}

export function CrmSubNav() {
  const location = useLocation();
  const { isOwnerOrAdmin, role } = useCrmAccess();

  const filterTab = (t: Tab) => {
    if (t.ownerAdminOnly && !isOwnerOrAdmin) return false;
    if (t.ownerOnly && role !== 'owner') return false;
    return true;
  };

  const visible = PRIMARY.filter(filterTab);

  return (
    <div
      className="hidden lg:block sticky top-[54px] z-30 backdrop-blur-xl bg-background/85"
      style={{ borderBottom: '1px solid hsl(var(--border) / 0.6)' }}
    >
      <div className="flex items-center gap-7 px-3 sm:px-4 lg:px-6 h-[46px]">
        {visible.map(tab => {
          const active = isActive(location.pathname, tab.path);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className="relative flex items-center h-full text-[14px] tracking-tight transition-colors shrink-0 hover:text-foreground"
              style={{
                color: active ? 'hsl(var(--foreground))' : INACTIVE,
                fontWeight: active ? 600 : 500,
              }}
            >
              {tab.label}
              {active && (
                <span
                  className="absolute left-0 right-0 -bottom-px h-[2px] rounded-t-sm"
                  style={{ background: GOLD }}
                  aria-hidden
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
