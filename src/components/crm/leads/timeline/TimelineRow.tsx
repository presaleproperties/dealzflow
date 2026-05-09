import { memo } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  StickyNote,
  Mail,
  MessageSquare,
  Eye,
  MousePointerClick,
  FileText,
  CalendarDays,
  CheckSquare,
  Activity,
  Phone,
  Star,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Map,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TimelineEvent, TimelineKind } from '@/hooks/useLeadTimelineV2';

const ICONS: Record<TimelineKind, typeof Mail> = {
  note: StickyNote,
  email: Mail,
  sms: MessageSquare,
  behavior: Activity,
  engagement: MousePointerClick,
  form: FileText,
  showing: CalendarDays,
  task: CheckSquare,
  booking: CalendarDays,
};

const TONES: Record<TimelineKind, string> = {
  note: 'text-foreground/70 bg-muted',
  email: 'text-blue-600 bg-blue-500/10 dark:text-blue-400',
  sms: 'text-sky-600 bg-sky-500/10 dark:text-sky-400',
  behavior: 'text-fuchsia-600 bg-fuchsia-500/10 dark:text-fuchsia-400',
  engagement: 'text-fuchsia-600 bg-fuchsia-500/10 dark:text-fuchsia-400',
  form: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400',
  showing: 'text-violet-600 bg-violet-500/10 dark:text-violet-400',
  task: 'text-amber-600 bg-amber-500/10 dark:text-amber-400',
  booking: 'text-violet-600 bg-violet-500/10 dark:text-violet-400',
};

function pickIcon(ev: TimelineEvent): typeof Mail {
  // sub-kind overrides
  const sk = (ev.sub_kind ?? '').toLowerCase();
  if (ev.kind === 'behavior') {
    if (sk.includes('floorplan')) return Download;
    if (sk.includes('view')) return Eye;
    if (sk.includes('call')) return Phone;
    if (sk.includes('map')) return Map;
  }
  if (ev.kind === 'engagement') {
    if (sk.includes('click')) return MousePointerClick;
    if (sk.includes('open')) return Eye;
  }
  return ICONS[ev.kind] ?? Activity;
}

interface Props {
  event: TimelineEvent;
  isPinned: boolean;
  onTogglePin: (e: TimelineEvent) => void;
  onClick?: (e: TimelineEvent) => void;
}

export const TimelineRow = memo(function TimelineRow({
  event,
  isPinned,
  onTogglePin,
  onClick,
}: Props) {
  const Icon = pickIcon(event);
  const tone = TONES[event.kind] ?? 'text-foreground/70 bg-muted';
  const date = new Date(event.occurred_at);
  const dirIcon =
    event.direction === 'inbound' || event.direction === 'in'
      ? ArrowDownLeft
      : event.direction === 'outbound' || event.direction === 'out'
      ? ArrowUpRight
      : null;
  const DirIcon = dirIcon;
  const important = event.importance >= 7;

  return (
    <div
      className={cn(
        'group relative flex gap-3 rounded-lg border border-transparent p-2.5 transition-colors',
        'hover:bg-muted/50 hover:border-border/60',
        important && 'bg-amber-500/[0.04]',
      )}
      onClick={onClick ? () => onClick(event) : undefined}
      role={onClick ? 'button' : undefined}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-border/50',
          tone,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">
              {DirIcon ? (
                <DirIcon className="mr-1 inline h-3 w-3 align-[-2px] text-muted-foreground" />
              ) : null}
              {event.title}
              {important ? (
                <span className="ml-1.5 inline-flex translate-y-[-1px] items-center rounded bg-amber-500/15 px-1 py-0 text-[9.5px] font-bold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400">
                  Hot
                </span>
              ) : null}
            </p>
            {event.subtitle ? (
              <p className="truncate text-[11.5px] text-muted-foreground">{event.subtitle}</p>
            ) : null}
            {event.body_excerpt ? (
              <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-foreground/80">
                {event.body_excerpt}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(event);
              }}
              className={cn(
                'rounded-md p-1 transition-opacity',
                isPinned
                  ? 'text-amber-500 opacity-100'
                  : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-amber-500',
              )}
              aria-label={isPinned ? 'Unpin' : 'Pin to important moments'}
            >
              <Star className={cn('h-3.5 w-3.5', isPinned && 'fill-current')} />
            </button>
            <span
              className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground"
              title={format(date, 'PPpp')}
            >
              {formatDistanceToNow(date, { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
