import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { formatDistanceToNow } from 'date-fns';
import {
  Sparkles, Phone, Inbox, Bell, HelpCircle, Settings as Cog,
  Mail, MessageSquare, X, ExternalLink, Sun, Moon, Monitor, Search,
  LogOut, ShieldAlert, Maximize2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useAdmin';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

// Themed tokens — adapt to light/dark via index.css
const GOLD = 'hsl(var(--primary))';
const RAIL_BG = 'hsl(var(--background))';
const RAIL_BORDER = 'hsl(var(--border) / 0.8)';
const ICON_INACTIVE = 'hsl(var(--muted-foreground))';
const HOVER_BG = 'hsl(var(--muted) / 0.6)';
const SURFACE_BG = 'hsl(var(--card))';

type CommsPanel = null | 'inbox' | 'notifications';

interface EmailRow {
  id: string;
  subject: string;
  body: string | null;
  direction: string;
  sent_at: string;
  contact_id: string;
  contact?: { first_name: string; last_name: string; email: string | null } | null;
}

interface MessageRow {
  id: string;
  body: string;
  direction: string;
  created_at: string;
  conversation_id: string;
  conversation?: { lead_name: string; channel: string } | null;
}

interface CrmNotificationRow {
  id: string;
  title: string;
  body: string | null;
  type: string | null;
  is_read: boolean | null;
  link_to: string | null;
  created_at: string | null;
}

function useUnreadInboxCount(enabled: boolean) {
  return useQuery({
    queryKey: ['right-rail', 'inbox-unread'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('direction', 'inbound');
      return count ?? 0;
    },
  });
}

function useUnreadNotificationsCount(enabled: boolean) {
  return useQuery({
    queryKey: ['right-rail', 'notif-unread'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('crm_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);
      return count ?? 0;
    },
  });
}

function useInboxFeed(open: boolean) {
  return useQuery({
    queryKey: ['right-rail', 'inbox-feed'],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => {
      const [emailRes, msgRes] = await Promise.all([
        supabase
          .from('crm_email_log')
          .select('id, subject, body, direction, sent_at, contact_id, contact:crm_contacts(first_name, last_name, email)')
          .order('sent_at', { ascending: false })
          .limit(20),
        supabase
          .from('messages')
          .select('id, body, direction, created_at, conversation_id, conversation:conversations(lead_name, channel)')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      return {
        emails: (emailRes.data ?? []) as EmailRow[],
        messages: (msgRes.data ?? []) as MessageRow[],
      };
    },
  });
}

function useNotificationsFeed(open: boolean) {
  return useQuery({
    queryKey: ['right-rail', 'notifications-feed'],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_notifications')
        .select('id, title, body, type, is_read, link_to, created_at')
        .order('created_at', { ascending: false })
        .limit(40);
      return (data ?? []) as CrmNotificationRow[];
    },
  });
}

function fmtTime(d?: string | null) {
  if (!d) return '';
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }); } catch { return ''; }
}

function fullName(c?: { first_name?: string | null; last_name?: string | null } | null) {
  if (!c) return 'Unknown';
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
}

function RailButton({
  icon: Icon, label, onClick, to, badge, active, accent,
}: {
  icon: typeof Sparkles;
  label: string;
  onClick?: () => void;
  to?: string;
  badge?: number;
  active?: boolean;
  accent?: 'gold' | 'red';
}) {
  const content = (
    <span
      className={cn(
        'relative flex items-center justify-center w-10 h-10 rounded-[12px] transition-all duration-200 ease-out group',
      )}
      style={{
        background: active ? 'hsl(39 67% 55% / 0.14)' : 'transparent',
        color: active ? GOLD : ICON_INACTIVE,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = HOVER_BG;
          e.currentTarget.style.color = 'hsl(220 10% 90%)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = ICON_INACTIVE;
        }
      }}
    >
      <Icon className="w-[17px] h-[17px] transition-transform duration-200 group-hover:scale-110" strokeWidth={1.7} />
      {!!badge && badge > 0 && (
        <span
          className="absolute top-1 right-1 min-w-[15px] h-[15px] px-[3px] rounded-full flex items-center justify-center text-[9px] font-bold text-white leading-none"
          style={{
            background: accent === 'red' ? 'hsl(0 75% 55%)' : GOLD,
            boxShadow: '0 0 0 2px hsl(222 25% 9%)',
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </span>
  );

  const wrapped = to ? (
    <Link to={to} aria-label={label}>{content}</Link>
  ) : (
    <button onClick={onClick} aria-label={label} className="focus:outline-none">{content}</button>
  );

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>{wrapped}</TooltipTrigger>
      <TooltipContent side="left" className="text-xs font-medium">{label}</TooltipContent>
    </Tooltip>
  );
}

const THEME_CYCLE: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];

export function RightRail() {
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { isMember: isCrmMember } = useCrmAccess();
  const [panel, setPanel] = useState<CommsPanel>(null);
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxFilter, setInboxFilter] = useState<'all' | 'email' | 'sms'>('all');
  const [signOutOpen, setSignOutOpen] = useState(false);

  const { theme, setTheme } = useTheme();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings({ silent: true });

  // Restore theme from DB
  useEffect(() => {
    if (settings?.theme && settings.theme !== theme) setTheme(settings.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.theme]);

  function cycleTheme() {
    const current = (theme as 'light' | 'dark' | 'system') ?? 'system';
    const idx = THEME_CYCLE.indexOf(current);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
    if (user) updateSettings.mutate({ theme: next });
  }
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const themeLabel = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System';

  const { data: inboxUnread = 0 } = useUnreadInboxCount(!!user);
  const { data: notifUnread = 0 } = useUnreadNotificationsCount(!!user);

  const { data: feed, isLoading: feedLoading } = useInboxFeed(panel === 'inbox');
  const { data: notifications, isLoading: notifLoading } = useNotificationsFeed(panel === 'notifications');

  // Profile initials
  const initials = useMemo(() => (user?.email?.slice(0, 2).toUpperCase() || 'U'), [user]);

  // Close panel on Esc
  useEffect(() => {
    if (!panel) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [panel]);

  if (!user) return null;

  return (
    <>
      {/* Right rail — desktop only */}
      <aside
        className="hidden lg:flex fixed top-0 right-0 h-dvh w-[52px] z-30 flex-col items-center"
        style={{
          background: RAIL_BG,
          borderLeft: `1px solid ${RAIL_BORDER}`,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        }}
      >
        {/* Account dropdown */}
        <DropdownMenu>
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button className="mb-2 focus:outline-none" aria-label="Account">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white border transition-transform hover:scale-105"
                    style={{ background: GOLD, borderColor: 'hsl(var(--border))' }}
                  >
                    {initials}
                  </div>
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs font-medium">{user.email}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            side="left"
            align="start"
            sideOffset={8}
            className="p-1.5 min-w-[220px]"
          >
            <div className="px-2.5 py-2 mb-1 border-b border-border">
              <div className="text-[11px] text-muted-foreground">Signed in as</div>
              <div className="text-[12.5px] font-medium truncate text-foreground">{user.email}</div>
            </div>
            <Link
              to="/settings"
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-foreground hover:bg-muted transition-colors"
            >
              <Cog className="w-4 h-4" strokeWidth={1.8} />
              Settings
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-warning hover:bg-warning/10 transition-colors"
              >
                <ShieldAlert className="w-4 h-4" strokeWidth={1.8} />
                Admin
              </Link>
            )}
            <button
              onClick={() => setSignOutOpen(true)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.8} />
              Sign out
            </button>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-7 h-px my-1.5" style={{ background: RAIL_BORDER }} />

        {/* Primary actions */}
        <div className="flex flex-col items-center gap-1 mt-1">
          
          <RailButton icon={Sparkles} label="AI Assistant" to="/dashboard" />
          <RailButton
            icon={Inbox}
            label="Inbox & Conversations"
            onClick={() => setPanel('inbox')}
            badge={inboxUnread}
            active={panel === 'inbox'}
            accent="red"
          />
          <RailButton
            icon={Bell}
            label="Notifications"
            onClick={() => setPanel('notifications')}
            badge={notifUnread}
            active={panel === 'notifications'}
            accent="red"
          />
          <RailButton icon={Phone} label="Calls" to={isCrmMember ? '/crm/leads' : '/dashboard'} />
        </div>

        <div className="flex-1" />

        {/* Utility footer */}
        <div className="flex flex-col items-center gap-1 mb-3">
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                onClick={cycleTheme}
                aria-label={`Theme: ${themeLabel}. Click to cycle.`}
                className="w-10 h-10 rounded-[12px] flex items-center justify-center transition-all duration-200 group hover:bg-muted/60"
                style={{ color: ICON_INACTIVE }}
              >
                <ThemeIcon className="w-[17px] h-[17px] transition-transform duration-200 group-hover:scale-110" strokeWidth={1.7} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs font-medium">Theme: {themeLabel}</TooltipContent>
          </Tooltip>
          <RailButton icon={HelpCircle} label="Help & Support" to="/settings" />
          <RailButton icon={Cog} label="Settings" to="/settings" active={false} />
        </div>
      </aside>

      {/* Sign out confirmation */}
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

      {/* Slide-over: Inbox / Communications */}
      <Sheet
        open={panel === 'inbox'}
        onOpenChange={(o) => {
          if (!o) {
            setPanel(null);
            setInboxSearch('');
            setInboxFilter('all');
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-[440px] p-0 bg-card border-l border-border [&>button]:hidden"
        >
          {/* Header */}
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <SheetTitle className="text-[17px] font-semibold text-foreground tracking-tight text-left">
                  Messages
                </SheetTitle>
                {inboxUnread > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[28px] h-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10.5px] font-semibold">
                    {inboxUnread > 99 ? '99+' : inboxUnread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Link
                  to={isCrmMember ? '/crm/email' : '/dashboard'}
                  onClick={() => setPanel(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  aria-label="Open full inbox"
                  title="Open full inbox"
                >
                  <Maximize2 className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => setPanel(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </SheetHeader>

          {/* Search bar */}
          <div className="px-5 pt-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" strokeWidth={2} />
              <input
                value={inboxSearch}
                onChange={(e) => setInboxSearch(e.target.value)}
                placeholder="Search History"
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-background/60 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
              />
            </div>
          </div>

          {/* Quick filter chips row */}
          <div className="px-5 pb-3">
            <div className="flex items-center gap-3 overflow-x-auto pb-1 -mx-1 px-1">
              <FilterChip
                icon={Sparkles}
                label="All"
                active={inboxFilter === 'all'}
                onClick={() => setInboxFilter('all')}
                tone="primary"
              />
              <FilterChip
                icon={Mail}
                label="Email"
                active={inboxFilter === 'email'}
                onClick={() => setInboxFilter('email')}
                tone="blue"
                badge={feed?.emails.filter(e => e.direction === 'inbound').length}
              />
              <FilterChip
                icon={MessageSquare}
                label="SMS"
                active={inboxFilter === 'sms'}
                onClick={() => setInboxFilter('sms')}
                tone="purple"
                badge={feed?.messages.filter(m => m.direction === 'inbound').length}
              />
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* List */}
          <ScrollArea className="h-[calc(100dvh-260px)]">
            <div className="py-1">
              {feedLoading ? (
                <div className="text-center text-xs text-muted-foreground py-10">Loading…</div>
              ) : (
                <CommunicationList feed={feed} kind={inboxFilter} search={inboxSearch} />
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Slide-over: Notifications */}
      <Sheet open={panel === 'notifications'} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[400px] p-0 bg-card border-l border-border [&>button]:hidden"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-[15px] font-semibold text-foreground tracking-tight text-left">
                  Notifications
                </SheetTitle>
                <p className="text-[11.5px] text-muted-foreground mt-0.5 text-left">
                  Alerts, follow-ups, and system updates
                </p>
              </div>
              <button
                onClick={() => setPanel(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </SheetHeader>

          <ScrollArea className="h-[calc(100dvh-92px)]">
            <div className="px-3 py-3 space-y-1">
              {notifLoading && (
                <div className="text-center text-xs text-muted-foreground py-8">Loading…</div>
              )}
              {!notifLoading && (notifications?.length ?? 0) === 0 && (
                <div className="text-center text-xs text-muted-foreground py-12">
                  No notifications yet
                </div>
              )}
              {notifications?.map(n => (
                <Link
                  key={n.id}
                  to={n.link_to ?? '#'}
                  onClick={() => setPanel(null)}
                  className={cn(
                    "block px-3 py-2.5 rounded-lg transition-colors group border",
                    n.is_read
                      ? "border-transparent hover:bg-muted/50"
                      : "border-primary/20 bg-primary/5 hover:bg-primary/10"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && (
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-primary" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-foreground leading-tight truncate">
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                          {n.body}
                        </div>
                      )}
                      <div className="text-[10.5px] text-muted-foreground/60 mt-1">
                        {fmtTime(n.created_at)}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Avatar gradient picker — deterministic per name */
const AVATAR_PALETTE = [
  ['hsl(210 80% 60%)', 'hsl(210 80% 50%)'],
  ['hsl(28 90% 60%)',  'hsl(28 90% 50%)'],
  ['hsl(160 55% 50%)', 'hsl(160 55% 40%)'],
  ['hsl(280 60% 65%)', 'hsl(280 60% 55%)'],
  ['hsl(340 75% 62%)', 'hsl(340 75% 52%)'],
  ['hsl(190 75% 55%)', 'hsl(190 75% 45%)'],
];
function avatarGradient(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const [a, b] = AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  return ((parts[0][0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function FilterChip({
  icon: Icon,
  label,
  active,
  onClick,
  tone,
  badge,
}: {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
  tone: 'primary' | 'blue' | 'purple';
  badge?: number;
}) {
  const toneBg =
    tone === 'primary' ? 'bg-primary/15 text-primary'
    : tone === 'blue'  ? 'bg-[hsl(210_80%_60%/0.15)] text-[hsl(210_80%_55%)]'
                       : 'bg-[hsl(280_60%_65%/0.15)] text-[hsl(280_60%_60%)]';
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 shrink-0 group"
    >
      <div className="relative">
        <div
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center transition-all',
            toneBg,
            active ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'group-hover:scale-105'
          )}
        >
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
        {badge && badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[9.5px] font-semibold flex items-center justify-center border-2 border-card">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className={cn(
        'text-[10.5px] font-medium tracking-tight',
        active ? 'text-foreground' : 'text-muted-foreground'
      )}>
        {label}
      </span>
    </button>
  );
}

function CommunicationList({
  feed,
  kind,
  search = '',
}: {
  feed: { emails: EmailRow[]; messages: MessageRow[] } | undefined;
  kind: 'all' | 'email' | 'sms';
  search?: string;
}) {
  if (!feed) return null;

  type Item = {
    id: string;
    type: 'email' | 'sms';
    name: string;
    preview: string;
    time: string;
    unread?: boolean;
    href: string;
  };

  const items: Item[] = [];

  if (kind === 'all' || kind === 'email') {
    feed.emails.forEach(e => items.push({
      id: `e-${e.id}`,
      type: 'email',
      name: fullName(e.contact) || e.contact?.email || 'Unknown',
      preview: e.subject || (e.body ?? '').slice(0, 80) || '(no subject)',
      time: e.sent_at,
      unread: e.direction === 'inbound',
      href: `/crm/leads/${e.contact_id}`,
    }));
  }
  if (kind === 'all' || kind === 'sms') {
    feed.messages.forEach(m => items.push({
      id: `m-${m.id}`,
      type: 'sms',
      name: m.conversation?.lead_name ?? 'Unknown',
      preview: m.body,
      time: m.created_at,
      unread: m.direction === 'inbound',
      href: `/crm/leads`,
    }));
  }

  // sort by time desc
  items.sort((a, b) => (new Date(b.time).getTime() || 0) - (new Date(a.time).getTime() || 0));

  // search filter
  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter(i => i.name.toLowerCase().includes(q) || i.preview.toLowerCase().includes(q))
    : items;

  if (filtered.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground py-12">
        {q ? `No conversations match "${search}"` : 'No conversations yet'}
      </div>
    );
  }

  const TypeIcon = (t: Item['type']) => t === 'email' ? Mail : MessageSquare;
  const typeColor = (t: Item['type']) => t === 'email' ? 'hsl(28 90% 55%)' : 'hsl(280 60% 60%)';

  return (
    <ul>
      {filtered.slice(0, 50).map(item => {
        const Icon = TypeIcon(item.type);
        const initials = initialsOf(item.name);
        return (
          <li key={item.id} className="relative">
            {item.unread && (
              <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-destructive" />
            )}
            <Link
              to={item.href}
              className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/50 border-b border-border/40"
            >
              {/* Avatar with type badge */}
              <div className="relative shrink-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[12px] font-semibold tracking-tight"
                  style={{ background: avatarGradient(item.name) }}
                >
                  {initials}
                </div>
                <div
                  className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-card"
                  style={{ background: typeColor(item.type) }}
                >
                  <Icon className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className={cn(
                    'text-[13px] truncate tracking-tight',
                    item.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'
                  )}>
                    {item.name}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground/70 shrink-0 tabular-nums">
                    {fmtTime(item.time)}
                  </div>
                </div>
                <div className="text-[12px] text-muted-foreground line-clamp-1 mt-0.5 leading-snug">
                  {item.preview}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
