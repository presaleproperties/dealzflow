import { Skeleton } from '@/components/ui/skeleton';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useContactsByPipeline } from '@/hooks/useContactsByPipeline';
import { getSegmentColor } from '@/lib/segmentColors';

export function CrmPipelineSnapshot() {
  const { data: contacts = [], isLoading: contactsLoading } = useCrmContacts();
  const { buckets, total, isLoading: pipelinesLoading } = useContactsByPipeline(contacts);
  const isLoading = contactsLoading || pipelinesLoading;

  return (
    <div className="bg-card rounded-[10px] lg:rounded-xl border border-border p-3 sm:p-4 lg:p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-3 sm:mb-4">Pipeline Snapshot</h3>
      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No contacts in pipeline yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 snap-x snap-mandatory no-scrollbar">
            <div className="flex h-10 rounded-lg overflow-hidden mb-3 min-w-[480px] sm:min-w-0">
              {buckets.map(({ segment, count }) => {
                if (count === 0) return null;
                const pct = (count / total) * 100;
                const { dot } = getSegmentColor(segment);
                return (
                  <div
                    key={segment.id}
                    className="flex items-center justify-center text-[10px] font-bold text-white transition-all duration-300 min-w-[24px] snap-start"
                    style={{ width: `${pct}%`, background: dot }}
                    title={`${segment.name}: ${count}`}
                  >
                    {pct > 6 ? count : ''}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1">
            {buckets.map(({ segment, count }) => {
              const { dot } = getSegmentColor(segment);
              return (
                <div key={segment.id} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ background: dot }}
                  />
                  <span className="text-[11px] sm:text-xs text-muted-foreground">
                    {segment.name} ({count})
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
