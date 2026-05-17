import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, AlertTriangle } from 'lucide-react';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useContactsByPipeline } from '@/hooks/useContactsByPipeline';
import { getSegmentColor } from '@/lib/segmentColors';

export function PipelinePulse() {
  const navigate = useNavigate();
  const { data: contacts = [] } = useCrmContacts();
  const { buckets } = useContactsByPipeline(contacts);

  const { stages, maxCount, biggestDrop, conversionRate, closedCount, total } = useMemo(() => {
    const stages = buckets.map(b => ({
      key: b.segment.id,
      label: b.segment.name,
      color: getSegmentColor(b.segment).dot,
      count: b.count,
    }));
    const total = contacts.length;
    const max = Math.max(...stages.map(s => s.count), 1);

    // Treat the LAST pipeline as the "closed/won" stage for conversion rate.
    const closed = stages.length > 0 ? stages[stages.length - 1].count : 0;
    const rate = total > 0 ? ((closed / total) * 100).toFixed(1) : '0';

    // Biggest drop between consecutive pipelines.
    let dropLabel = '';
    let dropPct = 0;
    for (let i = 0; i < stages.length - 1; i++) {
      const cur = stages[i].count;
      const next = stages[i + 1].count;
      if (cur > 0) {
        const pct = ((cur - next) / cur) * 100;
        if (pct > dropPct) {
          dropPct = pct;
          dropLabel = `${Math.round(pct)}% of leads drop off at ${stages[i].label} → ${stages[i + 1].label}`;
        }
      }
    }

    return { stages, maxCount: max, biggestDrop: dropLabel, conversionRate: rate, closedCount: closed, total };
  }, [buckets, contacts]);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-[hsl(39_67%_55%)]" />
        <h3 className="text-sm font-semibold text-foreground">Pipeline Pulse</h3>
      </div>

      <div className="space-y-1.5">
        {stages.map(stage => {
          const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
          return (
            <button
              key={stage.key}
              onClick={() => navigate('/crm/leads')}
              className="flex items-center gap-2 w-full group"
            >
              <span className="text-[10px] sm:text-[11px] w-16 sm:w-20 text-right text-muted-foreground truncate shrink-0">
                {stage.label}
              </span>
              <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden relative">
                <div
                  className="h-full rounded transition-all duration-500 group-hover:opacity-80"
                  style={{ width: `${Math.max(pct, 2)}%`, background: stage.color }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
                  {stage.count}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-1 text-[11px]">
        {biggestDrop && (
          <div className="flex items-start gap-1.5 text-[hsl(0_84%_60%)]">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            <span>⚠️ {biggestDrop}</span>
          </div>
        )}
        <p className="text-muted-foreground">
          Conversion: <span className="text-foreground font-semibold">{conversionRate}%</span> ({closedCount.toLocaleString()} of {total.toLocaleString()})
        </p>
      </div>
    </div>
  );
}
