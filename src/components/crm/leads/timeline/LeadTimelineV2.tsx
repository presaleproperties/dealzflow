import { useMemo, useState, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Loader2, Inbox } from 'lucide-react';
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
import { TimelinePresetsBar } from './TimelinePresetsBar';
import { useTimelinePresets, type TimelinePreset } from '@/hooks/useTimelinePresets';
import { format, isSameDay } from 'date-fns';
import { useEffect } from 'react';

interface Props {
  contactId: string;
  className?: string;
  /** When true, render in compact mode for sidebars/cards. */
  compact?: boolean;
  onEventClick?: (event: TimelineEvent) => void;
  /** Virtualization viewport height. Defaults to 640px. */
  height?: number;
}

type Row =
  | { kind: 'header'; key: string; date: Date }
  | { kind: 'event'; key: string; event: TimelineEvent };

export function LeadTimelineV2({
  contactId,
  className,
  onEventClick,
  height = 640,
}: Props) {
  const [filterKey, setFilterKey] = useState<'all' | TimelineKind | 'comms'>('all');
  const [kinds, setKinds] = useState<TimelineKind[] | null>(null);
  const [search, setSearch] = useState('');

  const { events, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useLeadTimelineV2({ contactId, kinds, search });

  const { data: pins = [] } = useTimelinePins(contactId);
  const toggle = useTogglePin(contactId);

  const pinSet = useMemo(
    () => new Set(pins.map((p) => `${p.event_kind}:${p.event_id}`)),
    [pins],
  );

  const pinnedEvents = useMemo(
    () => events.filter((e) => pinSet.has(`${e.kind}:${e.event_id}`)),
    [events, pinSet],
  );

  // Build a flat virtualizable row list with sticky-ish date headers inlined.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDate: Date | null = null;
    for (const ev of events) {
      const d = new Date(ev.occurred_at);
      if (!lastDate || !isSameDay(lastDate, d)) {
        out.push({ kind: 'header', key: `h-${d.toDateString()}`, date: d });
        lastDate = d;
      }
      out.push({ kind: 'event', key: `${ev.kind}:${ev.event_id}`, event: ev });
    }
    return out;
  }, [events]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleTogglePin = useCallback(
    (e: TimelineEvent) =>
      toggle.mutate({ event: e, isPinned: pinSet.has(`${e.kind}:${e.event_id}`) }),
    [toggle, pinSet],
  );

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
                onTogglePin={handleTogglePin}
                onClick={onEventClick}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-10 text-center">
            <Inbox className="mb-2 h-6 w-6 text-muted-foreground/60" />
            <p className="text-[12.5px] text-muted-foreground">
              {search ? 'No matches for that search.' : 'No activity yet for this lead.'}
            </p>
          </div>
        ) : (
          <Virtuoso
            style={{ height }}
            data={rows}
            increaseViewportBy={{ top: 200, bottom: 600 }}
            endReached={handleEndReached}
            computeItemKey={(_i, row) => row.key}
            itemContent={(_index, row) => {
              if (row.kind === 'header') {
                return (
                  <p className="bg-background py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {format(row.date, 'EEEE, MMM d')}
                  </p>
                );
              }
              return (
                <TimelineRow
                  event={row.event}
                  isPinned={pinSet.has(`${row.event.kind}:${row.event.event_id}`)}
                  onTogglePin={handleTogglePin}
                  onClick={onEventClick}
                />
              );
            }}
            components={{
              Footer: () =>
                hasNextPage ? (
                  <div className="flex items-center justify-center py-3 text-[11.5px] text-muted-foreground">
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Loading older activity…
                      </>
                    ) : (
                      'Scroll for more'
                    )}
                  </div>
                ) : (
                  <div className="py-3 text-center text-[10.5px] text-muted-foreground/70">
                    End of timeline
                  </div>
                ),
            }}
          />
        )}
      </div>
    </div>
  );
}
