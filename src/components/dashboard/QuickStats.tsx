import { AnimatedCurrency } from '@/components/ui/animated-number';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface QuickStatsProps {
  receivedYTD: number;
  comingIn: number;
  monthlyExpenses: number;
  activeDeals: number;
  closedDealsYTD: number;
  pipelineCount?: number;
  pipelinePotential?: number;
  comingInDateRange?: string;
}

const CARDS = [
  {
    key: 'earned',
    label: 'Earned YTD',
    valueKey: 'receivedYTD' as const,
    subtitleFn: (p: QuickStatsProps) => `${p.closedDealsYTD} closed deal${p.closedDealsYTD !== 1 ? 's' : ''}`,
    accent: 'text-success',
    dot: 'bg-success',
    border: 'border-success/20',
    bg: 'bg-success/[0.08]',
  },
  {
    key: 'coming',
    label: 'Coming In',
    valueKey: 'comingIn' as const,
    subtitleFn: (p: QuickStatsProps) =>
      `${p.activeDeals} pending${p.comingInDateRange ? ' · ' + p.comingInDateRange : ''}`,
    accent: 'text-primary',
    dot: 'bg-primary',
    border: 'border-primary/20',
    bg: 'bg-primary/[0.08]',
  },
  {
    key: 'expenses',
    label: 'Expenses / mo',
    valueKey: 'monthlyExpenses' as const,
    subtitleFn: () => 'Monthly recurring',
    accent: 'text-destructive',
    dot: 'bg-destructive',
    border: 'border-destructive/20',
    bg: 'bg-destructive/[0.08]',
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    valueKey: 'pipelinePotential' as const,
    subtitleFn: (p: QuickStatsProps) =>
      `${p.pipelineCount ?? 0} prospect${(p.pipelineCount ?? 0) !== 1 ? 's' : ''}`,
    accent: 'text-info',
    dot: 'bg-info',
    border: 'border-info/20',
    bg: 'bg-info/[0.08]',
  },
] as const;

export function QuickStats({
  receivedYTD,
  comingIn,
  monthlyExpenses,
  activeDeals,
  closedDealsYTD,
  pipelineCount = 0,
  pipelinePotential = 0,
  comingInDateRange,
}: QuickStatsProps) {
  const props = {
    receivedYTD, comingIn, monthlyExpenses, activeDeals,
    closedDealsYTD, pipelineCount, pipelinePotential, comingInDateRange,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
      {CARDS.map((card, index) => {
        const value = props[card.valueKey] ?? 0;
        const subtitle = card.subtitleFn(props);

        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'rounded-[20px] p-4 border relative overflow-hidden cursor-default',
              'transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg',
              card.bg,
              card.border,
            )}
            style={{
              boxShadow: '0 1px 0 0 hsl(0 0% 100% / 0.06) inset, 0 2px 12px -4px hsl(0 0% 0% / 0.18)',
            }}
          >
            {/* Top shine */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/12" />
            {/* Bottom inner shadow */}
            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/[0.04] to-transparent dark:from-black/10" />

            {/* Label */}
            <div className="flex items-center gap-1.5 mb-3">
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 shadow-sm', card.dot)} />
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground/75">
                {card.label}
              </span>
            </div>

            {/* Value */}
            <AnimatedCurrency
              value={value}
              className={cn('text-[22px] sm:text-[23px] font-extrabold block tracking-[-0.035em] leading-none mb-1.5', card.accent)}
              duration={0.8 + index * 0.06}
            />

            {/* Subtitle */}
            <p className="text-[10.5px] text-muted-foreground/65 leading-tight truncate font-medium">
              {subtitle}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
