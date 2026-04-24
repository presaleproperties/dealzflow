import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import {
  LayoutDashboard, Users, Send, BarChart3, MoreHorizontal,
  Kanban, Mail, MessageCircle, LayoutTemplate, BookUser, Zap, CalendarDays,
  Settings, X,
} from 'lucide-react';
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface NavChild { label: string; path: string; icon: LucideIcon; ownerAdminOnly?: boolean; }
interface PrimaryItem { label: string; icon: LucideIcon; path?: string; sectionKey?: string; children?: NavChild[]; }

const PRIMARY: PrimaryItem[] = [
  { label: 'Leads',    icon: Users, path: '/crm/leads' },
  {
    label: 'Leads',
    icon: Users,
    sectionKey: 'leads',
    children: [
      { label: 'Leads & Contacts', path: '/crm/leads',     icon: Users },
      { label: 'Pipeline',         path: '/crm/pipeline',  icon: Kanban },
      { label: 'Contacts',         path: '/crm/contacts',  icon: BookUser },
      { label: 'Calendar',         path: '/crm/calendar',  icon: CalendarDays },
    ],
  },
  {
    label: 'Outreach',
    icon: Send,
    sectionKey: 'outreach',
    children: [
      { label: 'Email Center', path: '/crm/email',       icon: Mail },
      { label: 'Templates',    path: '/crm/templates',   icon: LayoutTemplate },
      { label: 'Automations',  path: '/crm/automations', icon: Zap, ownerAdminOnly: true },
    ],
  },
  { label: 'Insights', icon: BarChart3, path: '/crm/reports' },
];

const ADMIN_ITEMS: NavChild[] = [
  { label: 'CRM Settings', path: '/crm/settings', icon: Settings, ownerAdminOnly: true },
];

const GOLD = 'hsl(var(--primary))';
const GOLD_BG = 'hsl(var(--primary) / 0.12)';
const MUTED_ICON = 'hsl(var(--muted-foreground))';
const DARK_BG = 'hsl(var(--background))';

export function CrmMobileNav() {
  const location = useLocation();
  const { isOwnerOrAdmin } = useCrmAccess();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const filterChildren = (children?: NavChild[]) =>
    (children ?? []).filter(c => !c.ownerAdminOnly || isOwnerOrAdmin);

  const isPrimaryActive = (item: PrimaryItem) => {
    if (item.path) {
      return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
    }
    return filterChildren(item.children).some(c => location.pathname.startsWith(c.path));
  };

  const activeSection = PRIMARY.find(p => p.sectionKey === openSection);
  const activeChildren = activeSection ? filterChildren(activeSection.children) : [];

  const visibleAdmin = ADMIN_ITEMS.filter(c => !c.ownerAdminOnly || isOwnerOrAdmin);
  const showMore = visibleAdmin.length > 0;
  const isMoreActive = visibleAdmin.some(c => location.pathname.startsWith(c.path));

  function closeAll() {
    setOpenSection(null);
    setMoreOpen(false);
  }

  return (
    <>
      {/* Section sheet */}
      {(openSection || moreOpen) && (
        <div
          className="fixed inset-0 z-[60] bg-black/50"
          onClick={closeAll}
        >
          <div
            className="absolute bottom-0 inset-x-0 rounded-t-2xl animate-in slide-in-from-bottom duration-200"
            style={{ background: DARK_BG }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-4 pb-2">
              <span className="text-sm font-bold text-foreground">
                {moreOpen ? 'More' : activeSection?.label}
              </span>
              <button onClick={closeAll} className="p-1">
                <X className="w-4 h-4" style={{ color: MUTED_ICON }} />
              </button>
            </div>
            <nav className="px-3 pb-4 space-y-0.5 max-h-[50vh] overflow-y-auto">
              {(moreOpen ? visibleAdmin : activeChildren).map(item => {
                const isActive = location.pathname.startsWith(item.path);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => { closeAll(); triggerHaptic('light'); }}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors"
                    style={{
                      color: isActive ? GOLD : 'hsl(var(--muted-foreground))',
                      background: isActive ? GOLD_BG : undefined,
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

      {/* Bottom nav bar — mobile only */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50">
        <div className="absolute inset-0" style={{ background: DARK_BG }} />
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'rgba(255,255,255,0.1)' }}
        />

        <div className="relative flex items-center justify-around h-14 px-1">
          {PRIMARY.map(item => {
            const isActive = isPrimaryActive(item);
            const Icon = item.icon;

            const handleClick = () => {
              triggerHaptic('light');
              if (item.sectionKey) {
                setOpenSection(item.sectionKey);
                setMoreOpen(false);
              }
            };

            const content = (
              <>
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
              </>
            );

            const className = "flex flex-col items-center gap-1 flex-1 py-1 select-none active:scale-90 active:opacity-60 transition-all duration-150";

            if (item.path) {
              return (
                <Link key={item.label} to={item.path} onClick={handleClick} className={className}>
                  {content}
                </Link>
              );
            }
            return (
              <button key={item.label} onClick={handleClick} className={className}>
                {content}
              </button>
            );
          })}

          {showMore && (
            <button
              onClick={() => { setMoreOpen(true); setOpenSection(null); triggerHaptic('light'); }}
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
          )}
        </div>

        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </nav>
    </>
  );
}
