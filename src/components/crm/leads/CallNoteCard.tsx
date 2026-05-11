import { ArrowDownLeft, ArrowUpRight, Phone, PhoneMissed, AlertTriangle, Play } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CrmCallLogRow } from '@/hooks/useCrmContactCallLog';
import { AgentBadge } from './detail/AgentBadge';

interface Props {
  call: CrmCallLogRow;
}

function fmtDuration(sec: number | null) {
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Phone call entry in the lead activity timeline.
 * Mirrors EmailNoteCard / SmsNoteCard editorial language so each channel
 * reads at a glance: tinted left rail + uppercase channel label, no dot.
 */
export function CallNoteCard({ call }: Props) {
  const isInbound = call.direction === 'inbound';
  const ts = call.started_at;
  const time = format(parseISO(ts), 'h:mm a');
  const dateLabel = format(parseISO(ts), 'MMM d');

  // Gold-ish tint to differentiate calls from email (primary) and SMS (sky/green)
  const tint = '38 75% 48%';

  const missed =
    call.status === 'no-answer' ||
    call.status === 'busy' ||
    call.status === 'failed' ||
    call.status === 'canceled';

  const counterpart = isInbound ? call.from_number : call.to_number;
  const duration = fmtDuration(call.duration_sec);

  return (
    <div className="group relative">
      <div
        className={cn(
          'call-note-row w-full text-left rounded-lg border bg-card pl-3.5 pr-3 py-2.5 md:pl-4 md:pr-3.5 md:py-3 transition-all',
          'border-border/60 border-l-[3px]',
        )}
        style={{ borderLeftColor: `hsl(${tint})` }}
      >
        {/* Meta row */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0 flex-wrap">
            <span
              className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.08em] text-[10px]"
              style={{ color: `hsl(${tint})` }}
            >
              {missed ? (
                <PhoneMissed className="w-2.5 h-2.5" />
              ) : isInbound ? (
                <ArrowDownLeft className="w-2.5 h-2.5" />
              ) : (
                <ArrowUpRight className="w-2.5 h-2.5" />
              )}
              Call · {isInbound ? 'In' : 'Out'}
            </span>
            <Sep />
            <span className="shrink-0 tabular-nums text-[11px]">
              <span className="md:hidden">{time}</span>
              <span className="hidden md:inline">
                {dateLabel} · {time}
              </span>
            </span>
            {call.agent_user_id && (
              <>
                <Sep />
                <AgentBadge userId={call.agent_user_id} prefix={isInbound ? 'to' : 'by'} />
              </>
            )}
            {missed && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1 text-destructive text-[11px] font-medium capitalize">
                  <AlertTriangle className="w-3 h-3" />
                  {call.status}
                </span>
              </>
            )}
          </div>
          {duration && !missed && (
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{duration}</span>
          )}
        </div>

        {/* Body */}
        <div className="flex items-center gap-1.5 text-sm text-foreground">
          <Phone className="w-3 h-3 text-muted-foreground" />
          <span className="tabular-nums">{counterpart || 'Unknown number'}</span>
        </div>

        {/* Recording playback */}
        {call.recording_url && (
          <div className="mt-2 flex items-center gap-2">
            <Play className="w-3 h-3 text-muted-foreground" />
            <audio controls preload="none" src={call.recording_url} className="h-7 w-full max-w-[280px]" />
          </div>
        )}

        {call.notes && (
          <div className="mt-1.5 text-xs text-muted-foreground whitespace-pre-wrap">{call.notes}</div>
        )}
      </div>
    </div>
  );
}

function Sep() {
  return <span className="text-muted-foreground/40">·</span>;
}
