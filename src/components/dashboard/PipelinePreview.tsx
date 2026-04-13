import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { usePipelineProspects } from '@/hooks/usePipelineProspects';
import { formatCurrency } from '@/lib/format';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const TEMP_CONFIG = {
  hot:  { label: 'Hot',  color: 'text-foreground',  bg: 'bg-muted/20',  bar: 'bg-foreground/60',  border: 'border-border/30' },
  warm: { label: 'Warm', color: 'text-foreground', bg: 'bg-muted/20', bar: 'bg-foreground/40', border: 'border-border/30' },
  cold: { label: 'Cold', color: 'text-foreground',   bg: 'bg-muted/20',   bar: 'bg-foreground/20',   border: 'border-border/30' },
} as const;

type TempKey = keyof typeof TEMP_CONFIG;

export function PipelinePreview({ layout = 'vertical' }: { layout?: 'horizontal' | 'vertical' }) {
  const { data: prospects = [] } = usePipelineProspects();

  const active = prospects.filter(p => p.status !== 'closed' && p.status !== 'lost');
  const totalGCI = active.reduce((s, p) => s + Number(p.potential_commission), 0);

  const tempStats = (['hot', 'warm', 'cold'] as TempKey[]).map(temp => {
    const items = active.filter(p => (p.temperature || 'warm') === temp);
    const gci = items.reduce((s, p) => s + Number(p.potential_commission), 0);
    return { temp, count: items.length, gci };
  });

  const topLeads = [...active]
    .sort((a, b) => {
      const order: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
      return (order[a.temperature] ?? 1) - (order[b.temperature] ?? 1);
    })
    .slice(0, 3);

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <TrendingUp className="h-7 w-7 text-muted-foreground/20" />
      <p className="text-xs text-muted-foreground/40">No active pipeline leads</p>
      <Link to="/pipeline" className="text-[11px] font-semibold text-primary hover:underline">Add your first lead →</Link>
    </div>
  );

  // ── Horizontal (used on dashboard) ──────────────────────────────────
  if (layout === 'horizontal') {
    return (
      <div className="liquid-glass rounded-2xl overflow-hidden">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-0.5">Pipeline</p>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight tabular-nums">{formatCurrency(totalGCI)}</span>
              <span className="text-[11px] text-muted-foreground/50 font-medium">potential GCI</span>
            </div>
          </div>
          <Link
            to="/pipeline"
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-primary border border-dashed border-primary/25 hover:bg-primary/5 transition-colors"
          >
            View All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {active.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Temp summary pills + bar */}
            <div className="px-4 sm:px-5 pb-3">
              <div className="flex items-center gap-2 mb-2.5">
                {tempStats.map(({ temp, count, gci }) => {
                  if (count === 0) return null;
                  const cfg = TEMP_CONFIG[temp];
                  return (
                    <div key={temp} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border", cfg.bg, cfg.border)}>
                      <span className={cn("text-[10px] font-bold uppercase", cfg.color)}>{cfg.label}</span>
                      <span className={cn("text-[11px] font-bold tabular-nums", cfg.color)}>{count}</span>
                      <span className="text-[10px] text-muted-foreground/50 font-medium hidden sm:inline">{formatCurrency(gci)}</span>
                    </div>
                  );
                })}
                <span className="ml-auto text-[11px] text-muted-foreground/40 tabular-nums">{active.length} lead{active.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Stacked bar */}
              {totalGCI > 0 && (
                <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                  {tempStats.map(({ temp, gci }) => {
                    const pct = (gci / totalGCI) * 100;
                    if (pct === 0) return null;
                    return (
                      <motion.div
                        key={temp}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className={cn("h-full rounded-full", TEMP_CONFIG[temp].bar)}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top leads — desktop only */}
            {topLeads.length > 0 && (
              <div className="hidden sm:grid grid-cols-3 gap-2 px-5 pb-5 border-t border-border/15 pt-3">
                {topLeads.map((p, idx) => {
                  const tc = TEMP_CONFIG[(p.temperature || 'warm') as TempKey] || TEMP_CONFIG.warm;
                  return (
                    <motion.div key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                      className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/15 border border-border/15">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 shrink-0">{tc.label}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold truncate leading-tight">{p.client_name}</p>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">{p.home_type}</p>
                      </div>
                      <span className="text-[11px] font-bold text-primary tabular-nums whitespace-nowrap">
                        {formatCurrency(p.potential_commission)}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Mobile: compact lead list */}
            <div className="sm:hidden divide-y divide-border/15 border-t border-border/15">
              {topLeads.map(p => {
                const tc = TEMP_CONFIG[(p.temperature || 'warm') as TempKey] || TEMP_CONFIG.warm;
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 shrink-0">{tc.label}</span>
                    <p className="flex-1 text-[13px] font-medium truncate">{p.client_name}</p>
                    <span className="text-[12px] font-bold text-primary tabular-nums">{formatCurrency(p.potential_commission)}</span>
                  </div>
                );
              })}
              {active.length > 3 && (
                <div className="px-4 py-2.5 text-center">
                  <span className="text-[11px] text-muted-foreground/40">+{active.length - 3} more</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Vertical (legacy fallback) ───────────────────────────────────────
  return (
    <div className="liquid-glass rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-0.5">Pipeline</p>
          <p className="text-lg font-bold tabular-nums">{formatCurrency(totalGCI)}</p>
          <p className="text-[11px] text-muted-foreground/50">{active.length} active lead{active.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {tempStats.map(({ temp, count }) => {
            if (count === 0) return null;
            const cfg = TEMP_CONFIG[temp];
            return (
              <span key={temp} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border", cfg.bg, cfg.border, cfg.color)}>
                {cfg.label} {count}
              </span>
            );
          })}
        </div>
      </div>

      {active.length === 0 ? <EmptyState /> : (
        <div className="space-y-2">
          {topLeads.map(p => {
            const tc = TEMP_CONFIG[(p.temperature || 'warm') as TempKey] || TEMP_CONFIG.warm;
            return (
              <div key={p.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-muted/20 border border-border/15">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 shrink-0">{tc.label}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.client_name}</p>
                  <p className="text-[11px] text-muted-foreground/50">{p.home_type}</p>
                </div>
                <span className="text-sm font-bold text-primary tabular-nums">{formatCurrency(p.potential_commission)}</span>
              </div>
            );
          })}
        </div>
      )}

      <Link to="/pipeline" className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-sm font-semibold text-primary hover:bg-primary/5 border border-dashed border-primary/20 transition-colors">
        View Full Pipeline <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
