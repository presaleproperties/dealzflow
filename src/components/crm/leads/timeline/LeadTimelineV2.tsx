import { useMemo, useState } from 'react';
import { Loader2, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useLeadTimelineV2,
  useTimelinePins,
  useTogglePin,
  type TimelineEvent,
  type TimelineKind,
} from '@/hooks/useLeadTimelineV2';
import { TimelineRow } from './TimelineRow';
import { TimelineFilters } from './TimelineFilters';
import { format, isSameDay } from 'date-fns';

interface Props {
  contactId: string;
  className?: string;
  /** When true, render in compact mode for sidebars/cards. */
  compact?: boolean;
  onEventClick?: (event: TimelineEvent) => void;
}

export function LeadTimelineV2({ contactId, className, compact, onEventClick }: Props) {
  const [filterKey, setFilterKey] = useState<'all' | TimelineKind | 'comms'>('all');
  const [kinds, setKinds] = useState<TimelineKind[] | null>(null);
  const [search, setSearch] = useState('');

  const { events, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useLeadTimelineV2({ contactId, kinds, search });

  const { data: pins = [] } = useTimelinePins(contactId);
  const toggle = useTogglePin(contactId);

  const pinSet = useMemo(() => {
    return new Set(pins.map((p) => `${p.event_kind}:${p.event_id}`));
  }, [pins]);

  const pinnedEvents = useMemo(
    () => events.filter((e) => pinSet.has(`${e.kind}:${e.event_id}`)),
    [events, pinSet],
  );

  // Group remaining by date for sticky headers
  const grouped = useMemo(() => {
    const groups: { date: Date; items: TimelineEvent[] }[] = [];
    for (const ev of events) {
      const d = new Date(ev.occurred_at);
      const last = groups[groups.length - 1];
      if (last && isSameDay(last.date, d)) last.items.push(ev);
      else groups.push({ date: d, items: [ev] });
    }
    return groups;
  }, [events]);

  return (
    <div className={cn('flex flex-col', className)}>
      <TimelineFilters
        active={filterKey}
        onChange={(k, ks) => {
          setFilterKey(k);
          setKinds(ks);
        }}
        search={search}
        onSearchChange={setSearch}
      />

      {pinnedEvents.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-2">
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-400">
            Important moments
          </p>
          <div className="space-y-0.5">
            {pinnedEvents.map((ev) => (
              <TimelineRow
                key={`pin-${ev.kind}-${ev.event_id}`}
                event={ev}
                isPinned
                onTogglePin={(e) => toggle.mutate({ event: e, isPinned: true })}
                onClick={onEventClick}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-10 text-center">
            <Inbox className="mb-2 h-6 w-6 text-muted-foreground/60" />
            <p className="text-[12.5px] text-muted-foreground">
              {search ? 'No matches for that search.' : 'No activity yet for this lead.'}
            </p>
          </div>
        ) : (
          grouped.map((g) => (
            <div key={g.date.toISOString()} className="space-y-0.5">
              <p className="sticky top-0 z-[1] -mx-1 mb-1 bg-gradient-to-b from-background via-background/95 to-background/80 px-1 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur">
                {format(g.date, 'EEEE, MMM d')}
              </p>
              {g.items.map((ev) => (
                <TimelineRow
                  key={`${ev.kind}-${ev.event_id}`}
                  event={ev}
                  isPinned={pinSet.has(`${ev.kind}:${ev.event_id}`)}
                  onTogglePin={(e) =>
                    toggle.mutate({ event: e, isPinned: pinSet.has(`${e.kind}:${e.event_id}`) })
                  }
                  onClick={onEventClick}
                />
              ))}
            </div>
          ))
        )}

        {hasNextPage && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="h-8 text-[12px]"
            >
              {isFetchingNextPage ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Load older
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
