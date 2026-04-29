import { Link, useLocation } from 'react-router-dom';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { useCrmNavMode } from '@/hooks/useCrmNavMode';

interface Tab {
  label: string;
  path: string;
  ownerAdminOnly?: boolean;
  ownerOnly?: boolean;
  /** When true, this tab is hidden in Simple mode (visible in Pro). */
  pro?: boolean;
}

const TABS: Tab[] = [
  // Simple-mode core (every agent's daily loop)
  { label: 'Leads',        path: '/crm/leads' },
  { label: 'Pipeline',     path: '/crm/pipeline' },
  { label: 'Email',        path: '/crm/email' },
  { label: 'SMS',          path: '/crm/sms', ownerAdminOnly: true },
  { label: 'Calendar',     path: '/crm/calendar' },

  // Pro-mode extras
  { label: 'Templates',    path: '/crm/templates',    pro: true },
  { label: 'Scheduler',    path: '/crm/scheduler',    pro: true },
  { label: 'Behavior',     path: '/crm/behavior',     pro: true, ownerOnly: true },
  { label: 'Reports',      path: '/crm/reports',      pro: true, ownerOnly: true },
  { label: 'Automations',  path: '/crm/automations',  pro: true, ownerAdminOnly: true },
  { label: 'Integrations', path: '/crm/integrations', pro: true, ownerAdminOnly: true },

  // Settings always last, quiet
  { label: 'Settings',     path: '/crm/settings',     ownerAdminOnly: true },
];

const GOLD = 'hsl(var(--primary))';
const INACTIVE = 'hsl(var(--muted-foreground))';

function isActive(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(path + '/');
}

export function CrmSubNav() {
  const location = useLocation();
  const { isOwnerOrAdmin, role } = useCrmAccess();
  const [navMode, setNavMode] = useCrmNavMode();

  const visible = TABS.filter(t => {
    if (t.ownerAdminOnly && !isOwnerOrAdmin) return false;
    if (t.ownerOnly && role !== 'owner') return false;
    if (t.pro && navMode !== 'pro') return false;
    return true;
  });

  return (
    <div
      className="hidden lg:block sticky top-[54px] z-30 backdrop-blur-xl bg-background/85"
      style={{ borderBottom: '1px solid hsl(var(--border) / 0.6)' }}
    >
      <div className="flex items-center gap-5 px-3 sm:px-4 lg:px-6 h-[38px] overflow-x-auto">
        {visible.map(tab => {
          const active = isActive(location.pathname, tab.path);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className="relative flex items-center h-full text-[12.5px] tracking-tight transition-colors shrink-0 hover:text-foreground"
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

        {/* Quiet Simple ↔ Pro toggle */}
        <button
          type="button"
          onClick={() => setNavMode(navMode === 'simple' ? 'pro' : 'simple')}
          className="ml-auto shrink-0 text-[10.5px] uppercase tracking-[0.14em] font-medium text-muted-foreground/80 hover:text-foreground transition-colors"
          title={navMode === 'simple'
            ? 'Switch to Pro view (Templates, Scheduler, Behavior, Reports, Automations, Integrations)'
            : 'Switch to Simple view'}
        >
          <span className="opacity-60">View · </span>
          <span style={{ color: GOLD }}>{navMode === 'simple' ? 'Simple' : 'Pro'}</span>
        </button>
      </div>
    </div>
  );
}
