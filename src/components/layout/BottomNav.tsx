import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Handshake, Building2, CalendarDays, MoreHorizontal,
  Users, Kanban, Mail, Inbox, BarChart3, Zap, LayoutTemplate, Plug,
  Settings, Settings2, Receipt, TrendingUp, BarChart2, Network,
  DollarSign, GitBranch, ShieldAlert, LogOut, X, Briefcase, Sparkles,
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
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import logoMark from '@/assets/logo-mark.png';

type Mode = 'workspace' | 'crm';

interface TabItem {
  label: string;
  path: string;
  icon: LucideIcon;
  ownerAdminOnly?: boolean;
}
interface MoreItem extends TabItem { description?: string; }
interface MoreGroup { label: string; items: MoreItem[] }

const GOLD = 'hsl(var(--primary))';
const GOLD_BG = 'hsl(var(--primary) / 0.14)';
const GOLD_RING = 'hsl(var(--primary) / 0.25)';
const BG = 'hsl(var(--background))';
const SURFACE = 'hsl(var(--card))';
const BORDER = 'hsl(var(--border) / 0.7)';
const INACTIVE = 'hsl(var(--muted-foreground))';
const SUBTLE = 'hsl(var(--muted-foreground) / 0.7)';

// ── Workspace tabs (Operations set) ──────────────────────────────
const WORKSPACE_TABS: TabItem[] = [
  { label: 'Home',     path: '/dashboard', icon: LayoutDashboard },
  { label: 'Deals',    path: '/deals',     icon: Handshake },
  { label: 'Clients',  path: '/inventory', icon: Building2 },
  { label: 'Network',  path: '/network',   icon: Network },
];

// ── CRM tabs (Daily flow set) ────────────────────────────────────
const CRM_TABS: TabItem[] = [
  { label: 'Leads',    path: '/crm/leads',    icon: Users },
  { label: 'Pipeline', path: '/crm/pipeline', icon: Kanban },
  { label: 'Inbox',    path: '/crm/email',    icon: Inbox },
  { label: 'Calendar', path: '/crm/calendar', icon: CalendarDays },
];

const WORKSPACE_MORE: MoreGroup[] = [
  {
    label: 'Production',
    items: [
      { label: 'Pipeline', path: '/pipeline', icon: GitBranch },
      { label: 'Payouts',  path: '/payouts',  icon: DollarSign },
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
];

const CRM_MORE: MoreGroup[] = [
  {
    label: 'Outreach',
    items: [
      { label: 'Templates',    path: '/crm/templates',  icon: LayoutTemplate },
      { label: 'Automations',  path: '/crm/automations', icon: Zap, ownerAdminOnly: true },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports',  path: '/crm/reports',  icon: BarChart3 },
      { label: 'Behavior', path: '/crm/behavior', icon: Sparkles },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Integrations', path: '/crm/integrations', icon: Plug,     ownerAdminOnly: true },
      { label: 'CRM Settings', path: '/crm/settings',     icon: Settings, ownerAdminOnly: true },
    ],
  },
];

function isActive(pathname: string, path: string): boolean {
  if (path === '/dashboard') return pathname === '/dashboard';
  return pathname === path || pathname.startsWith(path + '/');
}

function detectMode(pathname: string): Mode {
  return pathname.startsWith('/crm') ? 'crm' : 'workspace';
}

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { isMember: isCrmMember, isOwnerOrAdmin: isCrmAdmin } = useCrmAccess();
  const [moreOpen, setMoreOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const mode = detectMode(location.pathname);

  const tabs = mode === 'crm' ? CRM_TABS : WORKSPACE_TABS;
  const moreGroups = mode === 'crm' ? CRM_MORE : WORKSPACE_MORE;

  // Filter admin-only items
  const visibleMore = useMemo(
    () => moreGroups
      .map(g => ({ ...g, items: g.items.filter(i => !i.ownerAdminOnly || isCrmAdmin) }))
      .filter(g => g.items.length > 0),
    [moreGroups, isCrmAdmin]
  );

  const moreActive = !tabs.some(t => isActive(location.pathname, t.path)) &&
    visibleMore.some(g => g.items.some(i => isActive(location.pathname, i.path)));

  const initials = user?.email?.slice(0, 2).toUpperCase() || 'U';

  function switchMode(target: Mode) {
    if (target === mode) return;
    triggerHaptic('medium');
    navigate(target === 'crm' ? '/crm/leads' : '/dashboard');
  }

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl"
        style={{
          background: BG,
          borderTop: `1px solid ${BORDER}`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        aria-label="Primary"
      >
        {/* Context switcher pill — only visible to CRM members */}
        {isCrmMember && (
          <div
            className="px-4 pt-2 pb-1.5 border-b"
            style={{ borderColor: BORDER }}
          >
            <div
              className="relative flex items-center rounded-full p-0.5 mx-auto max-w-[260px]"
              style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
              role="tablist"
              aria-label="Switch context"
            >
              {/* Active indicator */}
              <div
                className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full transition-transform duration-300 ease-out"
                style={{
                  background: GOLD,
                  transform: mode === 'crm' ? 'translateX(calc(100% + 4px))' : 'translateX(0)',
                  boxShadow: '0 2px 8px hsl(var(--primary) / 0.35)',
                }}
              />
              <button
                onClick={() => switchMode('workspace')}
                role="tab"
                aria-selected={mode === 'workspace'}
                className="relative z-10 flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-semibold transition-colors"
                style={{ color: mode === 'workspace' ? 'hsl(var(--primary-foreground))' : INACTIVE }}
              >
                <Briefcase className="w-3.5 h-3.5" strokeWidth={2.2} />
                Workspace
              </button>
              <button
                onClick={() => switchMode('crm')}
                role="tab"
                aria-selected={mode === 'crm'}
                className="relative z-10 flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-semibold transition-colors"
                style={{ color: mode === 'crm' ? 'hsl(var(--primary-foreground))' : INACTIVE }}
              >
                <Users className="w-3.5 h-3.5" strokeWidth={2.2} />
                CRM
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-stretch justify-around h-[58px] px-1">
          {tabs.map(tab => {
            const active = isActive(location.pathname, tab.path);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.path}
                to={tab.path}
                onClick={() => triggerHaptic('light')}
                className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 active:scale-[0.92] transition-all duration-150 relative"
                style={{ color: active ? GOLD : INACTIVE }}
              >
                {/* Active dot indicator on top */}
                <span
                  className={cn(
                    'absolute top-0 left-1/2 -translate-x-1/2 h-[2px] rounded-full transition-all duration-300',
                    active ? 'w-6 opacity-100' : 'w-0 opacity-0'
                  )}
                  style={{ background: GOLD }}
                />
                <Icon
                  className="w-[22px] h-[22px] transition-transform"
                  strokeWidth={active ? 2.4 : 1.8}
                  style={active ? { filter: 'drop-shadow(0 1px 4px hsl(var(--primary) / 0.35))' } : undefined}
                />
                <span
                  className="text-[10.5px] leading-none truncate max-w-full px-1"
                  style={{ fontWeight: active ? 700 : 500 }}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 active:scale-[0.92] transition-all duration-150 relative"
                style={{ color: moreActive ? GOLD : INACTIVE }}
                aria-label="More"
              >
                <span
                  className={cn(
                    'absolute top-0 left-1/2 -translate-x-1/2 h-[2px] rounded-full transition-all duration-300',
                    moreActive ? 'w-6 opacity-100' : 'w-0 opacity-0'
                  )}
                  style={{ background: GOLD }}
                />
                <MoreHorizontal className="w-[22px] h-[22px]" strokeWidth={moreActive ? 2.4 : 1.8} />
                <span
                  className="text-[10.5px] leading-none"
                  style={{ fontWeight: moreActive ? 700 : 500 }}
                >
                  More
                </span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="p-0 border-0 rounded-t-2xl max-h-[88vh] flex flex-col"
              style={{ background: BG, height: '88vh' }}
            >
              <MoreSheet
                mode={mode}
                pathname={location.pathname}
                groups={visibleMore}
                isAdmin={!!isAdmin}
                userEmail={user?.email}
                initials={initials}
                onClose={() => setMoreOpen(false)}
                onSignOut={() => { setMoreOpen(false); setSignOutOpen(true); }}
                onSwitchMode={(m) => { setMoreOpen(false); switchMode(m); }}
                isCrmMember={isCrmMember}
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
  mode, pathname, groups, isAdmin, userEmail, initials,
  onClose, onSignOut, onSwitchMode, isCrmMember,
}: {
  mode: Mode;
  pathname: string;
  groups: MoreGroup[];
  isAdmin: boolean;
  userEmail?: string;
  initials: string;
  onClose: () => void;
  onSignOut: () => void;
  onSwitchMode: (m: Mode) => void;
  isCrmMember: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Drag handle */}
      <div className="shrink-0 pt-2.5 pb-1">
        <div
          className="mx-auto w-10 h-1 rounded-full"
          style={{ background: 'hsl(var(--muted-foreground) / 0.3)' }}
        />
      </div>
      <div
        className="shrink-0 flex items-center justify-between px-5 pb-3 pt-1 border-b"
        style={{ borderColor: BORDER }}
      >
        <div className="flex items-center gap-2.5">
          <img src={logoMark} alt="Dealzflow" className="w-[24px] h-[24px] rounded-[6px]" />
          <span className="font-semibold text-[15px] tracking-[-0.02em] text-foreground">
            Dealz<span style={{ color: GOLD }}>flow</span>
            <span className="ml-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: SUBTLE }}>
              · {mode === 'crm' ? 'CRM' : 'Workspace'}
            </span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="h-9 w-9 flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ background: SURFACE, color: INACTIVE }}
          aria-label="Close"
        >
          <X className="w-[18px] h-[18px]" strokeWidth={2} />
        </button>
      </div>

      {/* User row */}
      <div
        className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b"
        style={{ borderColor: BORDER }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
          style={{ background: GOLD, color: 'hsl(var(--primary-foreground))' }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px]" style={{ color: SUBTLE }}>Signed in as</div>
          <div className="text-[13px] font-medium truncate text-foreground">{userEmail}</div>
        </div>
      </div>

      {/* Quick switch (also available on the persistent pill, but reinforced here) */}
      {isCrmMember && (
        <div className="shrink-0 px-5 py-3 border-b" style={{ borderColor: BORDER }}>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: SUBTLE }}>
            Switch context
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSwitchMode('workspace')}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-xl active:scale-[0.96] transition-all',
                mode === 'workspace' ? 'ring-1' : ''
              )}
              style={{
                background: mode === 'workspace' ? GOLD_BG : SURFACE,
                color: mode === 'workspace' ? GOLD : 'hsl(var(--foreground))',
                ['--tw-ring-color' as never]: GOLD_RING,
              }}
            >
              <Briefcase className="w-4 h-4" strokeWidth={2} />
              <span className="text-[13px] font-semibold">Workspace</span>
            </button>
            <button
              onClick={() => onSwitchMode('crm')}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-xl active:scale-[0.96] transition-all',
                mode === 'crm' ? 'ring-1' : ''
              )}
              style={{
                background: mode === 'crm' ? GOLD_BG : SURFACE,
                color: mode === 'crm' ? GOLD : 'hsl(var(--foreground))',
                ['--tw-ring-color' as never]: GOLD_RING,
              }}
            >
              <Users className="w-4 h-4" strokeWidth={2} />
              <span className="text-[13px] font-semibold">CRM</span>
            </button>
          </div>
        </div>
      )}

      {/* Scrollable groups */}
      <div
        className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        {groups.map(group => (
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
                      background: active ? GOLD_BG : SURFACE,
                      color: active ? GOLD : 'hsl(var(--foreground))',
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
        <div className="pt-2 border-t space-y-1" style={{ borderColor: BORDER }}>
          <Link
            to="/settings"
            onClick={onClose}
            className="flex items-center gap-3 min-h-[48px] px-3 rounded-xl text-[14px] active:scale-[0.98] transition-transform"
            style={{
              color: isActive(pathname, '/settings') ? GOLD : 'hsl(var(--foreground))',
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
            style={{ color: 'hsl(var(--destructive))', fontWeight: 500 }}
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.8} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
