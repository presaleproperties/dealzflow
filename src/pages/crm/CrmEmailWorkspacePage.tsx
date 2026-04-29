// CRM Email — single unified hub.
// Top-level segmented control: Compose · Inbox · Templates · Campaigns · Flows · Stats · Health.
// Compose mode keeps the 3-pane Apple-Mail-style layout (Templates · Composer · Recipients).
// All other modes are lazy-loaded so cold loads stay fast.

import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Mail, Workflow, Megaphone, BarChart3, Activity, Send, Inbox, PenSquare, Sparkles,
} from 'lucide-react';
import { TemplatesRail, type AnyTpl } from '@/components/crm/email/TemplatesRail';
import { RecipientsRail } from '@/components/crm/email/RecipientsRail';
import { ComposerSurface } from '@/components/crm/email/ComposerSurface';
import InboxView from '@/components/crm/email/InboxView';
import { PanelEdgeHandle } from '@/components/crm/leads/detail/PanelEdgeHandle';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CrmContact } from '@/hooks/useCrmContacts';

// Lazy hub sections — only load when their tab is opened.
const CrmMarketingHubPage = lazy(() => import('./CrmMarketingHubPage'));
const CrmEmailCampaignsPage = lazy(() => import('./CrmEmailCampaignsPage'));
const CrmEmailWorkflowsPage = lazy(() => import('./CrmEmailWorkflowsPage'));
const CrmEmailAnalyticsPage = lazy(() => import('./CrmEmailAnalyticsPage'));
const CrmEmailHealthPage = lazy(() => import('./CrmEmailHealthPage'));

type Mode = 'compose' | 'inbox' | 'templates' | 'campaigns' | 'workflows' | 'analytics' | 'health';

const TABS: { value: Mode; icon: typeof Mail; label: string; subtitle: string }[] = [
  { value: 'compose',    icon: PenSquare, label: 'Compose',    subtitle: 'Pick a template, choose recipients, write, send.' },
  { value: 'inbox',      icon: Inbox,     label: 'Inbox',      subtitle: 'Synced replies and threads.' },
  { value: 'templates',  icon: Sparkles,  label: 'Templates',  subtitle: 'Branded templates synced from Presale Properties.' },
  { value: 'campaigns',  icon: Megaphone, label: 'Campaigns',  subtitle: 'Mass-send to a segment with tracking.' },
  { value: 'workflows',  icon: Workflow,  label: 'Flows',      subtitle: 'Automated drips & follow-ups.' },
  { value: 'analytics',  icon: BarChart3, label: 'Stats',      subtitle: 'Opens, clicks, replies — all sends.' },
  { value: 'health',     icon: Activity,  label: 'Health',     subtitle: 'Domain auth, deliverability, bounces.' },
];

const VALID = new Set<Mode>(TABS.map(t => t.value));

export default function CrmEmailWorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Mode) ?? 'compose';
  const [mode, setMode] = useState<Mode>(VALID.has(initialTab) ? initialTab : 'compose');

  const [recipients, setRecipients] = useState<CrmContact[]>([]);
  const [appliedTpl, setAppliedTpl] = useState<AnyTpl | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('crm.emailWorkspace.leftCollapsed') === '1';
  });
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('crm.emailWorkspace.rightCollapsed') === '1';
  });

  useEffect(() => {
    localStorage.setItem('crm.emailWorkspace.leftCollapsed', leftCollapsed ? '1' : '0');
  }, [leftCollapsed]);
  useEffect(() => {
    localStorage.setItem('crm.emailWorkspace.rightCollapsed', rightCollapsed ? '1' : '0');
  }, [rightCollapsed]);

  // Keep tab in URL so refreshes/links land on the right section.
  useEffect(() => {
    const t = searchParams.get('tab') as Mode | null;
    if (t && VALID.has(t) && t !== mode) setMode(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const switchMode = (next: Mode) => {
    setMode(next);
    const sp = new URLSearchParams(searchParams);
    if (next === 'compose') sp.delete('tab'); else sp.set('tab', next);
    setSearchParams(sp, { replace: true });
  };

  const applyTemplate = (t: AnyTpl) => {
    setAppliedTpl(t);
    setActiveTemplateId(t.id);
  };

  const removeRecipient = (id: string) =>
    setRecipients((prev) => prev.filter((r) => r.id !== id));

  const active = TABS.find(t => t.value === mode) ?? TABS[0];

  return (
    <div
      className="flex flex-col h-full min-h-0 lg:h-[calc(100dvh-140px)] lg:min-h-[600px]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* Editorial header */}
      <div className="mb-4 space-y-3">
        <div className="flex items-baseline gap-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 font-semibold">Email</p>
          <span className="h-px flex-1 bg-border/60" aria-hidden />
        </div>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-[22px] sm:text-[24px] font-semibold tracking-tight text-foreground leading-none">
              {active.label}
            </h1>
            <p className="text-[12px] text-muted-foreground mt-1.5">{active.subtitle}</p>
          </div>
        </div>

        {/* Segmented hub nav — scrollable on small screens */}
        <div className="-mx-1 overflow-x-auto no-scrollbar">
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
      </div>

      <div className="flex-1 min-h-0">
        {mode === 'compose' && (
          <div className="h-full flex flex-col md:flex-row min-h-0 rounded-2xl border border-border/70 overflow-hidden bg-card shadow-sm">
            {!leftCollapsed && (
              <div className="hidden md:block min-h-0 w-[240px] lg:w-[280px] flex-shrink-0 border-r border-border/70">
                <TemplatesRail onApply={applyTemplate} activeTemplateId={activeTemplateId} />
              </div>
            )}
            <div className="hidden md:block">
              <PanelEdgeHandle
                side="left"
                collapsed={leftCollapsed}
                onToggle={() => setLeftCollapsed((v) => !v)}
                label="Templates panel"
              />
            </div>

            <div className="min-h-0 overflow-hidden flex-1 min-w-0 flex flex-col">
              {/* Phone-only quick actions */}
              <div className="md:hidden flex items-center gap-2 px-4 py-2.5 border-b border-border/70 bg-muted/10">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                      <Mail className="h-3.5 w-3.5" />
                      Templates
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="p-0 w-[300px]">
                    <TemplatesRail onApply={(t) => { applyTemplate(t); }} activeTemplateId={activeTemplateId} />
                  </SheetContent>
                </Sheet>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs ml-auto">
                      <Send className="h-3.5 w-3.5" />
                      Recipients ({recipients.length})
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="p-0 w-[92vw] sm:w-[400px]">
                    <RecipientsRail selected={recipients} onSelectedChange={setRecipients} />
                  </SheetContent>
                </Sheet>
              </div>

              {/* Tablet (md→lg) toggles */}
              <div className="hidden md:flex lg:hidden items-center gap-2 px-4 py-2 border-b border-border/70 bg-muted/10">
                <button
                  type="button"
                  onClick={() => setLeftCollapsed((v) => !v)}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  <Mail className="h-3 w-3" />
                  {leftCollapsed ? 'Show templates' : 'Hide templates'}
                </button>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11.5px] ml-auto">
                      <Send className="h-3 w-3" />
                      Recipients ({recipients.length})
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="p-0 w-[420px] max-w-[92vw]">
                    <RecipientsRail selected={recipients} onSelectedChange={setRecipients} />
                  </SheetContent>
                </Sheet>
              </div>

              <div className="flex-1 min-h-0">
                <ComposerSurface
                  recipients={recipients}
                  onAddRecipient={(c) =>
                    setRecipients((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]))
                  }
                  onRemoveRecipient={removeRecipient}
                  onClearRecipients={() => setRecipients([])}
                  appliedTemplate={appliedTpl}
                  onTemplateApplied={() => setAppliedTpl(null)}
                  onSent={() => setActiveTemplateId(null)}
                />
              </div>
            </div>

            {/* Recipients rail — desktop only */}
            <div className="hidden lg:block">
              <PanelEdgeHandle
                side="right"
                collapsed={rightCollapsed}
                onToggle={() => setRightCollapsed((v) => !v)}
                label="Recipients panel"
              />
            </div>
            {!rightCollapsed && (
              <div className="hidden lg:block min-h-0 w-[380px] flex-shrink-0 border-l border-border/70">
                <RecipientsRail selected={recipients} onSelectedChange={setRecipients} />
              </div>
            )}
          </div>
        )}

        {mode === 'inbox' && <InboxView />}

        {(mode === 'templates' || mode === 'campaigns' || mode === 'workflows' || mode === 'analytics' || mode === 'health') && (
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
