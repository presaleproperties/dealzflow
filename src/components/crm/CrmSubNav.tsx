import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Kanban, Mail, MessageCircle,
  LayoutTemplate, CalendarDays, BarChart3, Zap, Plug, Settings, Activity, CalendarClock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCrmAccess } from '@/contexts/CrmAccessContext';

interface Tab { label: string; path: string; icon: LucideIcon; ownerAdminOnly?: boolean; }

const TABS: Tab[] = [
  
  { label: 'Leads',        path: '/crm/leads',        icon: Users },
  { label: 'Pipeline',     path: '/crm/pipeline',     icon: Kanban },
  { label: 'Email',        path: '/crm/email',        icon: Mail },
  { label: 'SMS',          path: '/crm/sms',          icon: MessageCircle },
  { label: 'Templates',    path: '/crm/templates',    icon: LayoutTemplate },
  { label: 'Calendar',     path: '/crm/calendar',     icon: CalendarDays },
  { label: 'Scheduler',    path: '/crm/scheduler',    icon: CalendarClock },
  { label: 'Behavior',     path: '/crm/behavior',     icon: Activity },
  { label: 'Reports',      path: '/crm/reports',      icon: BarChart3 },
  { label: 'Automations',  path: '/crm/automations',  icon: Zap,      ownerAdminOnly: true },
  { label: 'Integrations', path: '/crm/integrations', icon: Plug,     ownerAdminOnly: true },
  { label: 'Settings',     path: '/crm/settings',     icon: Settings, ownerAdminOnly: true },
];

const TEAL = 'hsl(var(--primary))';
const TEAL_BG = 'hsl(var(--primary) / 0.12)';
const NAVY_BG = 'hsl(var(--background))';
const NAVY_BORDER = 'hsl(var(--border) / 0.85)';
const INACTIVE = 'hsl(var(--muted-foreground))';

function isActive(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(path + '/');
}

export function CrmSubNav() {
  const location = useLocation();
  const { isOwnerOrAdmin } = useCrmAccess();
  const visible = TABS.filter(t => !t.ownerAdminOnly || isOwnerOrAdmin);

  return (
    <div
      className="hidden lg:block sticky top-[54px] z-30 backdrop-blur-xl"
      style={{
        background: NAVY_BG,
        borderBottom: `1px solid ${NAVY_BORDER}`,
      }}
    >
      <div className="flex items-center gap-0.5 px-3 sm:px-4 lg:px-6 h-[42px] overflow-x-auto">
        <div
          className="text-[10.5px] font-semibold uppercase tracking-[0.16em] mr-3 shrink-0"
          style={{ color: TEAL }}
        >
          CRM
        </div>
        {visible.map(tab => {
          const active = isActive(location.pathname, tab.path);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12.5px] transition-colors shrink-0"
              style={{
                color: active ? TEAL : INACTIVE,
                background: active ? TEAL_BG : 'transparent',
                fontWeight: active ? 600 : 500,
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = 'hsl(var(--muted) / 0.6)';
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = 'transparent';
              }}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={active ? 2.2 : 1.8} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
