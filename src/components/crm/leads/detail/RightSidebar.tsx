import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BehaviorIngestionStatus } from '@/components/crm/leads/BehaviorIngestionStatus';
import { LeadActivityDiagnostics } from '@/components/crm/leads/LeadActivityDiagnostics';
import { NextBestActionCard } from '@/components/crm/leads/NextBestActionCard';
import { EngagementTabs } from '@/components/crm/leads/EngagementTabs';
import { PresaleSignupSourceCard } from '@/components/crm/leads/PresaleSignupSourceCard';
import { UpcomingMini } from '@/components/crm/leads/UpcomingMini';
import { RecentCallsCard } from '@/components/crm/leads/RecentCallsCard';
import type { CrmContact } from '@/hooks/useCrmContacts';
import type { LeadScore } from './types';
import { ZaraSection } from './ZaraSection';
import { ZaraLeadIntelligenceCard } from './ZaraLeadIntelligenceCard';

interface Props {
  contact: CrmContact;
  onAddTask: () => void;
  onAddShowing: () => void;
  onCall: () => void;
  onText: () => void;
  onEmail: () => void;
  onSendProject?: () => void;
  leadScore: LeadScore;
  lastTouchHours: number | null;
}

/**
 * Reorganized right sidebar — 4 zones + 1 collapsible debug accordion.
 *  ⓪ Send Project — primary green CTA (most-used action)
 *  ① Next Best Action  (sticky)
 *  ② Upcoming (next task + next showing, mini)
 *  ③ At-a-glance KPIs
 *  ④ Engagement (tabs: Emails / Behavior / Source)
 *  ⑤ Debug ▾ (collapsed by default)
 */
export function RightSidebar({
  contact, onAddTask, onAddShowing, onCall, onText, onEmail, onSendProject, leadScore, lastTouchHours,
}: Props) {
  const presaleUserId = (contact as unknown as Record<string, unknown>).presale_user_id as string | undefined;

  return (
    <div className="space-y-4">
      {/* ⓪ Send Project — themed gold CTA (highest-frequency action) */}
      {onSendProject && (
        <Button
          onClick={onSendProject}
          className="w-full h-11 gap-2 font-semibold tracking-tight bg-primary text-primary-foreground hover:bg-primary/90 border border-primary/40 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.55)]"
        >
          <Send className="w-4 h-4" /> Send Project
        </Button>
      )}

      {/* ① Next Best Action — sticky so it stays visible while scrolling */}
      <div className="sticky top-0 z-10 -mx-1 px-1 pt-1 pb-1 bg-muted/30 backdrop-blur-sm">
        <NextBestActionCard
          contact={contact}
          leadScore={leadScore}
          lastTouchHours={lastTouchHours}
          pendingTaskCount={0 /* not surfaced in card UI; we use UpcomingMini */}
          upcomingShowingCount={0}
          onCall={onCall}
          onText={onText}
          onEmail={onEmail}
          onTask={onAddTask}
          onShowing={onAddShowing}
        />
      </div>

      {/* ② Upcoming — next task + next showing only (moved above KPIs) */}
      <UpcomingMini
        contactId={contact.id}
        onAddTask={onAddTask}
        onAddShowing={onAddShowing}
      />

      {/* Zara — unified memory + actions + composer */}
      <ZaraSection contact={contact} />


      {/* ③ Engagement (Emails / Behavior) */}
      <EngagementTabs contact={contact} />

      {/* ④ Source — separated into its own tile */}
      <PresaleSignupSourceCard contact={contact} />

      {/* ⑤ Recent phone calls (only renders when calls exist) */}
      <RecentCallsCard contactId={contact.id} />
      {/* ⑤ Debug — collapsed by default, hidden noise */}
      <details className="rounded-xl border border-border/60 bg-card/50 group">
        <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between text-[11px] uppercase tracking-[0.1em] font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <span>Diagnostics</span>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.4"
            className="transition-transform group-open:rotate-90"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </summary>
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/40">
          <BehaviorIngestionStatus contactId={contact?.id} />
          <LeadActivityDiagnostics
            contactId={contact?.id}
            contactEmail={contact?.email}
            presaleUserId={presaleUserId}
          />
        </div>
      </details>
    </div>
  );
}
