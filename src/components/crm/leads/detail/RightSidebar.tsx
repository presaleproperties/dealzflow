import { BehaviorIngestionStatus } from '@/components/crm/leads/BehaviorIngestionStatus';
import { LeadActivityDiagnostics } from '@/components/crm/leads/LeadActivityDiagnostics';
import { NextBestActionCard } from '@/components/crm/leads/NextBestActionCard';
import { AtAGlanceCard } from '@/components/crm/leads/AtAGlanceCard';
import { EngagementTabs } from '@/components/crm/leads/EngagementTabs';
import { UpcomingMini } from '@/components/crm/leads/UpcomingMini';
import type { CrmContact } from '@/hooks/useCrmContacts';
import type { LeadScore } from './types';

interface Props {
  contact: CrmContact;
  onAddTask: () => void;
  onAddShowing: () => void;
  onCall: () => void;
  onText: () => void;
  onEmail: () => void;
  leadScore: LeadScore;
  lastTouchHours: number | null;
}

/**
 * Reorganized right sidebar — 4 zones + 1 collapsible debug accordion.
 *  ① Next Best Action  (sticky)
 *  ② At-a-glance KPIs
 *  ③ Engagement (tabs: Emails / Behavior / Source)
 *  ④ Upcoming (next task + next showing, mini)
 *  ⑤ Debug ▾ (collapsed by default)
 */
export function RightSidebar({
  contact, onAddTask, onAddShowing, onCall, onText, onEmail, leadScore, lastTouchHours,
}: Props) {
  const presaleUserId = (contact as unknown as Record<string, unknown>).presale_user_id as string | undefined;

  return (
    <div className="space-y-4">
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

      {/* ② At-a-glance — Score, Stage, Days in stage, Sends, Open rate, Last touch */}
      <AtAGlanceCard
        contact={contact}
        leadScore={leadScore}
        lastTouchHours={lastTouchHours}
      />

      {/* ③ Unified engagement (replaces 5 widgets) */}
      <EngagementTabs contact={contact} />

      {/* ④ Upcoming — next task + next showing only */}
      <UpcomingMini
        contactId={contact.id}
        onAddTask={onAddTask}
        onAddShowing={onAddShowing}
      />

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
