import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Wallet,
  PiggyBank,
  AlertTriangle,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useRevenueShare } from '@/hooks/usePlatformConnections';
import { useSyncedTransactions } from '@/hooks/usePlatformConnections';
import { useSyncedIncome } from '@/hooks/useSyncedIncome';
import { useExpenses } from '@/hooks/useExpenses';
import { useProperties } from '@/hooks/useProperties';
import { useSettings } from '@/hooks/useSettings';
import { useDashboardEmptyState } from '@/hooks/useDashboardEmptyState';
import { PageLoader } from '@/components/ui/page-loader';
import { useRefreshData } from '@/hooks/useRefreshData';
import { formatCurrency, getExtendedMonthRange } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getTotalExpensesForMonth } from '@/lib/expenseCalculations';
import { AnimatedNumber } from '@/components/ui/animated-number';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

export default function ForecastPage() {
  const { data: syncedTransactions = [] } = useSyncedTransactions();
  const { syncedPayouts } = useSyncedIncome(syncedTransactions);
  const { data: revenueShare = [] } = useRevenueShare();
  const { data: expenses = [] } = useExpenses();
  const { data: properties = [] } = useProperties();
  const { data: settings } = useSettings();
  const refreshData = useRefreshData();
  // Shared empty-state gate — prevents Connect-ReZen onboarding from
  // flashing during react-query hydration on hard refresh.
  const { isLoading: isHydrating } = useDashboardEmptyState();

  const [excludedYears, setExcludedYears] = useState<Set<string>>(new Set(['2028', '2029', '2030']));

  // Calculate months needed to cover all close dates
  const monthsNeeded = useMemo(() => {
    if (syncedPayouts.length === 0) return 48;
    const now = new Date();
    let maxDate = now;
    syncedPayouts.forEach(p => {
      const d = parseISO(p.close_date);
      if (d > maxDate) maxDate = d;
    });
    const months = Math.ceil((maxDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)) + 1;
    return Math.max(48, months);
  }, [syncedPayouts]);

  // Generate forecast data from Jan 2025 through end of projection
  const forecastData = useMemo(() => {
    const months = getExtendedMonthRange(monthsNeeded);
    const now = new Date();
    const currentMonth = format(now, 'yyyy-MM');

    // Pre-compute RevShare by month (period format is YYYY-MM)
    const revShareByMonth: Record<string, number> = {};
    revenueShare.forEach((r: any) => {
      const period = r.period; // "YYYY-MM"
      revShareByMonth[period] = (revShareByMonth[period] || 0) + Number(r.amount);
    });

    // Calculate trailing 12-month average for RevShare projection
    const revShareMonths = Object.keys(revShareByMonth).sort();
    const recentMonths = revShareMonths.filter(m => m <= currentMonth).slice(-12);
    const trailingRevShareAvg = recentMonths.length > 0
      ? recentMonths.reduce((sum, m) => sum + (revShareByMonth[m] || 0), 0) / recentMonths.length
      : 0;
    
    return months.map((monthStr) => {
      // Get synced transactions for this month by close_date
      const monthSynced = syncedPayouts.filter(p => p.close_date.startsWith(monthStr));
      
      // Income from closed (received) + active (projected) transactions
      const received = monthSynced
        .filter(p => p.status === 'closed')
        .reduce((sum, p) => sum + p.netAmount, 0);
      
      const projected = monthSynced
        .filter(p => p.status === 'active')
        .reduce((sum, p) => sum + p.netAmount, 0);

      // Use actual RevShare if available, otherwise project the trailing average for future months
      const actualRevShare = revShareByMonth[monthStr];
      const revShareIncome = actualRevShare !== undefined ? actualRevShare : (monthStr > currentMonth ? trailingRevShareAvg : 0);
      const totalIncome = received + projected + revShareIncome;
      const totalExpenses = getTotalExpensesForMonth(expenses, properties, monthStr);

      let adjustedIncome = totalIncome;
      if (settings?.apply_tax_to_forecasts && settings.tax_set_aside_percent) {
        adjustedIncome = totalIncome * (1 - settings.tax_set_aside_percent / 100);
      }

      const net = adjustedIncome - totalExpenses;
      const isSlowMonth = net < 0;
      const isWarningMonth = net >= 0 && net < totalExpenses * 0.2;

      const commissions = received + projected;

      return {
        month: monthStr,
        label: format(parseISO(`${monthStr}-01`), 'MMM'),
        shortYear: format(parseISO(`${monthStr}-01`), 'yy'),
        fullLabel: format(parseISO(`${monthStr}-01`), 'MMMM yyyy'),
        income: totalIncome,
        commissions,
        revShare: revShareIncome,
        expenses: totalExpenses,
        net,
        isSlowMonth,
        isWarningMonth,
      };
    });
  }, [syncedPayouts, revenueShare, expenses, properties, settings]);

  // Running totals
  const runningTotals = useMemo(() => {
    let cumulative = 0;
    return forecastData.map((month) => {
      cumulative += month.net;
      return { ...month, cumulative };
    });
  }, [forecastData]);

  // Filter by excluded years
  const filteredData = useMemo(() => {
    if (excludedYears.size === 0) return runningTotals;
    return runningTotals.filter(m => !excludedYears.has(m.month.substring(0, 4)));
  }, [runningTotals, excludedYears]);

  const allSelected = excludedYears.size === 0;

  // Summary stats for filtered data
  const totals = useMemo(() => {
    const income = filteredData.reduce((s, m) => s + m.income, 0);
    const commissions = filteredData.reduce((s, m) => s + m.commissions, 0);
    const revShare = filteredData.reduce((s, m) => s + m.revShare, 0);
    const expenses = filteredData.reduce((s, m) => s + m.expenses, 0);
    const net = filteredData.reduce((s, m) => s + m.net, 0);
    const slowMonths = filteredData.filter(m => m.isSlowMonth).length;
    const avgMonthlyNet = filteredData.length > 0 ? net / filteredData.length : 0;
    return { income, commissions, revShare, expenses, net, slowMonths, avgMonthlyNet };
  }, [filteredData]);

  // Get unique years from forecast data
  const availableYears = useMemo(() => {
    const years = new Set(forecastData.map(m => m.month.substring(0, 4)));
    return Array.from(years).sort();
  }, [forecastData]);

  return (
    <AppLayout>
      <Header 
        title="Forecast" 
        subtitle={allSelected ? 'Multi-Year Projection' : `${availableYears.filter(y => !excludedYears.has(y)).join(', ')} Outlook`}
      />

      <PullToRefresh onRefresh={refreshData} className="min-h-[calc(100dvh-56px)]">
        <motion.div 
          className="p-3 sm:p-4 md:p-6 lg:p-6 space-y-3 sm:space-y-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Year Pills */}
          <motion.div variants={itemVariants} className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setExcludedYears(new Set())}
              className={cn(
                "px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap",
                allSelected
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              All
            </button>
            {availableYears.map(year => {
              const isActive = !excludedYears.has(year);
              return (
                <button
                  key={year}
                  onClick={() => {
                    setExcludedYears(prev => {
                      const next = new Set(prev);
                      if (next.has(year)) {
                        next.delete(year);
                      } else {
                        // Don't allow excluding all years
                        if (next.size < availableYears.length - 1) {
                          next.add(year);
                        }
                      }
                      return next;
                    });
                  }}
                  className={cn(
                    "px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted line-through"
                  )}
                >
                  {year}
                </button>
              );
            })}
          </motion.div>

          {/* Summary Stats */}
          <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {/* Commissions */}
            <div className="landing-card p-3 sm:p-4 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20">
              <div className="flex items-center gap-1.5 mb-1 sm:mb-2">
                <div className="p-1 sm:p-1.5 rounded-lg bg-emerald-500/20">
                  <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Commissions</span>
              </div>
              <AnimatedNumber
                value={totals.commissions}
                className="text-base sm:text-lg lg:text-xl font-bold text-emerald-600"
                duration={1.2}
              />
              <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                Deal income
              </p>
            </div>

            {/* RevShare */}
            <div className="landing-card p-3 sm:p-4 bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border-blue-500/20">
              <div className="flex items-center gap-1.5 mb-1 sm:mb-2">
                <div className="p-1 sm:p-1.5 rounded-lg bg-blue-500/20">
                  <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-600" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wide">RevShare</span>
              </div>
              <AnimatedNumber
                value={totals.revShare}
                className="text-base sm:text-lg lg:text-xl font-bold text-blue-600"
                duration={1.2}
              />
              <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                Network income
              </p>
            </div>

            {/* Total Expenses */}
            <div className="landing-card p-3 sm:p-4 bg-gradient-to-br from-rose-500/10 to-orange-500/5 border-rose-500/20">
              <div className="flex items-center gap-1.5 mb-1 sm:mb-2">
                <div className="p-1 sm:p-1.5 rounded-lg bg-rose-500/20">
                  <Wallet className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-600" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Expenses</span>
              </div>
              <AnimatedNumber
                value={totals.expenses}
                className="text-base sm:text-lg lg:text-xl font-bold text-rose-600"
                duration={1.2}
              />
              <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                {formatCurrency(totals.expenses / Math.max(filteredData.length, 1))}/mo
              </p>
            </div>

            {/* Net Profit */}
            <div className={cn(
              "landing-card p-3 sm:p-4",
              totals.net >= 0 
                ? "bg-gradient-to-br from-primary/10 to-accent/5 border-primary/20"
                : "bg-gradient-to-br from-destructive/10 to-rose-500/5 border-destructive/20"
            )}>
              <div className="flex items-center gap-1.5 mb-1 sm:mb-2">
                <div className={cn(
                  "p-1 sm:p-1.5 rounded-lg",
                  totals.net >= 0 ? "bg-primary/20" : "bg-destructive/20"
                )}>
                  <PiggyBank className={cn(
                    "w-3 h-3 sm:w-3.5 sm:h-3.5",
                    totals.net >= 0 ? "text-primary" : "text-destructive"
                  )} />
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Net</span>
              </div>
              <AnimatedNumber
                value={totals.net}
                className={cn(
                  "text-base sm:text-lg lg:text-xl font-bold",
                  totals.net >= 0 ? "text-primary" : "text-destructive"
                )}
                duration={1.2}
              />
              <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                {totals.net >= 0 ? <TrendingUp className="w-2.5 h-2.5 text-success" /> : <TrendingDown className="w-2.5 h-2.5 text-destructive" />}
                {formatCurrency(totals.avgMonthlyNet)}/mo
              </p>
            </div>

            {/* Slow Months Alert */}
            <div className={cn(
              "landing-card p-3 sm:p-4",
              totals.slowMonths > 0
                ? "bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-amber-500/20"
                : "bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20"
            )}>
              <div className="flex items-center gap-1.5 mb-1 sm:mb-2">
                <div className={cn(
                  "p-1 sm:p-1.5 rounded-lg",
                  totals.slowMonths > 0 ? "bg-amber-500/20" : "bg-emerald-500/20"
                )}>
                  <AlertTriangle className={cn(
                    "w-3 h-3 sm:w-3.5 sm:h-3.5",
                    totals.slowMonths > 0 ? "text-amber-600" : "text-emerald-600"
                  )} />
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Alerts</span>
              </div>
              <div className={cn(
                "text-base sm:text-lg lg:text-xl font-bold",
                totals.slowMonths > 0 ? "text-amber-600" : "text-emerald-600"
              )}>
                {totals.slowMonths > 0 ? totals.slowMonths : '✓'}
              </div>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                {totals.slowMonths > 0 ? `${totals.slowMonths} negative` : 'All positive'}
              </p>
            </div>
          </motion.div>

          {/* Chart */}
          <motion.div
            variants={itemVariants}
            className="landing-card p-3 sm:p-4 lg:p-6"
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div>
                <h3 className="text-xs sm:text-sm font-semibold">Cashflow</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Income vs expenses</p>
              </div>
              {settings?.apply_tax_to_forecasts && (
                <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {settings.tax_set_aside_percent}% tax
                </span>
              )}
            </div>
            
            <div className="h-48 sm:h-60 lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="label" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={10} 
                    tickLine={false}
                    axisLine={false}
                    interval={filteredData.length > 12 ? 5 : 0}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={9}
                    tickFormatter={(v) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      fontSize: '12px',
                      boxShadow: '0 10px 25px -5px hsl(var(--foreground) / 0.1)',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        commissions: 'Commissions',
                        revShare: 'RevShare',
                        expenses: 'Expenses',
                      };
                      return [formatCurrency(value), labels[name] || name];
                    }}
                    labelFormatter={(_, payload) => {
                      const d = payload?.[0]?.payload;
                      if (!d) return '';
                      return `${d.fullLabel} — Total: ${formatCurrency(d.income)}`;
                    }}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Bar 
                    dataKey="commissions" 
                    stackId="income"
                    fill="hsl(160, 84%, 39%)" 
                    opacity={0.85}
                  />
                  <Bar 
                    dataKey="revShare" 
                    stackId="income"
                    fill="hsl(217, 91%, 60%)" 
                    radius={[4, 4, 0, 0]}
                    opacity={0.85}
                  />
                  <Bar 
                    dataKey="expenses" 
                    fill="hsl(0, 84%, 60%)" 
                    radius={[4, 4, 0, 0]}
                    opacity={0.7}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 sm:gap-6 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ backgroundColor: 'hsl(160, 84%, 39%)' }} />
                <span className="text-[10px] sm:text-xs text-muted-foreground">Commissions</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ backgroundColor: 'hsl(217, 91%, 60%)' }} />
                <span className="text-[10px] sm:text-xs text-muted-foreground">RevShare</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-rose-500" />
                <span className="text-[10px] sm:text-xs text-muted-foreground">Expenses</span>
              </div>
            </div>
          </motion.div>

          {/* Monthly Breakdown Table */}
          <motion.div
            variants={itemVariants}
            className="landing-card overflow-hidden"
          >
            <div className="p-3 sm:p-4 border-b border-border">
              <h3 className="text-xs sm:text-sm font-semibold">Monthly Breakdown</h3>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Detailed cashflow</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left text-[9px] sm:text-[11px] font-semibold text-muted-foreground p-2 sm:p-3 uppercase tracking-wider">Month</th>
                    <th className="text-right text-[9px] sm:text-[11px] font-semibold text-muted-foreground p-2 sm:p-3 uppercase tracking-wider">Comm.</th>
                    <th className="text-right text-[9px] sm:text-[11px] font-semibold text-muted-foreground p-2 sm:p-3 uppercase tracking-wider">Rev$</th>
                    <th className="text-right text-[9px] sm:text-[11px] font-semibold text-muted-foreground p-2 sm:p-3 uppercase tracking-wider">Exp.</th>
                    <th className="text-right text-[9px] sm:text-[11px] font-semibold text-muted-foreground p-2 sm:p-3 uppercase tracking-wider">Net</th>
                    <th className="text-right text-[9px] sm:text-[11px] font-semibold text-muted-foreground p-2 sm:p-3 uppercase tracking-wider hidden sm:table-cell">Running</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((month) => (
                    <tr 
                      key={month.month} 
                      className={cn(
                        "border-b border-border/50 transition-colors",
                        month.isSlowMonth && "bg-rose-500/5",
                        month.isWarningMonth && "bg-amber-500/5",
                        month.month === format(new Date(), 'yyyy-MM') && "bg-primary/5"
                      )}
                    >
                      <td className="p-2 sm:p-3">
                        <div className="flex items-center gap-1">
                          {month.isSlowMonth && (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                          )}
                          {month.isWarningMonth && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          )}
                          <span className="font-medium text-[11px] sm:text-sm">{month.label} '{month.shortYear}</span>
                        </div>
                      </td>
                      <td className="p-2 sm:p-3 text-right">
                        <span className="text-[10px] sm:text-sm text-emerald-600 font-medium">{month.commissions > 0 ? (month.commissions >= 1000 ? `$${Math.round(month.commissions/1000)}k` : formatCurrency(month.commissions)) : '—'}</span>
                      </td>
                      <td className="p-2 sm:p-3 text-right">
                        <span className="text-[10px] sm:text-sm text-blue-600 font-medium">{month.revShare > 0 ? (month.revShare >= 1000 ? `$${Math.round(month.revShare/1000)}k` : formatCurrency(month.revShare)) : '—'}</span>
                      </td>
                      <td className="p-2 sm:p-3 text-right">
                        <span className="text-[10px] sm:text-sm text-rose-600">{month.expenses >= 1000 ? `$${Math.round(month.expenses/1000)}k` : formatCurrency(month.expenses)}</span>
                      </td>
                      <td className="p-2 sm:p-3 text-right">
                        <span className={cn(
                          "inline-flex items-center gap-0.5 text-[10px] sm:text-sm font-semibold",
                          month.net >= 0 ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {Math.abs(month.net) >= 1000 ? `${month.net < 0 ? '-' : ''}$${Math.round(Math.abs(month.net)/1000)}k` : formatCurrency(month.net)}
                        </span>
                      </td>
                      <td className="p-2 sm:p-3 text-right hidden sm:table-cell">
                        <span className={cn(
                          "text-[11px] sm:text-sm font-bold",
                          month.cumulative >= 0 ? "text-primary" : "text-destructive"
                        )}>
                          {formatCurrency(month.cumulative)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>
      </PullToRefresh>
    </AppLayout>
  );
}
