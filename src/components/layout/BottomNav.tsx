import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Handshake, Building2, CalendarDays, MoreHorizontal,
  Users, Kanban, Mail, Inbox, BarChart3, Zap, LayoutTemplate, Plug,
  Settings, Settings2, Receipt, TrendingUp, BarChart2, Network,
  DollarSign, GitBranch, ShieldAlert, LogOut, X, Briefcase, Sparkles,
  MessageCircle, MessageSquare, Plus, UserPlus, CalendarPlus, FileText,
  PenSquare,
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
import { AddLeadDialog } from '@/components/crm/leads/AddLeadDialog';
import { BookShowingModal } from '@/components/crm/calendar/BookShowingModal';

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

// ── Workspace tabs (3 + FAB + More) ──────────────────────────────
const WORKSPACE_TABS: TabItem[] = [
  { label: 'Home',     path: '/dashboard', icon: LayoutDashboard },
  { label: 'Deals',    path: '/deals',     icon: Handshake },
  { label: 'Clients',  path: '/inventory', icon: Building2 },
];

// ── CRM tabs (Chats · Leads · [+] · Calendar · More) ─────────────
const CRM_TABS: TabItem[] = [
  { label: 'Chats',    path: '/crm/chats',    icon: MessageCircle },
  { label: 'Leads',    path: '/crm/leads',    icon: Users },
  { label: 'Calendar', path: '/crm/calendar', icon: CalendarDays },
];

const WORKSPACE_MORE: MoreGroup[] = [
  {
    label: 'Production',
    items: [
      { label: 'Pipeline', path: '/pipeline', icon: GitBranch },
      { label: 'Network',  path: '/network',  icon: Network },
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
    label: 'Workflow',
    items: [
      { label: 'Pipeline',     path: '/crm/pipeline', icon: Kanban },
      { label: 'Email Center', path: '/crm/email',    icon: Mail },
      { label: 'SMS Center',   path: '/crm/sms',      icon: MessageSquare },
    ],
  },
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

type QuickAction = {
  label: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: 'gold' | 'default';
};

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { isMember: isCrmMember, isOwnerOrAdmin: isCrmAdmin } = useCrmAccess();
  const [moreOpen, setMoreOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [bookShowingOpen, setBookShowingOpen] = useState(false);

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

  // Quick-action menu — context-aware
  const quickActions: QuickAction[] = useMemo(() => {
    const close = () => setQuickOpen(false);
    if (mode === 'crm') {
      return [
        {
          label: 'Add Lead',
          description: 'Create a new contact in the CRM',
          icon: UserPlus,
          tone: 'gold',
          onClick: () => { close(); setAddLeadOpen(true); },
        },
        {
          label: 'Book Showing',
          description: 'Schedule a property visit',
          icon: CalendarPlus,
          onClick: () => { close(); setBookShowingOpen(true); },
        },
        {
          label: 'Compose Email',
          description: 'Open the email center',
          icon: Mail,
          onClick: () => { close(); navigate('/crm/email'); },
        },
        {
          label: 'Send Text',
          description: 'SMS or WhatsApp',
          icon: MessageSquare,
          onClick: () => { close(); navigate('/crm/sms'); },
        },
      ];
    }
    return [
      {
        label: 'New Deal',
        description: 'Log a new transaction',
        icon: Handshake,
        tone: 'gold',
        onClick: () => { close(); navigate('/deals/new'); },
      },
      {
        label: 'Add Expense',
        description: 'Track a business expense',
        icon: Receipt,
        onClick: () => { close(); navigate('/expenses'); },
      },
      {
        label: 'New Note',
        description: 'Quick capture',
        icon: PenSquare,
        onClick: () => { close(); navigate('/dashboard'); },
      },
    ];
  }, [mode, navigate]);


  const renderTab = (tab: TabItem) => {
    const active = isActive(location.pathname, tab.path);
    const Icon = tab.icon;
    return (
      <Link
        key={tab.path}
        to={tab.path}
        onClick={() => triggerHaptic('selection')}
        aria-label={tab.label}
        aria-current={active ? 'page' : undefined}
        className="group relative flex h-full min-w-0 flex-col items-center justify-center gap-[3px] px-1 active:scale-[0.94] transition-transform duration-150"
        style={{ color: active ? GOLD : INACTIVE }}
      >
        {/* Active pill background */}
        <span
          aria-hidden
          className={cn(
            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl transition-all duration-300 ease-out',
            active ? 'w-[54px] h-[36px] opacity-100' : 'w-[44px] h-[32px] opacity-0',
          )}
          style={{ background: GOLD_BG }}
        />
        <Icon
          className="relative w-[22px] h-[22px] transition-transform duration-200"
          strokeWidth={active ? 2.3 : 1.8}
          style={active ? { filter: 'drop-shadow(0 1px 4px hsl(var(--primary) / 0.35))' } : undefined}
        />
        <span
          className="relative text-[10.5px] leading-none tracking-[-0.01em] truncate max-w-full"
          style={{ fontWeight: active ? 700 : 500 }}
        >
          {tab.label}
        </span>
      </Link>
    );
  };

  // All primary destinations (tabs + More) share equal-width grid cells
  const cellCount = tabs.length + 1;

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 native-chrome"
        aria-label="Primary"
      >
        {/* Slim flush bar — frosted glass, hugs the home indicator. */}
        <div
          className="relative backdrop-blur-2xl"
          style={{
            background:
              'linear-gradient(180deg, hsl(var(--background) / 0.92) 0%, hsl(var(--background) / 0.98) 100%)',
            borderTop: `1px solid ${BORDER}`,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {/* Subtle gold sheen across top edge */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-32 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.6), transparent)',
            }}
          />

          {/* Tabs row — 52px equal-width grid (slim flush bar, hugs home indicator) */}
          <div
            className="grid h-[52px] mx-auto max-w-[520px] px-2"
            style={{ gridTemplateColumns: `repeat(${cellCount}, minmax(0, 1fr))` }}
          >
            {tabs.map(renderTab)}

            {/* More button */}
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  onClick={() => triggerHaptic('selection')}
                  aria-label="More"
                  aria-current={moreActive ? 'page' : undefined}
                  className="group relative flex h-full min-w-0 flex-col items-center justify-center gap-[3px] px-1 active:scale-[0.94] transition-transform duration-150"
                  style={{ color: moreActive ? GOLD : INACTIVE }}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl transition-all duration-300 ease-out',
                      moreActive ? 'w-[54px] h-[36px] opacity-100' : 'w-[44px] h-[32px] opacity-0',
                    )}
                    style={{ background: GOLD_BG }}
                  />
                  <MoreHorizontal
                    className="relative w-[22px] h-[22px]"
                    strokeWidth={moreActive ? 2.3 : 1.8}
                  />
                  <span
                    className="relative text-[10.5px] leading-none tracking-[-0.01em]"
                    style={{ fontWeight: moreActive ? 700 : 500 }}
                  >
                    More
                  </span>
                </button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                hideClose
                className="p-0 border-0 rounded-t-[24px] max-h-[90vh] flex flex-col overflow-hidden shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.4)]"
                style={{ background: BG, height: '90vh' }}
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
        </div>
      </nav>

      {/* Quick-add dialogs */}
      <AddLeadDialog open={addLeadOpen} onOpenChange={setAddLeadOpen} />
      <BookShowingModal open={bookShowingOpen} onOpenChange={setBookShowingOpen} />

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
      <div className="shrink-0 pt-2.5 pb-1.5">
        <div
          className="mx-auto w-9 h-[3px] rounded-full"
          style={{ background: 'hsl(var(--muted-foreground) / 0.28)' }}
        />
      </div>

      {/* Header — single close button only */}
      <div className="shrink-0 flex items-center justify-between px-5 pt-1 pb-3">
        <div className="flex items-center gap-2.5">
          <img src={logoMark} alt="Dealzflow" className="w-[26px] h-[26px] rounded-[7px]" />
          <div className="flex flex-col leading-none">
            <span className="font-semibold text-[15px] tracking-[-0.02em] text-foreground">
              Dealz<span style={{ color: GOLD }}>flow</span>
            </span>
            <span className="text-[10px] mt-0.5 font-medium uppercase tracking-[0.16em]" style={{ color: SUBTLE }}>
              {mode === 'crm' ? 'CRM Workspace' : 'Operations'}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="h-9 w-9 flex items-center justify-center rounded-full active:scale-95 transition-transform border"
          style={{ background: SURFACE, color: 'hsl(var(--foreground))', borderColor: BORDER }}
          aria-label="Close"
        >
          <X className="w-[16px] h-[16px]" strokeWidth={2.2} />
        </button>
      </div>

      {/* Context switcher — premium segmented pill */}
      {isCrmMember && (
        <div className="shrink-0 px-5 pb-3">
          <div
            className="relative flex items-center p-1 rounded-full"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
          >
            {/* Sliding indicator */}
            <div
              className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out"
              style={{
                background: GOLD,
                boxShadow: '0 4px 14px hsl(var(--primary) / 0.35)',
                transform: mode === 'workspace' ? 'translateX(0)' : 'translateX(calc(100% + 8px))',
              }}
            />
            <button
              onClick={() => onSwitchMode('workspace')}
              className="relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full transition-colors"
              style={{ color: mode === 'workspace' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))' }}
            >
              <Briefcase className="w-[15px] h-[15px]" strokeWidth={2.2} />
              <span className="text-[13px] font-semibold tracking-[-0.01em]">Workspace</span>
            </button>
            <button
              onClick={() => onSwitchMode('crm')}
              className="relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full transition-colors"
              style={{ color: mode === 'crm' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))' }}
            >
              <Users className="w-[15px] h-[15px]" strokeWidth={2.2} />
              <span className="text-[13px] font-semibold tracking-[-0.01em]">CRM</span>
            </button>
          </div>
        </div>
      )}

      {/* User row — minimalist */}
      <div
        className="shrink-0 mx-5 mb-3 flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border"
        style={{ borderColor: BORDER, background: SURFACE }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[11.5px] font-bold shrink-0"
          style={{ background: GOLD_BG, color: GOLD, border: `1px solid ${GOLD_RING}` }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: SUBTLE }}>Signed in</div>
          <div className="text-[13px] font-medium truncate text-foreground">{userEmail}</div>
        </div>
      </div>

      {/* Scrollable groups */}
      <div
        className="flex-1 overflow-y-auto px-5 pt-1 space-y-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        {groups.map(group => (
          <div key={group.label}>
            <div
              className="px-1 pb-2.5 text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ color: SUBTLE }}
            >
              {group.label}
            </div>
            <div
              className="rounded-2xl overflow-hidden border"
              style={{ background: SURFACE, borderColor: BORDER }}
            >
              {group.items.map((item, idx) => {
                const active = isActive(pathname, item.path);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3.5 px-4 py-3.5 active:bg-muted/40 transition-colors relative',
                      idx !== group.items.length - 1 && 'border-b',
                    )}
                    style={{
                      borderColor: BORDER,
                      color: active ? GOLD : 'hsl(var(--foreground))',
                    }}
                  >
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                        style={{ background: GOLD }}
                      />
                    )}
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: active ? GOLD_BG : 'hsl(var(--muted) / 0.5)',
                        color: active ? GOLD : 'hsl(var(--foreground))',
                      }}
                    >
                      <Icon className="w-[17px] h-[17px]" strokeWidth={active ? 2.2 : 1.8} />
                    </div>
                    <span
                      className="flex-1 text-[14px] tracking-[-0.01em]"
                      style={{ fontWeight: active ? 600 : 500 }}
                    >
                      {item.label}
                    </span>
                    <span style={{ color: SUBTLE }} className="text-[18px] leading-none">›</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Account actions */}
        <div>
          <div
            className="px-1 pb-2.5 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: SUBTLE }}
          >
            Account
          </div>
          <div
            className="rounded-2xl overflow-hidden border"
            style={{ background: SURFACE, borderColor: BORDER }}
          >
            <Link
              to="/settings"
              onClick={onClose}
              className="flex items-center gap-3.5 px-4 py-3.5 active:bg-muted/40 transition-colors border-b"
              style={{
                borderColor: BORDER,
                color: isActive(pathname, '/settings') ? GOLD : 'hsl(var(--foreground))',
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: isActive(pathname, '/settings') ? GOLD_BG : 'hsl(var(--muted) / 0.5)',
                  color: isActive(pathname, '/settings') ? GOLD : 'hsl(var(--foreground))',
                }}
              >
                <Settings2 className="w-[17px] h-[17px]" strokeWidth={1.9} />
              </div>
              <span className="flex-1 text-[14px] font-medium tracking-[-0.01em]">Settings</span>
              <span style={{ color: SUBTLE }} className="text-[18px] leading-none">›</span>
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                onClick={onClose}
                className="flex items-center gap-3.5 px-4 py-3.5 active:bg-muted/40 transition-colors border-b"
                style={{ borderColor: BORDER, color: 'hsl(38 90% 60%)' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'hsl(38 90% 60% / 0.12)', color: 'hsl(38 90% 60%)' }}
                >
                  <ShieldAlert className="w-[17px] h-[17px]" strokeWidth={1.9} />
                </div>
                <span className="flex-1 text-[14px] font-medium tracking-[-0.01em]">Admin</span>
                <span style={{ color: SUBTLE }} className="text-[18px] leading-none">›</span>
              </Link>
            )}
            <button
              onClick={onSignOut}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 active:bg-muted/40 transition-colors"
              style={{ color: 'hsl(var(--destructive))' }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'hsl(var(--destructive) / 0.12)', color: 'hsl(var(--destructive))' }}
              >
                <LogOut className="w-[17px] h-[17px]" strokeWidth={1.9} />
              </div>
              <span className="flex-1 text-left text-[14px] font-medium tracking-[-0.01em]">Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionsSheet({
  mode,
  actions,
  onClose,
}: {
  mode: Mode;
  actions: QuickAction[];
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col">
      {/* Drag handle */}
      <div className="shrink-0 pt-2.5 pb-1.5">
        <div
          className="mx-auto w-9 h-[3px] rounded-full"
          style={{ background: 'hsl(var(--muted-foreground) / 0.28)' }}
        />
      </div>

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 pt-1 pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: SUBTLE }}>
            Quick Add
          </p>
          <h2 className="text-[18px] font-bold tracking-[-0.02em] text-foreground mt-0.5">
            What would you like to create?
          </h2>
        </div>
        <button
          onClick={onClose}
          className="h-9 w-9 flex items-center justify-center rounded-full active:scale-95 transition-transform border shrink-0"
          style={{ background: SURFACE, color: 'hsl(var(--foreground))', borderColor: BORDER }}
          aria-label="Close"
        >
          <X className="w-[16px] h-[16px]" strokeWidth={2.2} />
        </button>
      </div>

      {/* Actions */}
      <div
        className="px-5 pb-4 space-y-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
      >
        {actions.map((action) => {
          const Icon = action.icon;
          const isGold = action.tone === 'gold';
          return (
            <button
              key={action.label}
              onClick={() => {
                triggerHaptic('selection');
                action.onClick();
              }}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border active:scale-[0.98] transition-all text-left"
              style={{
                background: isGold ? GOLD_BG : SURFACE,
                borderColor: isGold ? GOLD_RING : BORDER,
              }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: isGold
                    ? 'linear-gradient(145deg, hsl(var(--primary)), hsl(var(--primary) / 0.85))'
                    : 'hsl(var(--muted) / 0.6)',
                  color: isGold ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                  boxShadow: isGold
                    ? '0 4px 12px -2px hsl(var(--primary) / 0.45), inset 0 1px 0 hsl(0 0% 100% / 0.25)'
                    : 'none',
                }}
              >
                <Icon className="w-[19px] h-[19px]" strokeWidth={2.1} />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[14.5px] font-semibold tracking-[-0.01em]"
                  style={{ color: isGold ? GOLD : 'hsl(var(--foreground))' }}
                >
                  {action.label}
                </p>
                <p className="text-[12px] mt-0.5 truncate" style={{ color: SUBTLE }}>
                  {action.description}
                </p>
              </div>
              <span style={{ color: SUBTLE }} className="text-[18px] leading-none">›</span>
            </button>
          );
        })}

        <p className="text-[11px] text-center pt-3" style={{ color: SUBTLE }}>
          {mode === 'crm' ? 'CRM actions' : 'Workspace actions'}
        </p>
      </div>
    </div>
  );
}
