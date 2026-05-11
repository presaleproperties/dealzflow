/**
 * /crm/inbox — Phase 3 unified messaging shell.
 *
 * One Apple-Mail-style hub combining the three communication surfaces the
 * team already uses: Email (Gmail-bridge), SMS (Twilio), and WhatsApp/Chats.
 * Each tab mounts the existing page component unchanged so behavior, RLS,
 * realtime, and quiet-hours rules are preserved bit-for-bit.
 *
 * Tabs are remembered in localStorage so the user lands back where they were.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { Inbox, Mail, MessageSquare } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const CrmEmailWorkspacePage = lazy(() => import('./CrmEmailWorkspacePage'));
const CrmChatsShell = lazy(() => import('./CrmChatsShell'));

type Channel = 'email' | 'chats';

const STORAGE_KEY = 'crm:inbox:active-channel';

const TABS: { value: Channel; label: string; icon: typeof Mail; subtitle: string }[] = [
  { value: 'email', label: 'Email', icon: Mail,          subtitle: 'Branded sends · synced replies' },
  { value: 'chats', label: 'Chats', icon: MessageSquare, subtitle: 'SMS + WhatsApp threads' },
];

/** Migrate legacy stored values ('sms', 'whatsapp') → 'chats'. */
function normalizeChannel(v: string | null | undefined): Channel | null {
  if (!v) return null;
  if (v === 'sms' || v === 'whatsapp' || v === 'chats') return 'chats';
  if (v === 'email') return 'email';
  return null;
}

export default function CrmInboxPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const initial: Channel = (() => {
    const fromQuery = normalizeChannel(new URLSearchParams(location.search).get('channel'));
    if (fromQuery) return fromQuery;
    try {
      const stored = normalizeChannel(localStorage.getItem(STORAGE_KEY));
      if (stored) {
        // Persist migrated value so we only do this once.
        localStorage.setItem(STORAGE_KEY, stored);
        return stored;
      }
    } catch { /* ignore */ }
    return 'email';
  })();

  const [active, setActive] = useState<Channel>(initial);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, active); } catch { /* ignore */ }
  }, [active]);

  const onSelect = (next: Channel) => {
    setActive(next);
    const params = new URLSearchParams(location.search);
    params.set('channel', next);
    navigate({ pathname: '/crm/inbox', search: `?${params.toString()}` }, { replace: true });
  };

  return (
    <div className="flex flex-1 min-h-0 h-full flex-col">
      {/* Channel switcher — slim, native-feeling */}
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-sm">
        {/* Title row — hidden on mobile (the global app header already shows page
            context; channel tabs below are the actionable bit). */}
        <div className="hidden md:flex px-4 lg:px-6 pt-3 pb-0 items-center gap-2">
          <Inbox className="w-4 h-4 text-muted-foreground" strokeWidth={1.6} />
          <h1 className="text-[15px] font-semibold tracking-tight">Inbox</h1>
        </div>
        <nav role="tablist" aria-label="Communication channel" className="px-4 lg:px-6 mt-2 flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = tab.value === active;
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(tab.value)}
                className={cn(
                  'group relative px-3 py-2 text-[13px] font-medium tracking-tight whitespace-nowrap',
                  'flex items-center gap-1.5 transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
                {tab.label}
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-2 right-2 -bottom-px h-[2px] rounded-full transition-opacity',
                    isActive ? 'bg-primary opacity-100' : 'opacity-0',
                  )}
                />
              </button>
            );
          })}
        </nav>
      </header>

      {/* Active channel surface */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={<InboxFallback />}>
          {active === 'email' && <CrmEmailWorkspacePage />}
          {active === 'chats' && <CrmChatsShell />}
        </Suspense>
      </div>
    </div>
  );
}

function InboxFallback() {
  return (
    <div className="p-6 space-y-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
