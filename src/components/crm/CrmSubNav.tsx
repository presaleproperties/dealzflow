import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { ChevronDown } from 'lucide-react';

interface Tab {
  label: string;
  path: string;
  ownerAdminOnly?: boolean;
  ownerOnly?: boolean;
}

// Primary tabs — always visible (role-gated). Daily-loop only.
const PRIMARY: Tab[] = [
  { label: 'Leads',    path: '/crm/leads' },
  { label: 'Pipeline', path: '/crm/pipeline' },
  { label: 'Email',    path: '/crm/email' },
  { label: 'SMS',      path: '/crm/sms', ownerAdminOnly: true },
  { label: 'Calendar', path: '/crm/calendar' },
];

// Overflow — everything else lives behind a single "More" menu.
const OVERFLOW: Tab[] = [
  { label: 'Templates',    path: '/crm/templates' },
  { label: 'Scheduler',    path: '/crm/scheduler' },
  { label: 'Behavior',     path: '/crm/behavior',     ownerOnly: true },
  { label: 'Reports',      path: '/crm/reports',      ownerOnly: true },
  { label: 'Automations',  path: '/crm/automations',  ownerAdminOnly: true },
  { label: 'Integrations', path: '/crm/integrations', ownerAdminOnly: true },
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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  const filterTab = (t: Tab) => {
    if (t.ownerAdminOnly && !isOwnerOrAdmin) return false;
    if (t.ownerOnly && role !== 'owner') return false;
    return true;
  };

  const visiblePrimary = PRIMARY.filter(filterTab);
  const visibleOverflow = OVERFLOW.filter(filterTab);

  // Close More when route changes
  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  // Click-outside for More menu
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [moreOpen]);

  const moreActive = visibleOverflow.some(t => isActive(location.pathname, t.path));

  return (
    <div
      className="hidden lg:block sticky top-[54px] z-30 backdrop-blur-xl bg-background/85"
      style={{ borderBottom: '1px solid hsl(var(--border) / 0.6)' }}
    >
      <div className="flex items-center gap-7 px-3 sm:px-4 lg:px-6 h-[46px]">
        {visiblePrimary.map(tab => {
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

        {/* More overflow */}
        {visibleOverflow.length > 0 && (
          <div ref={moreRef} className="relative h-full flex items-center">
            <button
              type="button"
              onClick={() => setMoreOpen(o => !o)}
              className="relative flex items-center gap-1 h-full text-[12.5px] tracking-tight transition-colors shrink-0 hover:text-foreground"
              style={{
                color: moreActive || moreOpen ? 'hsl(var(--foreground))' : INACTIVE,
                fontWeight: moreActive ? 600 : 500,
              }}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              More
              <ChevronDown className="w-3 h-3 opacity-60" strokeWidth={2} />
              {moreActive && (
                <span
                  className="absolute left-0 right-0 -bottom-px h-[2px] rounded-t-sm"
                  style={{ background: GOLD }}
                  aria-hidden
                />
              )}
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 min-w-[200px] rounded-lg border border-border/70 bg-popover shadow-2xl py-1 z-50"
              >
                {visibleOverflow.map(tab => {
                  const active = isActive(location.pathname, tab.path);
                  return (
                    <Link
                      key={tab.path}
                      to={tab.path}
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center px-3 py-1.5 text-[13px] hover:bg-muted/60 transition-colors"
                      style={{
                        color: active ? GOLD : 'hsl(var(--foreground))',
                        fontWeight: active ? 600 : 500,
                      }}
                      role="menuitem"
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
