// CRM Email — single unified hub.
// Top-level segmented control: Inbox · Templates · Campaigns · Flows · Stats · Health.
// "New Email" button (top-right) opens NewEmailLauncherDialog (lead picker)
// which then mounts the SAME `<ComposeEmailDialog />` used by every other
// surface in the CRM (lead detail blue CTA, leads table, contacts page,
// chat thread, quick actions). One composer everywhere — never re-add a
// second design.

import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Mail, Workflow, Megaphone, BarChart3, Activity, Inbox, PenSquare, Sparkles,
} from 'lucide-react';
import InboxView from '@/components/crm/email/InboxView';
import { NewEmailLauncherDialog } from '@/components/crm/email/NewEmailLauncherDialog';
import { EmailLiveStatusBar } from '@/components/crm/shared/LiveStatusBar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Lazy hub sections — only load when their tab is opened.
const CrmMarketingHubPage = lazy(() => import('./CrmMarketingHubPage'));
const CrmEmailCampaignsPage = lazy(() => import('./CrmEmailCampaignsPage'));
const CrmEmailWorkflowsPage = lazy(() => import('./CrmEmailWorkflowsPage'));
const CrmEmailAnalyticsPage = lazy(() => import('./CrmEmailAnalyticsPage'));
const CrmEmailHealthPage = lazy(() => import('./CrmEmailHealthPage'));

type Mode = 'inbox' | 'templates' | 'campaigns' | 'workflows' | 'analytics' | 'health';

const TABS: { value: Mode; icon: typeof Mail; label: string }[] = [
  { value: 'inbox',      icon: Inbox,     label: 'Inbox' },
  { value: 'templates',  icon: Sparkles,  label: 'Templates' },
  { value: 'campaigns',  icon: Megaphone, label: 'Campaigns' },
  { value: 'workflows',  icon: Workflow,  label: 'Flows' },
  { value: 'analytics',  icon: BarChart3, label: 'Stats' },
  { value: 'health',     icon: Activity,  label: 'Health' },
];

const VALID = new Set<Mode>(TABS.map(t => t.value));

export default function CrmEmailWorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Legacy `?tab=compose` falls back to inbox.
  const initial = searchParams.get('tab') as Mode | null;
  const [mode, setMode] = useState<Mode>(initial && VALID.has(initial) ? initial : 'inbox');
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    const t = searchParams.get('tab') as Mode | null;
    if (t === ('compose' as Mode)) {
      // Legacy URL → open the dialog and land on Inbox.
      setComposerOpen(true);
      const sp = new URLSearchParams(searchParams);
      sp.delete('tab');
      setSearchParams(sp, { replace: true });
      setMode('inbox');
      return;
    }
    if (t && VALID.has(t) && t !== mode) setMode(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const switchMode = (next: Mode) => {
    setMode(next);
    const sp = new URLSearchParams(searchParams);
    if (next === 'inbox') sp.delete('tab'); else sp.set('tab', next);
    setSearchParams(sp, { replace: true });
  };

  return (
    <div
      className="flex flex-col h-full min-h-0 lg:h-[calc(100dvh-140px)] lg:min-h-[600px]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mb-2"><EmailLiveStatusBar /></div>
      {/* Editorial header — segmented tabs + primary "New Email" CTA */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex-1 -mx-1 overflow-x-auto no-scrollbar">
          <div className="inline-flex items-center gap-0.5 p-0.5 mx-1 rounded-xl border border-border/70 bg-card shadow-sm">
            {TABS.map(t => (
              <ModeBtn
                key={t.value}
                active={mode === t.value}
                onClick={() => switchMode(t.value)}
                icon={t.icon}
                label={t.label}
              />
            ))}
          </div>
        </div>
        <Button
          onClick={() => setComposerOpen(true)}
          className="shrink-0 h-9 gap-1.5 text-[12.5px] font-semibold"
        >
          <PenSquare className="h-3.5 w-3.5" />
          New Email
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        {mode === 'inbox' && <InboxView />}

        {mode !== 'inbox' && (
          <div className="h-full overflow-auto rounded-2xl border border-border/70 bg-card shadow-sm">
            <Suspense fallback={<HubSkeleton />}>
              {mode === 'templates'  && <CrmMarketingHubPage />}
              {mode === 'campaigns'  && <CrmEmailCampaignsPage />}
              {mode === 'workflows'  && <CrmEmailWorkflowsPage />}
              {mode === 'analytics'  && <CrmEmailAnalyticsPage />}
              {mode === 'health'     && <CrmEmailHealthPage />}
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

function ModeBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-all',
        active
          ? 'bg-foreground text-background shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
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
