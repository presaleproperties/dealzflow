import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Kanban, Mail, MessageCircle,
  LayoutTemplate, CalendarDays, BarChart3, Zap, Plug, Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCrmAccess } from '@/contexts/CrmAccessContext';

interface Tab { label: string; path: string; icon: LucideIcon; ownerAdminOnly?: boolean; }

const TABS: Tab[] = [
  
  { label: 'Leads',        path: '/crm/leads',        icon: Users },
  { label: 'Pipeline',     path: '/crm/pipeline',     icon: Kanban },
  { label: 'Email',        path: '/crm/email',        icon: Mail },
  { label: 'WhatsApp',     path: '/crm/whatsapp',     icon: MessageCircle },
  { label: 'Templates',    path: '/crm/templates',    icon: LayoutTemplate },
  { label: 'Calendar',     path: '/crm/calendar',     icon: CalendarDays },
  { label: 'Reports',      path: '/crm/reports',      icon: BarChart3 },
  { label: 'Automations',  path: '/crm/automations',  icon: Zap,      ownerAdminOnly: true },
  { label: 'Integrations', path: '/crm/integrations', icon: Plug,     ownerAdminOnly: true },
  { label: 'Settings',     path: '/crm/settings',     icon: Settings, ownerAdminOnly: true },
];

const TEAL = 'hsl(178 65% 50%)';
const TEAL_BG = 'hsl(178 65% 50% / 0.12)';
const NAVY_BG = 'hsl(220 35% 8%)';
const NAVY_BORDER = 'hsl(220 30% 14% / 0.85)';
const INACTIVE = 'hsl(220 12% 62%)';

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
                if (!active) e.currentTarget.style.background = 'hsl(220 30% 14%)';
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
