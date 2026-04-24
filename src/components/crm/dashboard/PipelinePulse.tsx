import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, AlertTriangle } from 'lucide-react';
import { useCrmContacts } from '@/hooks/useCrmContacts';

const FUNNEL_STAGES = [
  { key: 'New Lead', label: 'New', color: 'hsl(210 62% 46%)' },
  { key: 'Contacted', label: 'Contacted', color: 'hsl(142 71% 45%)' },
  { key: 'Nurturing', label: 'Nurturing', color: 'hsl(var(--primary))' },
  { key: 'Hot / Engaged', label: 'Hot', color: 'hsl(0 84% 60%)' },
  { key: 'Showing Booked', label: 'Showing', color: 'hsl(38 92% 50%)' },
  { key: 'Offer Made', label: 'Offer', color: 'hsl(270 60% 55%)' },
  { key: 'Closed', label: 'Closed', color: 'hsl(142 71% 35%)' },
];

export function PipelinePulse() {
  const navigate = useNavigate();
  const { data: contacts = [] } = useCrmContacts();

  const { stageCounts, total, maxCount, biggestDrop, conversionRate, closedCount } = useMemo(() => {
    const counts: Record<string, number> = {};
    FUNNEL_STAGES.forEach(s => (counts[s.key] = 0));
    contacts.forEach(c => {
      if (c.status && counts[c.status] !== undefined) counts[c.status]++;
    });

    const total = contacts.length;
    const closed = counts['Closed'] || 0;
    const rate = total > 0 ? ((closed / total) * 100).toFixed(1) : '0';
    const max = Math.max(...Object.values(counts), 1);

    // Find biggest drop-off between consecutive stages
    let dropLabel = '';
    let dropPct = 0;
    for (let i = 0; i < FUNNEL_STAGES.length - 1; i++) {
      const cur = counts[FUNNEL_STAGES[i].key];
      const next = counts[FUNNEL_STAGES[i + 1].key];
      if (cur > 0) {
        const pct = ((cur - next) / cur) * 100;
        if (pct > dropPct) {
          dropPct = pct;
          dropLabel = `${Math.round(pct)}% of leads drop off at ${FUNNEL_STAGES[i].label} → ${FUNNEL_STAGES[i + 1].label}`;
        }
      }
    }

    return { stageCounts: counts, total, maxCount: max, biggestDrop: dropLabel, conversionRate: rate, closedCount: closed };
  }, [contacts]);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-[hsl(39_67%_55%)]" />
        <h3 className="text-sm font-semibold text-foreground">Pipeline Pulse</h3>
      </div>

      {/* Funnel bars */}
      <div className="space-y-1.5">
        {FUNNEL_STAGES.map(stage => {
          const count = stageCounts[stage.key] ?? 0;
          const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
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
                  {count}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Insights */}
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
