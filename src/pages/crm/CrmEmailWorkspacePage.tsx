// CRM Email — single unified hub.
// Top-level: Inbox · Outbound · Reports (3 tabs, editorial all-text).
//   • Outbound  → Templates / Campaigns / Flows (inner segmented control)
//   • Reports   → Stats / Health (inner segmented control)
//
// "New Email" button (top-right) opens NewEmailLauncherDialog (lead picker)
// which then mounts the SAME `<ComposeEmailDialog />` used by every other
// surface in the CRM. One composer everywhere — never re-add a second design.

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PenSquare } from 'lucide-react';
import InboxView from '@/components/crm/email/InboxView';
import { NewEmailLauncherDialog } from '@/components/crm/email/NewEmailLauncherDialog';
import { EmailLiveStatusBar } from '@/components/crm/shared/LiveStatusBar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Lazy hub sections — only load when their parent tab is opened.
const CrmMarketingHubPage = lazy(() => import('./CrmMarketingHubPage'));
const CrmEmailCampaignsPage = lazy(() => import('./CrmEmailCampaignsPage'));
const CrmEmailWorkflowsPage = lazy(() => import('./CrmEmailWorkflowsPage'));
const CrmEmailAnalyticsPage = lazy(() => import('./CrmEmailAnalyticsPage'));
const CrmEmailHealthPage = lazy(() => import('./CrmEmailHealthPage'));

type Primary = 'inbox' | 'outbound' | 'reports';
type OutboundSub = 'templates' | 'campaigns' | 'workflows';
type ReportsSub = 'analytics' | 'health';

const PRIMARY: { value: Primary; label: string }[] = [
  { value: 'inbox',    label: 'Inbox' },
  { value: 'outbound', label: 'Outbound' },
  { value: 'reports',  label: 'Reports' },
];

const OUTBOUND: { value: OutboundSub; label: string }[] = [
  { value: 'templates',  label: 'Templates' },
  { value: 'campaigns',  label: 'Campaigns' },
  { value: 'workflows',  label: 'Flows' },
];

const REPORTS: { value: ReportsSub; label: string }[] = [
  { value: 'analytics',  label: 'Stats' },
  { value: 'health',     label: 'Health' },
];

/** Map legacy ?tab=… values to the new (primary, sub) tuple. */
function legacyToTuple(t: string | null): { primary: Primary; outbound?: OutboundSub; reports?: ReportsSub } | null {
  if (!t) return null;
  if (t === 'inbox') return { primary: 'inbox' };
  if (t === 'templates' || t === 'outbound') return { primary: 'outbound', outbound: 'templates' };
  if (t === 'campaigns')  return { primary: 'outbound', outbound: 'campaigns' };
  if (t === 'workflows' || t === 'flows') return { primary: 'outbound', outbound: 'workflows' };
  if (t === 'analytics' || t === 'stats' || t === 'reports') return { primary: 'reports', reports: 'analytics' };
  if (t === 'health') return { primary: 'reports', reports: 'health' };
  return null;
}

export default function CrmEmailWorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initial = useMemo(() => legacyToTuple(searchParams.get('tab')), []);
  const [primary, setPrimary] = useState<Primary>(initial?.primary ?? 'inbox');
  const [outboundSub, setOutboundSub] = useState<OutboundSub>(initial?.outbound ?? 'templates');
  const [reportsSub, setReportsSub] = useState<ReportsSub>(initial?.reports ?? 'analytics');
  const [composerOpen, setComposerOpen] = useState(false);

  // Legacy ?tab=compose → open dialog and land on Inbox.
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'compose') {
      setComposerOpen(true);
      const sp = new URLSearchParams(searchParams);
      sp.delete('tab');
      setSearchParams(sp, { replace: true });
      setPrimary('inbox');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchPrimary = (next: Primary) => {
    setPrimary(next);
    const sp = new URLSearchParams(searchParams);
    if (next === 'inbox') sp.delete('tab');
    else if (next === 'outbound') sp.set('tab', outboundSub);
    else sp.set('tab', reportsSub);
    setSearchParams(sp, { replace: true });
  };

  const switchOutbound = (next: OutboundSub) => {
    setOutboundSub(next);
    const sp = new URLSearchParams(searchParams);
    sp.set('tab', next);
    setSearchParams(sp, { replace: true });
  };

  const switchReports = (next: ReportsSub) => {
    setReportsSub(next);
    const sp = new URLSearchParams(searchParams);
    sp.set('tab', next);
    setSearchParams(sp, { replace: true });
  };

  return (
    <div className="flex flex-col h-full min-h-0 lg:h-[calc(100dvh-140px)] lg:min-h-[600px]">
      {/* Status bar is desktop-only — on mobile the chat header already shows
          connection state and we don't want a fat banner stealing the fold. */}
      <div className="hidden md:block mb-2"><EmailLiveStatusBar /></div>

      {/* Editorial header — text-only primary tabs + primary "New Email" CTA */}
      <div className="mb-2.5 flex items-center gap-3">
        <nav className="flex-1 min-w-0 -mx-1 overflow-x-auto no-scrollbar">
          <div className="inline-flex items-center gap-5 px-1">
            {PRIMARY.map(t => (
              <PrimaryTab
                key={t.value}
                active={primary === t.value}
                onClick={() => switchPrimary(t.value)}
                label={t.label}
              />
            ))}
          </div>
        </nav>
        <Button
          onClick={() => setComposerOpen(true)}
          className="shrink-0 h-9 gap-1.5 text-[12.5px] font-semibold"
        >
          <PenSquare className="h-3.5 w-3.5" />
          New Email
        </Button>
      </div>

      {/* Sub-nav — only renders when there is one. Editorial pill segmented. */}
      {primary === 'outbound' && (
        <SubSegmented
          items={OUTBOUND}
          value={outboundSub}
          onChange={(v) => switchOutbound(v as OutboundSub)}
        />
      )}
      {primary === 'reports' && (
        <SubSegmented
          items={REPORTS}
          value={reportsSub}
          onChange={(v) => switchReports(v as ReportsSub)}
        />
      )}

      <div className="flex-1 min-h-0">
        {primary === 'inbox' && <InboxView />}

        {primary === 'outbound' && (
          <div className="h-full overflow-auto rounded-2xl border border-border/70 bg-card shadow-sm">
            <Suspense fallback={<HubSkeleton />}>
              {outboundSub === 'templates' && <CrmMarketingHubPage />}
              {outboundSub === 'campaigns' && <CrmEmailCampaignsPage />}
              {outboundSub === 'workflows' && <CrmEmailWorkflowsPage />}
            </Suspense>
          </div>
        )}

        {primary === 'reports' && (
          <div className="h-full overflow-auto rounded-2xl border border-border/70 bg-card shadow-sm">
            <Suspense fallback={<HubSkeleton />}>
              {reportsSub === 'analytics' && <CrmEmailAnalyticsPage />}
              {reportsSub === 'health'    && <CrmEmailHealthPage />}
            </Suspense>
          </div>
        )}
      </div>

      {/* Lead picker → hands off to the canonical ComposeEmailDialog. */}
      <NewEmailLauncherDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
      />
    </div>
  );
}

/* ─────────────────── Tab primitives ─────────────────── */

function PrimaryTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center h-9 text-[13.5px] font-semibold tracking-tight whitespace-nowrap transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {active && (
        <span className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full bg-primary" />
      )}
    </button>
  );
}

function SubSegmented<T extends string>({
  items, value, onChange,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-3">
      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-border/70 bg-card shadow-sm">
        {items.map(it => {
          const active = it.value === value;
          return (
            <button
              key={it.value}
              onClick={() => onChange(it.value)}
              className={cn(
                'inline-flex items-center h-7 px-3 rounded-md text-[11.5px] font-semibold whitespace-nowrap transition-all',
                active
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HubSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
