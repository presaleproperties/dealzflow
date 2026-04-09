import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { useCrmContacts } from '@/hooks/useCrmContacts';

const FUNNEL_STAGES = [
  { key: 'New Lead', label: 'New Lead', color: 'hsl(210 62% 46%)' },
  { key: 'Contacted', label: 'Contacted', color: 'hsl(142 71% 45%)' },
  { key: 'Nurturing', label: 'Nurturing', color: 'hsl(39 67% 55%)' },
  { key: 'Hot / Engaged', label: 'Hot / Engaged', color: 'hsl(0 84% 60%)' },
  { key: 'Showing Booked', label: 'Showing Booked', color: 'hsl(38 92% 50%)' },
  { key: 'Offer Made', label: 'Offer Made', color: 'hsl(270 60% 55%)' },
  { key: 'Closed', label: 'Closed', color: 'hsl(142 71% 35%)' },
];

export function LeadConversionFunnel() {
  const navigate = useNavigate();
  const { data: contacts = [] } = useCrmContacts();

  const { stages, total } = useMemo(() => {
    const counts: Record<string, number> = {};
    FUNNEL_STAGES.forEach(s => (counts[s.key] = 0));
    contacts.forEach(c => {
      if (c.status && counts[c.status] !== undefined) counts[c.status]++;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

    return {
      stages: FUNNEL_STAGES.map((s, i) => {
        const count = counts[s.key];
        const prev = i === 0 ? total : counts[FUNNEL_STAGES[i - 1].key];
        const convRate = prev > 0 ? ((count / prev) * 100).toFixed(0) : '0';
        return { ...s, count, convRate };
      }),
      total,
    };
  }, [contacts]);

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
