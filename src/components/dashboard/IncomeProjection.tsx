import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, Wallet, Home, Plus, BarChart3, Sparkles } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import { Payout, Expense } from '@/lib/types';
import { Property } from '@/hooks/useProperties';
import { getTotalExpensesForMonth, getPropertyCostsForMonth } from '@/lib/expenseCalculations';
import { SyncedPayout } from '@/hooks/useSyncedIncome';
import { useSubscription } from '@/hooks/useSubscription';
import { useSettings } from '@/hooks/useSettings';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface IncomeProjectionProps {
  payouts: Payout[];
  expenses: Expense[];
  revShareMonthlyAvg?: number;
  properties?: Property[];
  syncedPayouts?: SyncedPayout[];
}

interface MonthData {
  month: string;
  fullMonth: string;
  monthStr: string;
  monthIndex: number;
  income: number;
  revShareIncome: number;
  propertyNet: number;
  totalIncome: number;
  expenses: number;
  net: number;
  cumulativeNet: number;
  payouts: Payout[];
}

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0]?.payload as MonthData;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold text-sm mb-2">{data?.fullMonth}</p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-success flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success" />
              Commissions
            </span>
            <span className="font-medium">{formatCurrency(data?.income || 0)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-primary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              RevShare
            </span>
            <span className="font-medium">{formatCurrency(data?.revShareIncome || 0)}</span>
          </div>
          {data?.propertyNet !== 0 && (
            <div className="flex justify-between gap-4">
              <span className={`flex items-center gap-1.5 ${data?.propertyNet >= 0 ? 'text-teal-400' : 'text-orange-400'}`}>
                <span className={`w-2 h-2 rounded-full ${data?.propertyNet >= 0 ? 'bg-teal-400' : 'bg-orange-400'}`} />
                Property Net
              </span>
              <span className="font-medium">{data?.propertyNet >= 0 ? '+' : ''}{formatCurrency(data?.propertyNet || 0)}</span>
            </div>
          )}
          <div className="flex justify-between gap-4 pt-1 border-t border-border/50">
            <span className="text-primary font-medium">Total Income</span>
            <span className="font-bold">{formatCurrency(data?.totalIncome || 0)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-destructive flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-destructive" />
              Expenses
            </span>
            <span className="font-medium">{formatCurrency(data?.expenses || 0)}</span>
          </div>
          <div className="flex justify-between gap-4 pt-1 border-t border-border/50">
            <span className={data?.net >= 0 ? 'text-success' : 'text-destructive'}>Net</span>
            <span className={`font-bold ${data?.net >= 0 ? 'text-success' : 'text-destructive'}`}>
              {formatCurrency(data?.net || 0)}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function IncomeProjection({ payouts, expenses, revShareMonthlyAvg = 0, properties = [], syncedPayouts = [] }: IncomeProjectionProps) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<MonthData | null>(null);
  // Build available years based on synced data range
  const availableYears = useMemo(() => {
    const currentYear = now.getFullYear();
    const years = new Set<number>([currentYear]);
    
    syncedPayouts.forEach(p => {
      const d = parseISO(p.close_date);
      years.add(d.getFullYear());
    });
    
    // Also include next year if we're past mid-year
    if (now.getMonth() >= 5) years.add(currentYear + 1);
    
    return [...years].sort((a, b) => a - b);
  }, [syncedPayouts, now]);

  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const { limits, isFree } = useSubscription();
  const { data: settings } = useSettings();

  // Calculate property costs once (they're the same every month)
  const propertyCosts = useMemo(() => getPropertyCostsForMonth(properties), [properties]);

  const chartData = useMemo(() => {
    const months: MonthData[] = [];
    let cumulativeNet = 0;

    for (let m = 0; m < 12; m++) {
      const monthDate = new Date(selectedYear, m, 1);
      const monthLabel = format(monthDate, 'MMM');
      const monthStr = format(monthDate, 'yyyy-MM');
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);

      const monthSyncedPayouts = syncedPayouts.filter((p) => {
        const date = parseISO(p.close_date);
        return isWithinInterval(date, { start: monthStart, end: monthEnd });
      });

      const income = monthSyncedPayouts.reduce((sum, p) => sum + p.netAmount, 0);
      const revShareIncome = revShareMonthlyAvg;
      const propertyNet = propertyCosts.totalNet;
      const totalIncome = income + revShareIncome;
      const monthExpenses = getTotalExpensesForMonth(expenses, properties, monthStr);
      const net = totalIncome - monthExpenses;
      cumulativeNet += net;

      months.push({
        month: monthLabel,
        fullMonth: format(monthDate, 'MMMM yyyy'),
        monthStr,
        monthIndex: m,
        income,
        revShareIncome,
        propertyNet,
        totalIncome,
        expenses: monthExpenses,
        net,
        cumulativeNet,
        payouts: [],
      });
    }
    return months;
  }, [syncedPayouts, expenses, revShareMonthlyAvg, properties, propertyCosts, selectedYear]);

  const totalCommissions = chartData.reduce((sum, m) => sum + m.income, 0);
  const totalRevShare = chartData.reduce((sum, m) => sum + m.revShareIncome, 0);
  const totalPropertyNet = propertyCosts.totalNet * 12;
  const totalProjectedIncome = totalCommissions + totalRevShare;
  const totalExpenses = chartData.reduce((sum, m) => sum + m.expenses, 0);
  const netProjection = chartData.reduce((sum, m) => sum + m.net, 0);
  const hasNoCommissions = totalCommissions === 0 && totalRevShare === 0;

  const handleBarClick = (data: any) => {
    if (data?.activePayload?.[0]?.payload) {
      setSelectedMonth(data.activePayload[0].payload as MonthData);
    }
  };

  // Show empty state when there's no income data
  if (hasNoCommissions && totalExpenses === 0) {
    return (
      <div className="landing-card h-full">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="icon-gradient-primary icon-gradient-sm">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-[15px] text-foreground">
                {selectedYear} Projection
              </h3>
              <p className="text-[11px] text-muted-foreground">Income & expense forecast</p>
            </div>
          </div>
        </div>
        
        <div className="p-4 flex flex-col items-center justify-center min-h-[350px]">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            className="text-center"
          >
            <motion.div 
              className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shadow-lg"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <BarChart3 className="w-10 h-10 text-primary" />
            </motion.div>
            
            <h3 className="text-lg font-bold text-foreground mb-2">
              Your forecast awaits
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
              Add deals with expected payout dates to see your {selectedYear} income projection
            </p>
            
            <div className="space-y-3">
              <Link to="/deals/new">
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button className="btn-premium h-11 px-6 gap-2">
                    <Plus className="w-4 h-4" />
                    Add Your First Deal
                  </Button>
                </motion.div>
              </Link>
              
              <div className="flex items-center justify-center gap-4 pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-calculates tax set-asides</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-card">
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="icon-gradient-primary icon-gradient-sm">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-[15px] text-foreground">
              {selectedYear} Projection
            </h3>
            <p className="text-[11px] text-muted-foreground">Click bar for details</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Year toggle */}
          <div className="flex bg-muted rounded-lg p-0.5">
            {availableYears.map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  selectedYear === year
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
          <Link to="/forecast">
            <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/10">
              Full Forecast <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="p-4 pt-3">

      {/* Summary Stats - Compact inline */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-muted-foreground">Commissions</span>
          <span className="font-bold text-primary">{formatCurrency(totalCommissions)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-success" />
          <span className="text-muted-foreground">RevShare</span>
          <span className="font-bold text-success">{formatCurrency(totalRevShare)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Total</span>
          <span className="font-bold text-primary">{formatCurrency(totalProjectedIncome)}</span>
        </div>
        <div className="w-px h-3.5 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-destructive" />
          <span className="text-muted-foreground">Expenses</span>
          <span className="font-bold text-destructive">{formatCurrency(totalExpenses)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Net</span>
          <span className={`font-bold ${netProjection >= 0 ? 'text-success' : 'text-destructive'}`}>
            {formatCurrency(netProjection)}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} barGap={0} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
            <defs>
              <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(231, 70%, 64%)" stopOpacity={1} />
                <stop offset="100%" stopColor="hsl(231, 62%, 50%)" stopOpacity={1} />
              </linearGradient>
              <linearGradient id="revShareGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(152, 52%, 46%)" stopOpacity={1} />
                <stop offset="100%" stopColor="hsl(152, 50%, 34%)" stopOpacity={1} />
              </linearGradient>
              <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(0, 65%, 60%)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="hsl(0, 65%, 50%)" stopOpacity={0.9} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
            <XAxis
              dataKey="month"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="top"
              height={36}
              formatter={(value) => {
                if (value === 'income') return <span className="text-xs">Commissions</span>;
                if (value === 'revShareIncome') return <span className="text-xs">RevShare</span>;
                if (value === 'expenses') return <span className="text-xs">Expenses</span>;
                return value;
              }}
              iconType="circle"
              iconSize={8}
            />
            {/* Stacked income bars */}
            <Bar
              dataKey="income"
              fill="url(#incomeGradient)"
              radius={[0, 0, 0, 0]}
              maxBarSize={32}
              stackId="income"
            />
            <Bar
              dataKey="revShareIncome"
              fill="url(#revShareGradient)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
              stackId="income"
            />
            {/* Expenses bar */}
            <Bar
              dataKey="expenses"
              fill="url(#expenseGradient)"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
            {/* Net line overlay */}
            <Line
              type="monotone"
              dataKey="net"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              legendType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend note */}
      <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-border/50">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-4 h-0.5 bg-primary rounded" />
          <span>Net Income Trend</span>
        </div>
      </div>
    </div>

      {/* Month Detail Dialog */}
      <Dialog open={!!selectedMonth} onOpenChange={() => setSelectedMonth(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedMonth?.fullMonth}</DialogTitle>
          </DialogHeader>
          
          {selectedMonth && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                    <p className="text-xs text-muted-foreground">Commissions</p>
                    <p className="font-bold text-success">{formatCurrency(selectedMonth.income)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-xs text-muted-foreground">RevShare</p>
                    <p className="font-bold text-emerald-400">{formatCurrency(selectedMonth.revShareIncome)}</p>
                  </div>
                </div>
                {selectedMonth.propertyNet !== 0 && (
                  <div className={`p-3 rounded-lg border ${selectedMonth.propertyNet >= 0 ? 'bg-teal-500/10 border-teal-500/20' : 'bg-orange-500/10 border-orange-500/20'}`}>
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Home className="h-3 w-3" /> Property Net
                      </p>
                      <p className={`font-bold ${selectedMonth.propertyNet >= 0 ? 'text-teal-400' : 'text-orange-400'}`}>
                        {selectedMonth.propertyNet >= 0 ? '+' : ''}{formatCurrency(selectedMonth.propertyNet)}
                      </p>
                    </div>
                  </div>
                )}
                <div className="p-3 rounded-lg bg-gradient-to-r from-success/5 to-emerald-500/5 border border-primary/20">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">Total Income</p>
                    <p className="font-bold text-primary">{formatCurrency(selectedMonth.totalIncome)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-xs text-muted-foreground">Expenses</p>
                    <p className="font-bold text-destructive">{formatCurrency(selectedMonth.expenses)}</p>
                  </div>
                  <div className={`p-3 rounded-lg border ${selectedMonth.net >= 0 ? 'bg-accent/10 border-accent/20' : 'bg-destructive/10 border-destructive/20'}`}>
                    <p className="text-xs text-muted-foreground">Net</p>
                    <p className={`font-bold ${selectedMonth.net >= 0 ? 'text-accent' : 'text-destructive'}`}>
                      {formatCurrency(selectedMonth.net)}
                    </p>
                  </div>
                </div>
              </div>

              {/* RevShare note */}
              {selectedMonth.revShareIncome > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                  <Wallet className="h-4 w-4 text-emerald-400" />
                  <p className="text-sm text-emerald-400">
                    +{formatCurrency(selectedMonth.revShareIncome)} projected RevShare (12-mo avg)
                  </p>
                </div>
              )}

              {/* View Full Forecast */}
              <Link to="/forecast" onClick={() => setSelectedMonth(null)}>
                <Button variant="outline" className="w-full">
                  View Full Forecast <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
