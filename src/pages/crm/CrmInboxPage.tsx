/**
 * /crm/inbox — Unified messaging hub (Tier 1: Inbox Merge).
 *
 * Single 3-pane inbox (thread list left, thread detail center, lead context
 * rail right) hosting all channels: Email, Text, Calls. Filter chips at top
 * narrow the visible threads. Replaces /crm/email and /crm/chats.
 *
 * Architecture: chips switch which underlying workspace mounts. The chats
 * shell (CrmChatsShell) already implements list + thread + rail and matches
 * the density we want, so we reuse it as the default surface. Email chip
 * mounts the existing Email workspace; Calls is a placeholder until the
 * call log page lands. Needs-reply / Hot-leads pass filter intent via URL.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Search, Phone, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { openComposer } from '@/stores/useComposer';

const CrmEmailWorkspacePage = lazy(() => import('./CrmEmailWorkspacePage'));
const CrmChatsShell = lazy(() => import('./CrmChatsShell'));

type Channel = 'all' | 'email' | 'text' | 'calls' | 'needs-reply' | 'hot';

const STORAGE_KEY = 'crm:inbox:active-channel';

const CHIPS: { value: Channel; label: string }[] = [
  { value: 'all',          label: 'All' },
  { value: 'email',        label: 'Email' },
  { value: 'text',         label: 'Text' },
  { value: 'calls',        label: 'Calls' },
  { value: 'needs-reply',  label: 'Needs reply' },
  { value: 'hot',          label: 'Hot leads' },
];

/** Migrate legacy stored values from the old tabbed inbox. */
function normalizeChannel(v: string | null | undefined): Channel | null {
  if (!v) return null;
  if (v === 'sms' || v === 'whatsapp' || v === 'chats') return 'text';
  if (['all', 'email', 'text', 'calls', 'needs-reply', 'hot'].includes(v)) return v as Channel;
  return null;
}

export default function CrmInboxPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { conversationId } = useParams<{ conversationId?: string }>();

  const initial: Channel = (() => {
    const fromQuery = normalizeChannel(new URLSearchParams(location.search).get('channel'));
    if (fromQuery) return fromQuery;
    try {
      const stored = normalizeChannel(localStorage.getItem(STORAGE_KEY));
      if (stored) return stored;
    } catch { /* ignore */ }
    return 'all';
  })();

  const [active, setActive] = useState<Channel>(initial);
  const [query, setQuery] = useState<string>(() => new URLSearchParams(location.search).get('q') ?? '');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, active); } catch { /* ignore */ }
  }, [active]);

  // "/" keyboard shortcut → focus search (ignore when typing in an input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onSelect = useCallback((next: Channel) => {
    setActive(next);
    const params = new URLSearchParams(location.search);
    params.set('channel', next);
    if (query) params.set('q', query); else params.delete('q');
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
  }, [location.search, location.pathname, navigate, query]);

  // Mirror search to URL (?q=) so deep links survive refresh.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const current = params.get('q') ?? '';
    if (current === query) return;
    if (query) params.set('q', query); else params.delete('q');
    const id = window.setTimeout(() => {
      navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
    }, 200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const showEmail = active === 'email';
  const showCalls = active === 'calls';
  // 'all' | 'text' | 'needs-reply' | 'hot' all render the chats 3-pane.
  // Underlying shell will honor URL filter params it understands; others are
  // benign pass-through until the unified thread loader (next phase) lands.
  const showChats = !showEmail && !showCalls;

  return (
    <div className="flex flex-1 min-h-0 h-full flex-col">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-sm">
        {/* Search row */}
        <div className="hidden md:flex px-4 lg:px-6 pt-3 pb-2 items-center gap-3">
          <div className="ml-auto relative w-full max-w-[360px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.8} />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages, leads, phones…"
              className={cn(
                'w-full h-8 pl-8 pr-10 rounded-md',
                'bg-muted/40 border border-border/60',
                'text-[13px] placeholder:text-muted-foreground/70',
                'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background',
              )}
              aria-label="Search inbox"
            />
            <kbd className="hidden lg:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-background border border-border/60 rounded">
              /
            </kbd>
          </div>
        </div>

        {/* Chips */}
        <nav role="tablist" aria-label="Inbox filter" className="px-4 lg:px-6 pb-2 pt-1 md:pt-0 flex gap-1.5 overflow-x-auto">
          {CHIPS.map((chip) => {
            const isActive = chip.value === active;
            return (
              <button
                key={chip.value}
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(chip.value)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[12px] font-medium tracking-tight whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Active surface */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={<InboxFallback />}>
          {showEmail && <CrmEmailWorkspacePage />}
          {showChats && <CrmChatsShell key={conversationId ?? 'list'} />}
          {showCalls && <CallsEmptyState />}
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

function CallsEmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center mb-4">
        <Phone className="w-7 h-7 text-primary" strokeWidth={1.6} />
      </div>
      <h2 className="text-[16px] font-semibold tracking-tight text-foreground mb-1.5">Call log</h2>
      <p className="text-[13px] text-muted-foreground max-w-[360px] leading-relaxed">
        Recent calls live on each lead's detail page for now. A unified call log lands in the next tier.
      </p>
    </div>
  );
}
