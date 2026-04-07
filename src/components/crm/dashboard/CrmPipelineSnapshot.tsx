import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

const STAGES = [
  { label: 'New Lead', color: 'hsl(39 67% 55%)' },
  { label: 'Contacted', color: 'hsl(38 92% 50%)' },
  { label: 'Nurturing', color: 'hsl(210 62% 46%)' },
  { label: 'Hot / Engaged', color: 'hsl(0 84% 60%)' },
  { label: 'Showing Booked', color: 'hsl(270 60% 55%)' },
  { label: 'Offer Made', color: 'hsl(142 71% 45%)' },
  { label: 'Closed', color: 'hsl(142 71% 35%)' },
];

export function CrmPipelineSnapshot() {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-pipeline-snapshot'],
    queryFn: async () => {
      const { data: contacts } = await supabase
        .from('crm_contacts')
        .select('status');

      const counts: Record<string, number> = {};
      STAGES.forEach((s) => (counts[s.label] = 0));
      (contacts ?? []).forEach((c) => {
        if (counts[c.status] !== undefined) counts[c.status]++;
      });
      return counts;
    },
    staleTime: 60_000,
  });

  const total = data ? Object.values(data).reduce((s, v) => s + v, 0) : 0;

  return (
    <div className="bg-card rounded-[10px] lg:rounded-xl border border-border p-3 sm:p-4 lg:p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-3 sm:mb-4">Pipeline Snapshot</h3>
      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No contacts in pipeline yet.</p>
      ) : (
        <>
          {/* Funnel bar — horizontal scroll on mobile */}
          <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 snap-x snap-mandatory no-scrollbar">
            <div className="flex h-10 rounded-lg overflow-hidden mb-3 min-w-[480px] sm:min-w-0">
              {STAGES.map((stage) => {
                const count = data?.[stage.label] ?? 0;
                if (count === 0) return null;
                const pct = (count / total) * 100;
                return (
                  <div
                    key={stage.label}
                    className="flex items-center justify-center text-[10px] font-bold text-white transition-all duration-300 min-w-[24px] snap-start"
                    style={{ width: `${pct}%`, background: stage.color }}
                    title={`${stage.label}: ${count}`}
                  >
                    {pct > 6 ? count : ''}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1">
            {STAGES.map((stage) => {
              const count = data?.[stage.label] ?? 0;
              return (
                <div key={stage.label} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ background: stage.color }}
                  />
                  <span className="text-[11px] sm:text-xs text-muted-foreground">
                    {stage.label} ({count})
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
