import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Command, LayoutDashboard, GitBranch, Handshake, DollarSign, Building2,
  Receipt, TrendingUp, BarChart2, Users, Kanban, Mail, MessageCircle,
  LayoutTemplate, Zap, CalendarDays, BarChart3, Settings, Plug, Network,
  MoreHorizontal, Sparkles, ShieldAlert, LogOut, Settings2, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useAdmin';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import logoMark from '@/assets/logo-mark.png';

const GOLD = 'hsl(39 67% 55%)';
const GOLD_BG = 'hsl(39 67% 55% / 0.12)';
const DARK_BG = 'hsl(222 25% 9%)';
const DARK_BG_2 = 'hsl(222 25% 11%)';
const DARK_BORDER = 'hsl(222 20% 14% / 0.8)';
const INACTIVE = 'hsl(220 8% 60%)';
const SUBTLE = 'hsl(220 8% 50%)';

interface TabItem { label: string; path: string; icon: LucideIcon; }
interface MoreItem extends TabItem { description?: string; ownerAdminOnly?: boolean; crmOnly?: boolean; }
interface MoreGroup { label: string; items: MoreItem[]; crmOnly?: boolean; }

// 5 primary tabs (Lofty-style). Last tab = More (drawer).
const PRIMARY_TABS: TabItem[] = [
  { label: 'Home',     path: '/dashboard',      icon: LayoutDashboard },
  { label: 'Pipeline', path: '/pipeline',       icon: GitBranch },
  { label: 'Deals',    path: '/deals',          icon: Handshake },
  { label: 'Leads',    path: '/crm/leads',      icon: Users },
];

const MORE_GROUPS: MoreGroup[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Production',
    items: [
      { label: 'Pipeline',         path: '/pipeline',  icon: GitBranch },
      { label: 'Deals',            path: '/deals',     icon: Handshake },
      { label: 'Payouts',          path: '/payouts',   icon: DollarSign },
      { label: 'Client Inventory', path: '/inventory', icon: Building2 },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Expenses',  path: '/expenses',  icon: Receipt },
      { label: 'Forecast',  path: '/forecast',  icon: TrendingUp },
      { label: 'Analytics', path: '/analytics', icon: BarChart2 },
    ],
  },
  {
    label: 'CRM',
    crmOnly: true,
    items: [
      
      { label: 'Leads',         path: '/crm/leads',        icon: Users },
      { label: 'Pipeline',      path: '/crm/pipeline',     icon: Kanban },
      { label: 'Email Center',  path: '/crm/email',        icon: Mail },
      { label: 'Templates',     path: '/crm/templates',    icon: LayoutTemplate },
      { label: 'Calendar',      path: '/crm/calendar',     icon: CalendarDays },
      { label: 'Reports',       path: '/crm/reports',      icon: BarChart3 },
      { label: 'Automations',   path: '/crm/automations',  icon: Zap,      ownerAdminOnly: true },
      { label: 'Integrations',  path: '/crm/integrations', icon: Plug,     ownerAdminOnly: true },
      { label: 'CRM Settings',  path: '/crm/settings',     icon: Settings, ownerAdminOnly: true },
    ],
  },
  {
    label: 'Network',
    items: [
      { label: 'Network', path: '/network', icon: Network },
    ],
  },
];

function isActive(pathname: string, path: string): boolean {
  if (path === '/dashboard') return pathname === '/dashboard';
  return pathname === path || pathname.startsWith(path + '/');
}

export function MobileTabBar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { isMember: isCrmMember, isOwnerOrAdmin: isCrmAdmin } = useCrmAccess();
  const [moreOpen, setMoreOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  // Filter tabs - hide CRM Leads if not a member
  const visibleTabs = PRIMARY_TABS.filter(t => {
    if (t.path.startsWith('/crm') && !isCrmMember) return false;
    return true;
  });

  const moreActive = !visibleTabs.some(t => isActive(location.pathname, t.path));
  const initials = user?.email?.slice(0, 2).toUpperCase() || 'U';

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl"
        style={{
          background: DARK_BG,
          borderTop: `1px solid ${DARK_BORDER}`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        aria-label="Primary"
      >
        <div className="flex items-stretch justify-around h-[58px] px-1">
          {visibleTabs.map(tab => {
            const active = isActive(location.pathname, tab.path);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 active:scale-[0.92] transition-transform"
                style={{ color: active ? GOLD : INACTIVE }}
              >
                <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.4 : 1.8} />
                <span
                  className="text-[10.5px] leading-none truncate max-w-full px-1"
                  style={{ fontWeight: active ? 600 : 500 }}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 active:scale-[0.92] transition-transform"
                style={{ color: moreActive ? GOLD : INACTIVE }}
                aria-label="More"
              >
                <MoreHorizontal className="w-[22px] h-[22px]" strokeWidth={moreActive ? 2.4 : 1.8} />
                <span
                  className="text-[10.5px] leading-none"
                  style={{ fontWeight: moreActive ? 600 : 500 }}
                >
                  More
                </span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="p-0 border-0 rounded-t-2xl max-h-[88vh] flex flex-col"
              style={{ background: DARK_BG, height: '88vh' }}
            >
              <MoreSheet
                pathname={location.pathname}
                isCrmMember={isCrmMember}
                isCrmAdmin={isCrmAdmin}
                isAdmin={!!isAdmin}
                userEmail={user?.email}
                initials={initials}
                onClose={() => setMoreOpen(false)}
                onSignOut={() => { setMoreOpen(false); setSignOutOpen(true); }}
              />
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to sign back in to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setSignOutOpen(false); signOut(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MoreSheet({
  pathname, isCrmMember, isCrmAdmin, isAdmin, userEmail, initials, onClose, onSignOut,
}: {
  pathname: string;
  isCrmMember: boolean;
  isCrmAdmin: boolean;
  isAdmin: boolean;
  userEmail?: string;
  initials: string;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const visibleGroups = MORE_GROUPS
    .filter(g => !g.crmOnly || isCrmMember)
    .map(g => ({
      ...g,
      items: g.items.filter(i => !i.ownerAdminOnly || isCrmAdmin),
    }))
    .filter(g => g.items.length > 0);

  return (
    <div className="flex flex-col h-full">
      {/* Drag handle + header */}
      <div className="shrink-0 pt-2.5 pb-1">
        <div
          className="mx-auto w-10 h-1 rounded-full"
          style={{ background: 'hsl(220 8% 25%)' }}
        />
      </div>
      <div
        className="shrink-0 flex items-center justify-between px-5 pb-3 pt-1 border-b"
        style={{ borderColor: DARK_BORDER }}
      >
        <div className="flex items-center gap-2.5">
          <img src={logoMark} alt="Dealzflow" className="w-[24px] h-[24px] rounded-[6px]" />
          <span className="font-semibold text-[15px] tracking-[-0.02em] text-white">
            Dealz<span style={{ color: GOLD }}>flow</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="h-9 w-9 flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ background: DARK_BG_2, color: INACTIVE }}
          aria-label="Close"
        >
          <X className="w-[18px] h-[18px]" strokeWidth={2} />
        </button>
      </div>

      {/* User row */}
      <div
        className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b"
        style={{ borderColor: DARK_BORDER }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
          style={{ background: GOLD }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px]" style={{ color: SUBTLE }}>Signed in as</div>
          <div className="text-[13px] font-medium truncate text-white">{userEmail}</div>
        </div>
      </div>

      {/* Scrollable groups */}
      <div
        className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        {visibleGroups.map(group => (
          <div key={group.label}>
            <div
              className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: SUBTLE }}
            >
              {group.label}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {group.items.map(item => {
                const active = isActive(pathname, item.path);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 rounded-xl active:scale-[0.96] transition-transform"
                    style={{
                      background: active ? GOLD_BG : DARK_BG_2,
                      color: active ? GOLD : 'hsl(220 10% 80%)',
                    }}
                  >
                    <Icon className="w-[20px] h-[20px]" strokeWidth={active ? 2.2 : 1.8} />
                    <span
                      className="text-[11.5px] leading-tight text-center line-clamp-2"
                      style={{ fontWeight: active ? 600 : 500 }}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Account actions */}
        <div className="pt-2 border-t space-y-1" style={{ borderColor: DARK_BORDER }}>
          <Link
            to="/settings"
            onClick={onClose}
            className="flex items-center gap-3 min-h-[48px] px-3 rounded-xl text-[14px] active:scale-[0.98] transition-transform"
            style={{
              color: isActive(pathname, '/settings') ? GOLD : 'hsl(220 10% 80%)',
              background: isActive(pathname, '/settings') ? GOLD_BG : 'transparent',
              fontWeight: isActive(pathname, '/settings') ? 600 : 500,
            }}
          >
            <Settings2 className="w-[18px] h-[18px]" strokeWidth={1.8} />
            Settings
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              onClick={onClose}
              className="flex items-center gap-3 min-h-[48px] px-3 rounded-xl text-[14px] active:scale-[0.98] transition-transform"
              style={{ color: 'hsl(38 90% 60%)', fontWeight: 500 }}
            >
              <ShieldAlert className="w-[18px] h-[18px]" strokeWidth={1.8} />
              Admin
            </Link>
          )}
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-3 min-h-[48px] px-3 rounded-xl text-[14px] active:scale-[0.98] transition-transform"
            style={{ color: 'hsl(0 70% 65%)', fontWeight: 500 }}
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.8} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
