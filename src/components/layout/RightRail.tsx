import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Sparkles, Phone, Inbox, Bell, HelpCircle, Settings as Cog,
  Mail, MessageSquare, X, ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useAdmin';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const GOLD = 'hsl(39 67% 55%)';
const RAIL_BG = 'hsl(222 25% 9%)';
const RAIL_BORDER = 'hsl(222 20% 14% / 0.8)';
const ICON_INACTIVE = 'hsl(220 8% 60%)';
const HOVER_BG = 'hsl(222 20% 14%)';

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

export function RightRail() {
  const { user } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { isMember: isCrmMember } = useCrmAccess();
  const [panel, setPanel] = useState<CommsPanel>(null);

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
        className="hidden lg:flex fixed top-0 right-0 h-screen w-[52px] z-30 flex-col items-center"
        style={{
          background: RAIL_BG,
          borderLeft: `1px solid ${RAIL_BORDER}`,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 60px)',
        }}
      >
        {/* Profile avatar */}
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <Link to="/settings" className="mb-2" aria-label="Account">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white border transition-transform hover:scale-105"
                style={{
                  background: GOLD,
                  borderColor: 'hsl(222 20% 18%)',
                }}
              >
                {initials}
              </div>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs font-medium">{user.email}</TooltipContent>
        </Tooltip>

        <div className="w-7 h-px my-1.5" style={{ background: 'hsl(222 20% 16%)' }} />

        <div className="flex flex-col items-center gap-1 mt-1">
          <RailButton icon={Sparkles} label="AI Assistant" to="/dashboard" />
          <RailButton icon={Phone} label="Calls" to={isCrmMember ? '/crm/leads' : '/dashboard'} />
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
        </div>

        <div className="flex-1" />

        <div className="flex flex-col items-center gap-1 mb-3">
          <RailButton icon={HelpCircle} label="Help & Support" to="/settings" />
          <RailButton icon={Cog} label="Settings" to="/settings" />
          {isAdmin && <RailButton icon={Cog} label="Admin" to="/admin" active={false} />}
        </div>
      </aside>

      {/* Slide-over: Inbox / Communications */}
      <Sheet open={panel === 'inbox'} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[440px] p-0 border-0"
          style={{ background: 'hsl(222 25% 10%)', borderLeft: `1px solid ${RAIL_BORDER}` }}
        >
          <SheetHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: RAIL_BORDER }}>
            <div className="flex items-center justify-between">
              <SheetTitle className="text-[15px] font-semibold text-white tracking-tight">
                Communications
              </SheetTitle>
              <button
                onClick={() => setPanel(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/5"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              Latest emails, WhatsApp & SMS conversations
            </p>
          </SheetHeader>

          <Tabs defaultValue="all" className="flex flex-col h-[calc(100vh-92px)]">
            <TabsList className="mx-5 mt-3 grid grid-cols-4 h-9 bg-[hsl(222_20%_14%)]">
              <TabsTrigger value="all" className="text-[11.5px]">All</TabsTrigger>
              <TabsTrigger value="email" className="text-[11.5px]">Email</TabsTrigger>
              <TabsTrigger value="wa" className="text-[11.5px]">WhatsApp</TabsTrigger>
              <TabsTrigger value="sms" className="text-[11.5px]">SMS</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 mt-3">
              <div className="px-3 pb-6">
                {feedLoading && (
                  <div className="text-center text-xs text-muted-foreground py-8">Loading…</div>
                )}

                <TabsContent value="all" className="m-0 space-y-1">
                  <CommunicationList feed={feed} kind="all" />
                </TabsContent>
                <TabsContent value="email" className="m-0 space-y-1">
                  <CommunicationList feed={feed} kind="email" />
                </TabsContent>
                <TabsContent value="wa" className="m-0 space-y-1">
                  <CommunicationList feed={feed} kind="wa" />
                </TabsContent>
                <TabsContent value="sms" className="m-0 space-y-1">
                  <CommunicationList feed={feed} kind="sms" />
                </TabsContent>
              </div>
            </ScrollArea>

            <div className="border-t px-5 py-3 flex items-center justify-between" style={{ borderColor: RAIL_BORDER }}>
              <Link
                to={isCrmMember ? '/crm/email' : '/dashboard'}
                onClick={() => setPanel(null)}
                className="text-[12px] font-medium hover:underline flex items-center gap-1.5"
                style={{ color: GOLD }}
              >
                Open full inbox <ExternalLink className="w-3 h-3" />
              </Link>
              <span className="text-[11px] text-muted-foreground">
                {inboxUnread > 0 ? `${inboxUnread} unread` : 'All caught up'}
              </span>
            </div>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Slide-over: Notifications */}
      <Sheet open={panel === 'notifications'} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[400px] p-0 border-0"
          style={{ background: 'hsl(222 25% 10%)', borderLeft: `1px solid ${RAIL_BORDER}` }}
        >
          <SheetHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: RAIL_BORDER }}>
            <div className="flex items-center justify-between">
              <SheetTitle className="text-[15px] font-semibold text-white tracking-tight">
                Notifications
              </SheetTitle>
              <button
                onClick={() => setPanel(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/5"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              Alerts, follow-ups, and system updates
            </p>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-92px)]">
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
                  className="block px-3 py-2.5 rounded-lg transition-colors hover:bg-white/5 group"
                  style={{
                    background: n.is_read ? 'transparent' : 'hsl(39 67% 55% / 0.06)',
                    border: `1px solid ${n.is_read ? 'transparent' : 'hsl(39 67% 55% / 0.18)'}`,
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && (
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: GOLD }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-white leading-tight truncate">
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

function CommunicationList({
  feed,
  kind,
}: {
  feed: { emails: EmailRow[]; whatsapp: WaConvRow[]; messages: MessageRow[] } | undefined;
  kind: 'all' | 'email' | 'wa' | 'sms';
}) {
  if (!feed) return null;

  type Item = {
    id: string;
    type: 'email' | 'wa' | 'sms';
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
      href: `/crm/leads/${e.contact_id}`,
    }));
  }
  if (kind === 'all' || kind === 'wa') {
    feed.whatsapp.forEach(w => items.push({
      id: `w-${w.id}`,
      type: 'wa',
      name: fullName(w.contact) || w.phone_number,
      preview: w.last_message_preview ?? '(no messages yet)',
      time: w.last_message_at ?? '',
      unread: (w.unread_count ?? 0) > 0,
      href: `/crm/leads`,
    }));
  }
  if (kind === 'all' || kind === 'sms') {
    feed.messages.forEach(m => items.push({
      id: `m-${m.id}`,
      type: 'sms',
      name: m.conversation?.lead_name ?? 'Unknown',
      preview: m.body,
      time: m.created_at,
      href: `/crm/leads`,
    }));
  }

  // sort by time desc
  items.sort((a, b) => (new Date(b.time).getTime() || 0) - (new Date(a.time).getTime() || 0));

  if (items.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground py-12">
        No conversations yet
      </div>
    );
  }

  const iconFor = (t: Item['type']) => t === 'email' ? Mail : t === 'wa' ? MessageCircle : MessageSquare;
  const colorFor = (t: Item['type']) => t === 'email' ? 'hsl(210 80% 60%)' : t === 'wa' ? 'hsl(140 60% 50%)' : 'hsl(280 60% 65%)';

  return items.slice(0, 30).map(item => {
    const Icon = iconFor(item.type);
    return (
      <Link
        key={item.id}
        to={item.href}
        className="flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-white/5"
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'hsl(222 20% 14%)' }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: colorFor(item.type) }} strokeWidth={1.9} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12.5px] font-semibold text-white truncate">
              {item.name}
            </div>
            <div className="text-[10.5px] text-muted-foreground/70 shrink-0">
              {fmtTime(item.time)}
            </div>
          </div>
          <div className="text-[11.5px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
            {item.preview}
          </div>
        </div>
        {item.unread && (
          <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: GOLD }} />
        )}
      </Link>
    );
  });
}
