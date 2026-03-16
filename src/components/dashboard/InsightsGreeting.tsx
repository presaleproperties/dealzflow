import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarRange, MapPin, DollarSign, TrendingUp, Briefcase } from 'lucide-react';
import { addMonths, format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const MONTH_TONES = [
  'bg-primary/[0.04]',
  'bg-accent/[0.06]',
  'bg-muted/40',
  'bg-primary/[0.03]',
  'bg-accent/[0.04]',
  'bg-muted/30',
  'bg-primary/[0.04]',
  'bg-accent/[0.06]',
  'bg-muted/40',
  'bg-primary/[0.03]',
  'bg-accent/[0.04]',
  'bg-muted/30',
] as const;

interface InsightsGreetingProps {
  syncedTransactions: any[];
  revenueShare?: any[];
  userName?: string;
  receivedYTD?: number;
  revShareMonthlyAvg?: number;
}

const RANGE_OPTIONS = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '12M', months: 12 },
] as const;

export function InsightsGreeting({ syncedTransactions, revenueShare = [], userName, receivedYTD = 0, revShareMonthlyAvg = 0 }: InsightsGreetingProps) {
  const [range, setRange] = useState(3);
  const navigate = useNavigate();
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = userName || 'there';
  const thisYear = now.getFullYear();

  const closedThisYear = syncedTransactions.filter((t: any) => t.status === 'closed' && t.close_date && new Date(t.close_date).getFullYear() === thisYear).length;
  const activeDeals = syncedTransactions.filter((t: any) => t.status === 'active').length;

  const outlook = useMemo(() => {
    const months = Array.from({ length: range }, (_, offset) => {
      const monthStart = startOfMonth(addMonths(now, offset));
      const monthEnd = endOfMonth(addMonths(now, offset));

      const deals = syncedTransactions.filter((tx: any) => {
        if (!tx.close_date || tx.status !== 'active') return false;
        const d = parseISO(tx.close_date);
        return isWithinInterval(d, { start: monthStart, end: monthEnd });
      });

      const commission = deals.reduce((sum: number, tx: any) => {
        const splitPercent = tx.my_split_percent != null ? Number(tx.my_split_percent) : 1;
        const amount = (splitPercent < 1 && tx.my_net_payout != null)
          ? Number(tx.my_net_payout)
          : Number(tx.commission_amount || 0);
        return sum + amount;
      }, 0);

      return {
        label: format(monthStart, 'MMM'),
        year: format(monthStart, 'yy'),
        monthKey: format(monthStart, 'yyyy-MM'),
        deals,
        commission,
        total: commission + revShareMonthlyAvg,
      };
    });

    const totalCommission = months.reduce((s, m) => s + m.commission, 0);
    const totalDeals = months.reduce((s, m) => s + m.deals.length, 0);

    return { months, totalCommission, totalDeals, projectedRevShare: revShareMonthlyAvg * range };
  }, [syncedTransactions, now, revShareMonthlyAvg, range]);

  // For 6M/12M, show condensed rows instead of wide columns
  const isCompact = range > 3;

  return (
    <div
      className="rounded-2xl border border-border/30 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--card)/0.95) 100%)',
        boxShadow: '0 1px 3px 0 hsl(var(--foreground)/0.04), 0 8px 24px -4px hsl(var(--primary)/0.06)',
      }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.7) 100%)',
              boxShadow: '0 2px 8px -2px hsl(var(--primary)/0.4)',
            }}
          >
            <CalendarRange className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">{greeting}, {displayName}</h2>
            <p className="text-xs text-muted-foreground">
              {closedThisYear} closed, {activeDeals} active in {thisYear} · {formatCurrency(receivedYTD)} earned YTD
            </p>
          </div>
        </div>

        {/* Range toggle */}
        <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5 border border-border/30">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.months}
              onClick={() => setRange(opt.months)}
              className={cn(
                "px-3 py-1 rounded-md text-[11px] font-semibold transition-all duration-200",
                range === opt.months
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Month grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={range}
          className="px-5 pb-4"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {!isCompact ? (
            /* 3-month: side-by-side columns */
          <div className="grid grid-cols-3 gap-3">
              {outlook.months.map((month, i) => (
                <MonthColumn key={month.label + month.year} month={month} index={i} tone={MONTH_TONES[i % MONTH_TONES.length]} onClick={() => navigate(`/deals?month=${month.monthKey}`)} />
              ))}
            </div>
          ) : (
            /* 6M/12M: compact scrollable grid */
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {outlook.months.map((month, i) => (
                <motion.div
                  key={month.label + month.year}
                  onClick={() => navigate(`/deals?month=${month.monthKey}`)}
                  className={cn(
                    "rounded-xl border border-border/20 p-3 space-y-1 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors",
                    MONTH_TONES[i % MONTH_TONES.length]
                  )}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground">{month.label} '{month.year}</span>
                    {month.deals.length > 0 && (
                      <span className="text-[9px] text-muted-foreground/50">{month.deals.length}</span>
                    )}
                  </div>
                  <p className={cn(
                    "text-sm font-bold",
                    month.commission > 0 ? "text-foreground" : "text-muted-foreground/50"
                  )}>
                    {formatCurrency(month.total)}
                  </p>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Summary footer */}
      <div
        className="px-5 py-3 flex items-center gap-6 text-xs border-t border-border/20"
        style={{ background: 'hsl(var(--muted)/0.3)' }}
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Briefcase className="h-3.5 w-3.5" />
          <span className="font-bold text-foreground">{outlook.totalDeals}</span> closing
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <DollarSign className="h-3.5 w-3.5" />
          <span className="font-bold text-foreground">{formatCurrency(outlook.totalCommission)}</span> GCI
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="font-bold text-foreground">{formatCurrency(outlook.projectedRevShare)}</span> RevShare
        </span>
      </div>
    </div>
  );
}

function MonthColumn({ month, index, tone, onClick }: { month: any; index: number; tone: string; onClick?: () => void }) {
  return (
    <motion.div
      onClick={onClick}
      className={cn("rounded-xl p-3.5 space-y-2 border border-border/15 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors", tone)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-muted-foreground">{month.label}</span>
        <span className="text-[10px] text-muted-foreground/50">
          {month.deals.length} deal{month.deals.length !== 1 ? 's' : ''}
        </span>
      </div>

      <p className="text-xl font-bold text-foreground tracking-tight">{formatCurrency(month.total)}</p>

      {month.deals.length > 0 ? (
        <div className="space-y-1">
          {month.deals.slice(0, 2).map((deal: any) => (
            <p key={deal.id} className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
              {deal.property_address || deal.client_name || 'Deal'}
            </p>
          ))}
          {month.deals.length > 2 && (
            <p className="text-[10px] text-muted-foreground/40">+{month.deals.length - 2} more</p>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground/30">No closings</p>
      )}
    </motion.div>
  );
}
