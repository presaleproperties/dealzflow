import { useMemo } from 'react';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { useCrmEmailLog } from '@/hooks/useCrmEmailLog';
import { useCrmContactSmsLog } from '@/hooks/useCrmContactSmsLog';
import { cn } from '@/lib/utils';
import type { CrmContact } from '@/hooks/useCrmContacts';
import type { LeadScore } from './detail/types';

interface Props {
  contact: CrmContact;
  leadScore: LeadScore;
  lastTouchHours: number | null;
}

/**
 * Compact 6-cell at-a-glance grid. Replaces the standalone Conversation
 * Health strip and the Email Attribution stat tiles. Single source of "what's
 * the state of this lead in 2 seconds".
 */
export function AtAGlanceCard({ contact, leadScore, lastTouchHours }: Props) {
  const { data: emails = [] } = useCrmEmailLog(contact.id);
  const { data: sms = [] } = useCrmContactSmsLog(contact.id);

  const metrics = useMemo(() => {
    const emailRows = (emails as any[]) ?? [];
    const smsRows = (sms as any[]) ?? [];

    const outboundEmails = emailRows.filter((e) => e.direction === 'outbound');
    const inboundEmails = emailRows.filter((e) => e.direction === 'inbound');
    const outboundSms = smsRows.filter((s) => s.direction === 'outbound');
    const inboundSms = smsRows.filter((s) => s.direction === 'inbound');

    const openedSends = outboundEmails.filter((e) => (e.open_count ?? 0) > 0).length;
    const openRate = outboundEmails.length
      ? Math.round((openedSends / outboundEmails.length) * 100)
      : null;

    const totalOut = outboundEmails.length + outboundSms.length;
    const inboundTs = [
      ...inboundEmails.map((e: any) => e.sent_at),
      ...inboundSms.map((s: any) => s.sent_at ?? s.created_at),
    ]
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .sort((a, b) => b - a);

    return {
      sends: totalOut,
      openRate,
      lastReply: inboundTs[0] ? new Date(inboundTs[0]) : null,
    };
  }, [emails, sms]);

  const stageChangedAt = (contact as any).stage_changed_at as string | null | undefined;
  const daysInStage = stageChangedAt
    ? differenceInDays(new Date(), new Date(stageChangedAt))
    : null;

  const scoreTone =
    leadScore.score >= 70 ? 'text-emerald-600'
    : leadScore.score >= 40 ? 'text-amber-600'
    : 'text-rose-600';

  const openRateTone = (r: number | null) => {
    if (r == null) return undefined;
    if (r >= 50) return 'text-emerald-600';
    if (r >= 20) return 'text-amber-600';
    return 'text-rose-600';
  };

  const lastTouchLabel =
    lastTouchHours == null ? 'Never'
    : lastTouchHours < 1 ? '<1h'
    : lastTouchHours < 24 ? `${Math.round(lastTouchHours)}h`
    : `${Math.round(lastTouchHours / 24)}d`;

  const lastTouchTone =
    lastTouchHours == null ? 'text-muted-foreground'
    : lastTouchHours <= 24 ? 'text-emerald-600'
    : lastTouchHours <= 24 * 7 ? 'text-amber-600'
    : 'text-rose-600';

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 shadow-sm">
      <div className="grid grid-cols-3 gap-x-3 gap-y-3">
        <Cell label="Score" value={`${leadScore.score}`} sub={leadScore.label} tone={scoreTone} />
        <Cell label="Stage" value={contact.status || '—'} sub={null} compact />
        <Cell
          label="In stage"
          value={daysInStage == null ? '—' : `${daysInStage}d`}
          sub={null}
        />
        <Cell label="Sends" value={metrics.sends.toString()} sub={null} />
        <Cell
          label="Open rate"
          value={metrics.openRate == null ? '—' : `${metrics.openRate}%`}
          tone={openRateTone(metrics.openRate)}
        />
        <Cell
          label="Last touch"
          value={lastTouchLabel}
          sub={
            metrics.lastReply
              ? `reply ${formatDistanceToNow(metrics.lastReply, { addSuffix: true })}`
              : null
          }
          tone={lastTouchTone}
        />
      </div>
    </div>
  );
}

function Cell({
  label, value, sub, tone, compact,
}: {
  label: string;
  value: string;
  sub?: string | null;
  tone?: string;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground/80 font-semibold truncate">
        {label}
      </div>
      <div className={cn(
        'font-semibold tabular-nums mt-0.5 truncate',
        compact ? 'text-[12px]' : 'text-[14px]',
        tone,
      )}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-muted-foreground/80 truncate mt-0.5">{sub}</div>
      )}
    </div>
  );
}
