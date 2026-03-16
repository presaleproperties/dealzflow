import { useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { Target, CalendarClock, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { AnimatedCurrency } from '@/components/ui/animated-number';
import { cn } from '@/lib/utils';
import { useSettings } from '@/hooks/useSettings';
import { motion } from 'framer-motion';

interface GCIGoalTrackerProps {
  gciYTD: number;
  revShareYTD: number;
  projectedRevenue: number;
  revShareMonthlyAvg: number;
}

export function GCIGoalTracker({ gciYTD, revShareYTD, projectedRevenue, revShareMonthlyAvg }: GCIGoalTrackerProps) {
  const { data: settings } = useSettings();
  const thisYear = new Date().getFullYear();

  const gciGoal = Number((settings as any)?.yearly_gci_goal) || 0;
  const revShareGoal = Number((settings as any)?.yearly_revshare_goal) || 0;
  const revShareAnnual = revShareMonthlyAvg * 12;
  const projected2026Total = projectedRevenue + revShareAnnual;
  const commPct = projected2026Total > 0 ? (projectedRevenue / projected2026Total) * 100 : 50;

  const goals = useMemo(() => {
    const items: { label: string; current: number; goal: number; color: string; glow: string }[] = [];
    if (gciGoal > 0) {
      items.push({
        label: 'GCI',
        current: gciYTD,
        goal: gciGoal,
        color: 'hsl(var(--primary))',
        glow: 'hsl(158 72% 40% / 0.35)',
      });
    }
    if (revShareGoal > 0) {
      items.push({
        label: 'RevShare',
        current: revShareYTD,
        goal: revShareGoal,
        color: 'hsl(var(--accent))',
        glow: 'hsl(217 91% 55% / 0.3)',
      });
    }
    return items;
  }, [gciYTD, revShareYTD, gciGoal, revShareGoal]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl relative overflow-hidden bg-card border border-border/60"
      style={{
        boxShadow: '0 1px 2px 0 hsl(220 25% 10% / 0.04), 0 6px 20px -4px hsl(220 25% 10% / 0.07)',
      }}
    >
      {/* Ambient color washes */}
      <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none opacity-50 dark:opacity-25"
        style={{ background: 'radial-gradient(circle, hsl(38 92% 50% / 0.12) 0%, transparent 65%)' }} />
      <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full pointer-events-none opacity-50 dark:opacity-20"
        style={{ background: 'radial-gradient(circle, hsl(158 70% 40% / 0.1) 0%, transparent 65%)' }} />
      {/* Top shine */}
      <div className="absolute inset-x-0 top-0 h-px dark:opacity-20"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 35%, rgba(255,255,255,0.9) 65%, transparent)' }} />

      <div className="relative px-4 sm:px-5 py-4 space-y-3.5">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(145deg, hsl(38 90% 56%) 0%, hsl(32 92% 44%) 100%)',
                boxShadow: '0 3px 10px -2px hsl(38 90% 50% / 0.45), inset 0 1px 0 0 rgba(255,255,255,0.25)',
              }}
            >
              <CalendarClock className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
                {thisYear} Projected Revenue
              </p>
              <AnimatedCurrency
                value={projected2026Total}
                className="text-[22px] sm:text-2xl font-bold text-foreground leading-none tracking-tight"
                duration={0.8}
              />
            </div>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-primary" />
              <span>Commissions + RevShare</span>
            </div>
          </div>
        </div>

        {/* Stacked proportion bar */}
        <div className="space-y-2">
          <div
            className="h-2 rounded-full overflow-hidden flex"
            style={{ background: 'hsl(var(--muted) / 0.5)' }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${commPct}%` }}
              transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-l-full"
              style={{
                background: 'linear-gradient(90deg, hsl(158 72% 30%), hsl(158 72% 42%))',
                boxShadow: '2px 0 8px 0 hsl(158 70% 34% / 0.4)',
              }}
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${100 - commPct}%` }}
              transition={{ duration: 0.9, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-r-full"
              style={{
                background: 'linear-gradient(90deg, hsl(217 91% 48%), hsl(217 91% 60%))',
                boxShadow: '-2px 0 8px 0 hsl(217 91% 50% / 0.35)',
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              <span className="text-[11px] text-muted-foreground font-medium">Commissions</span>
              <span className="text-[11px] font-bold text-foreground">{formatCurrency(projectedRevenue)}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] text-center text-[11px]">
                    Your net portion after team splits (e.g. 30% on co-listed deals)
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400" />
              <span className="text-[11px] text-muted-foreground font-medium">RevShare</span>
              <span className="text-[11px] font-bold text-foreground">{formatCurrency(revShareAnnual)}</span>
            </div>
          </div>
        </div>

        {/* Goal progress bars */}
        {goals.length > 0 && (
          <>
            <div className="h-px bg-border/40" />
            <div className="flex items-center gap-1.5 mb-0.5">
              <Target className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                {thisYear} Goals
              </span>
            </div>
            <div className="space-y-3">
              {goals.map((item) => {
                const pct = item.goal > 0 ? Math.min((item.current / item.goal) * 100, 100) : 0;
                const remaining = Math.max(item.goal - item.current, 0);
                return (
                  <div key={item.label} className="space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] font-semibold text-foreground/80">{item.label}</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-bold text-foreground">{formatCurrency(item.current)}</span>
                        <span className="text-[10px] text-muted-foreground">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.85, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
                        className="h-full rounded-full"
                        style={{ background: item.color, boxShadow: `0 0 8px 0 ${item.glow}` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {remaining > 0
                        ? `${formatCurrency(remaining)} to reach ${formatCurrency(item.goal)} goal`
                        : '🎯 Goal reached!'}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
