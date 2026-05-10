import { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import logoMark from '@/assets/logo-mark.png';

/**
 * Mobile-only sticky app header. The desktop TopNav is `hidden lg:block`,
 * which left mobile screens with no header at all — making content collide
 * with the iOS notch / status bar in PWA mode. This thin header restores a
 * native, app-like top bar across both Workspace and CRM on phones/tablets.
 */
const ROUTE_TITLES: { match: string; title: string }[] = [
  { match: '/dashboard', title: 'Home' },
  { match: '/pipeline', title: 'Pipeline' },
  { match: '/deals', title: 'Deals' },
  { match: '/inventory', title: 'Clients' },
  { match: '/payouts', title: 'Payouts' },
  { match: '/network', title: 'Network' },
  { match: '/expenses', title: 'Expenses' },
  { match: '/forecast', title: 'Forecast' },
  { match: '/analytics', title: 'Analytics' },
  { match: '/settings', title: 'Settings' },
  { match: '/admin', title: 'Admin' },
  { match: '/crm/leads', title: 'Leads' },
  { match: '/crm/pipeline', title: 'Pipeline' },
  { match: '/crm/contacts', title: 'Contacts' },
  { match: '/crm/calendar', title: 'Calendar' },
  { match: '/crm/email', title: 'Email' },
  { match: '/crm/templates', title: 'Templates' },
  { match: '/crm/automations', title: 'Automations' },
  { match: '/crm/reports', title: 'Reports' },
  { match: '/crm/integrations', title: 'Integrations' },
  { match: '/crm/settings', title: 'CRM Settings' },
  { match: '/crm/chats', title: 'Chats' },
  { match: '/crm', title: 'CRM' },
];

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  type: string | null;
  is_read: boolean;
  link_to: string | null;
  created_at: string;
}

function fmtTime(d?: string | null) {
  if (!d) return '';
  try { return formatDistanceToNow(new Date(d), { addSuffix: true }); } catch { return ''; }
}

export function MobileAppHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const title =
    [...ROUTE_TITLES]
      .sort((a, b) => b.match.length - a.match.length)
      .find((r) => pathname.startsWith(r.match))?.title ?? 'Dealzflow';

  const isCrm = pathname.startsWith('/crm');
  const isChatThread = /^\/crm\/chats\/[^/]+/.test(pathname) && pathname !== '/crm/chats/new';

  if (isChatThread) return null;

  // Unread count badge (always-on, light query)
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['mobile-header-unread', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('crm_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);
      return count ?? 0;
    },
  });

  // Feed loaded only when the sheet opens
  const { data: notifications, isLoading } = useQuery({
    queryKey: ['mobile-header-notifications', user?.id],
    enabled: open && !!user,
    staleTime: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_notifications')
        .select('id, title, body, type, is_read, link_to, created_at')
        .order('created_at', { ascending: false })
        .limit(40);
      return (data ?? []) as NotificationRow[];
    },
  });

  const handleOpenItem = async (n: NotificationRow) => {
    triggerHaptic('selection');
    if (!n.is_read) {
      await supabase.from('crm_notifications').update({ is_read: true }).eq('id', n.id);
      qc.invalidateQueries({ queryKey: ['mobile-header-unread'] });
      qc.invalidateQueries({ queryKey: ['mobile-header-notifications'] });
    }
    setOpen(false);
    if (n.link_to) navigate(n.link_to);
  };

  const handleMarkAllRead = async () => {
    triggerHaptic('selection');
    await supabase.from('crm_notifications').update({ is_read: true }).eq('is_read', false);
    qc.invalidateQueries({ queryKey: ['mobile-header-unread'] });
    qc.invalidateQueries({ queryKey: ['mobile-header-notifications'] });
  };

  return (
    <>
      <header
        className="lg:hidden sticky top-0 z-30 shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div
          className="absolute inset-0 backdrop-blur-2xl backdrop-saturate-[180%]"
          style={{ background: 'hsl(var(--background) / 0.85)' }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, hsl(var(--border) / 0.7) 10%, hsl(var(--border) / 0.7) 90%, transparent)',
          }}
        />
        <div className="relative flex items-center justify-between h-11 px-4">
          <Link to="/dashboard" className="flex items-center gap-2 min-w-0 active:opacity-70 transition-opacity">
            <img src={logoMark} alt="" className="h-5 w-5 shrink-0" />
            <div className="flex items-baseline gap-1.5 min-w-0">
              {isCrm && (
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.12em] shrink-0"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  CRM
                </span>
              )}
              <span className="text-[14px] font-semibold tracking-[-0.01em] text-foreground truncate">
                {title}
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => { triggerHaptic('selection'); setOpen(true); }}
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            className="relative h-9 w-9 -mr-1.5 flex items-center justify-center rounded-full text-muted-foreground active:bg-muted/60 transition-colors"
          >
            <Bell className="h-[17px] w-[17px]" strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full ring-1 ring-background" />
            )}
          </button>
        </div>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[420px] p-0 bg-card border-l border-border [&>button]:hidden flex flex-col"
        >
          <SheetHeader
            className="px-4 pb-3 border-b border-border shrink-0"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <SheetTitle className="text-[16px] font-semibold text-foreground tracking-tight text-left">
                  Notifications
                </SheetTitle>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[11.5px] font-medium px-2.5 py-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-3 py-3 space-y-1">
              {isLoading && (
                <div className="text-center text-xs text-muted-foreground py-8">Loading…</div>
              )}
              {!isLoading && (notifications?.length ?? 0) === 0 && (
                <div className="text-center text-xs text-muted-foreground py-16">
                  No notifications yet
                </div>
              )}
              {notifications?.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleOpenItem(n)}
                  className={cn(
                    "w-full text-left block px-3 py-3 rounded-xl transition-colors border active:scale-[0.99]",
                    n.is_read
                      ? "border-transparent hover:bg-muted/50"
                      : "border-primary/20 bg-primary/5 hover:bg-primary/10"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {!n.is_read && (
                      <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0 bg-primary" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-foreground leading-tight">
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="text-[12px] text-muted-foreground mt-1 leading-snug line-clamp-2">
                          {n.body}
                        </div>
                      )}
                      <div className="text-[10.5px] text-muted-foreground/70 mt-1.5">
                        {fmtTime(n.created_at)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
