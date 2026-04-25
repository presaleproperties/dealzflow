import { Phone, Mail, MessageSquare, Calendar, ListTodo, Sparkles, ArrowRight, Flame, Snowflake, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CrmContact } from '@/hooks/useCrmContacts';

interface Props {
  contact: CrmContact;
  leadScore: { score: number; color: string; label: string };
  lastTouchHours: number | null;
  pendingTaskCount: number;
  upcomingShowingCount: number;
  onCall: () => void;
  onText: () => void;
  onEmail: () => void;
  onTask: () => void;
  onShowing: () => void;
}

type Suggestion = {
  primary: { label: string; icon: typeof Phone; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  reason: string;
  urgency: 'critical' | 'warm' | 'normal';
};

/**
 * "Next Best Action" — collapses the decision-making step. We pick the
 * single most useful next move based on staleness, lead score, channel
 * availability, and pending appointments. Agents stop deciding and start
 * doing.
 */
export function NextBestActionCard({
  contact, leadScore, lastTouchHours, pendingTaskCount, upcomingShowingCount,
  onCall, onText, onEmail, onTask, onShowing,
}: Props) {
  const suggestion = pickSuggestion({
    contact, leadScore, lastTouchHours, pendingTaskCount, upcomingShowingCount,
    onCall, onText, onEmail, onTask, onShowing,
  });

  const urgencyTone =
    suggestion.urgency === 'critical' ? 'border-rose-500/40 bg-gradient-to-br from-rose-500/[0.08] via-card to-card'
    : suggestion.urgency === 'warm'   ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/[0.08] via-card to-card'
    : 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card';

  const urgencyChip =
    suggestion.urgency === 'critical' ? { icon: Flame, label: 'Urgent', cls: 'bg-rose-500/15 text-rose-700 border-rose-500/30' }
    : suggestion.urgency === 'warm'   ? { icon: Sun,   label: 'Warm',   cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30' }
    : { icon: Snowflake, label: 'Healthy', cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' };

  const PrimaryIcon = suggestion.primary.icon;
  const ChipIcon = urgencyChip.icon;
  const lastLabel = formatLastTouch(lastTouchHours);

  return (
    <div className={cn('rounded-2xl border p-4 shadow-sm', urgencyTone)}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Sparkles className="w-3 h-3" />
          Next Best Action
        </div>
        <span className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider',
          urgencyChip.cls,
        )}>
          <ChipIcon className="w-2.5 h-2.5" />
          {urgencyChip.label}
        </span>
      </div>

      <p className="text-[13.5px] text-foreground leading-snug mb-1">
        {suggestion.reason}
      </p>
      <p className="text-[11px] text-muted-foreground mb-3">
        Last activity: <span className="text-foreground/80 font-medium">{lastLabel}</span>
        {' · '}
        Score: <span className="text-foreground/80 font-medium">{leadScore.score} ({leadScore.label})</span>
      </p>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-9 text-xs gap-1.5 flex-1 font-semibold"
          onClick={suggestion.primary.onClick}
        >
          <PrimaryIcon className="w-3.5 h-3.5" />
          {suggestion.primary.label}
          <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-70" />
        </Button>
        {suggestion.secondary && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs"
            onClick={suggestion.secondary.onClick}
          >
            {suggestion.secondary.label}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Suggestion picker ────────────────────────────────────
   Priority order:
   1. Critical staleness (hot/warm lead, no contact in 4+ days)
   2. No contact ever
   3. Upcoming showing today/tomorrow → suggest task to prep
   4. Hot lead, recently active → keep momentum (text or email)
   5. Cold lead → schedule re-engagement
   6. Default → log a note about what's planned
*/
function pickSuggestion({
  contact, leadScore, lastTouchHours, pendingTaskCount, upcomingShowingCount,
  onCall, onText, onEmail, onTask, onShowing,
}: Props): Suggestion {
  const hasPhone = !!contact.phone;
  const hasEmail = !!contact.email;
  const score = leadScore.score;
  const days = lastTouchHours == null ? Infinity : Math.floor(lastTouchHours / 24);

  // 1. Critical staleness
  if (score >= 60 && days >= 4) {
    return {
      reason: `🔥 Hot lead has gone quiet for ${days} days — re-engage now before it cools.`,
      urgency: 'critical',
      primary: hasPhone
        ? { label: 'Call now',  icon: Phone, onClick: onCall }
        : hasEmail
          ? { label: 'Send email', icon: Mail,  onClick: onEmail }
          : { label: 'Add task',   icon: ListTodo, onClick: onTask },
      secondary: hasPhone && hasEmail
        ? { label: 'Email instead', onClick: onEmail }
        : undefined,
    };
  }

  // 2. No contact ever
  if (lastTouchHours == null) {
    return {
      reason: 'New lead — make first contact to start the relationship.',
      urgency: 'critical',
      primary: hasPhone
        ? { label: 'Call now', icon: Phone, onClick: onCall }
        : hasEmail
          ? { label: 'Send intro email', icon: Mail, onClick: onEmail }
          : { label: 'Add task', icon: ListTodo, onClick: onTask },
      secondary: hasPhone && hasEmail
        ? { label: 'Text instead', onClick: onText }
        : undefined,
    };
  }

  // 3. Upcoming showings → prep work
  if (upcomingShowingCount > 0) {
    return {
      reason: `Showing coming up — confirm details and send any prep info.`,
      urgency: 'warm',
      primary: hasPhone
        ? { label: 'Confirm by text', icon: MessageSquare, onClick: onText }
        : { label: 'Confirm by email', icon: Mail, onClick: onEmail },
      secondary: { label: 'Add prep task', onClick: onTask },
    };
  }

  // 4. Warm staleness
  if (score >= 30 && days >= 7) {
    return {
      reason: `Warm lead — ${days} days since last activity. Light touch to stay top of mind.`,
      urgency: 'warm',
      primary: hasEmail
        ? { label: 'Send check-in email', icon: Mail, onClick: onEmail }
        : { label: 'Send text', icon: MessageSquare, onClick: onText },
      secondary: { label: 'Book showing', onClick: onShowing },
    };
  }

  // 5. Cold lead — re-engagement campaign
  if (score < 30 && days >= 14) {
    return {
      reason: `Cold lead — ${days} days inactive. Try a re-engagement nudge or close out.`,
      urgency: 'warm',
      primary: hasEmail
        ? { label: 'Re-engagement email', icon: Mail, onClick: onEmail }
        : { label: 'Add follow-up task', icon: ListTodo, onClick: onTask },
      secondary: { label: 'Add task', onClick: onTask },
    };
  }

  // 6. Healthy — keep momentum
  return {
    reason: pendingTaskCount > 0
      ? `${pendingTaskCount} open task${pendingTaskCount === 1 ? '' : 's'} — keep momentum and check them off.`
      : `Lead is being handled well. Consider scheduling the next touchpoint.`,
    urgency: 'normal',
    primary: { label: 'Book showing', icon: Calendar, onClick: onShowing },
    secondary: hasEmail
      ? { label: 'Send email', onClick: onEmail }
      : { label: 'Add task', onClick: onTask },
  };
}

function formatLastTouch(hours: number | null): string {
  if (hours == null) return 'Never';
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
