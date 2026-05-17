import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useContactsByPipeline } from '@/hooks/useContactsByPipeline';
import { getSegmentColor } from '@/lib/segmentColors';

export function LeadConversionFunnel() {
  const navigate = useNavigate();
  const { data: contacts = [] } = useCrmContacts();
  const { buckets, total: bucketTotal } = useContactsByPipeline(contacts);

  const { stages, total } = useMemo(() => {
    const total = bucketTotal || 1;
    return {
      stages: buckets.map((b, i) => {
        const prev = i === 0 ? total : buckets[i - 1].count;
        const convRate = prev > 0 ? ((b.count / prev) * 100).toFixed(0) : '0';
        return {
          key: b.segment.id,
          label: b.segment.name,
          color: getSegmentColor(b.segment).dot,
          count: b.count,
          convRate,
        };
      }),
      total,
    };
  }, [buckets, bucketTotal]);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Lead Conversion Funnel</h3>
      </div>

      <div className="space-y-1">
        {stages.map((stage, i) => {
          const widthPct = total > 0 ? Math.max((stage.count / total) * 100, 4) : 4;
          return (
            <button
              key={stage.key}
              onClick={() => navigate('/crm/leads')}
              className="w-full group"
            >
              <div className="flex items-center gap-3">
                <span className="text-[11px] w-28 text-right text-muted-foreground truncate shrink-0">
                  {stage.label}
                </span>
                <div className="flex-1 relative">
                  <div className="h-8 bg-muted/30 rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-500 group-hover:opacity-80 flex items-center justify-center"
                      style={{
                        width: `${widthPct}%`,
                        background: stage.color,
                        minWidth: 32,
                      }}
                    >
                      <span className="text-[11px] font-bold text-white drop-shadow-sm">
                        {stage.count}
                      </span>
                    </div>
                  </div>
                </div>
                {i > 0 && (
                  <span className="text-[10px] text-muted-foreground w-10 text-right shrink-0">
                    {stage.convRate}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 text-center">
        Stage-to-stage conversion rates shown on the right
      </p>
    </div>
  );
}
