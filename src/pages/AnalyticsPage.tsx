import { useMemo } from 'react';
import { DealsWrittenCard } from '@/components/dashboard/DealsWrittenCard';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, DollarSign, Building2, Target,
  Calendar, Users, MapPin, Home, UserCheck, Filter,
  BarChart3, Briefcase, ArrowUpRight, ArrowDownRight, PieChart,
  ChevronRight,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { useAnalyticsData, type TimeRange } from '@/hooks/useAnalyticsData';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useRefreshData } from '@/hooks/useRefreshData';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell,
  Area, AreaChart, ComposedChart, Line,
} from 'recharts';

const PIE_COLORS = [
  'hsl(158, 64%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(217, 91%, 60%)',
  'hsl(280, 68%, 58%)', 'hsl(0, 84%, 60%)', 'hsl(190, 90%, 50%)',
  'hsl(330, 80%, 60%)', 'hsl(90, 65%, 45%)',
];
const YEAR_COLORS = ['hsl(158, 64%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(217, 91%, 60%)', 'hsl(280, 68%, 58%)'];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

function ChangeIndicator({ current, previous, format: fmt = 'percent' }: { current: number; previous: number; format?: 'percent' | 'number' }) {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  const isPositive = change >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-semibold",
      isPositive ? "text-emerald-600" : "text-rose-600"
    )}>
      {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(change).toFixed(0)}%
    </span>
  );
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover/95 backdrop-blur-xl border border-border/50 rounded-xl p-3 shadow-xl">
      <p className="font-semibold text-sm mb-1.5">{payload[0]?.payload?.fullMonth || label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm flex items-center gap-2" style={{ color: entry.color }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: {typeof entry.value === 'number' && entry.value > 100
            ? formatCurrency(entry.value)
            : entry.value}
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const data = useAnalyticsData();
  const refreshData = useRefreshData();
  const {
    timeRange, setTimeRange, selectedYear, setSelectedYear,
    dealTypeFilter, setDealTypeFilter, cityFilter, setCityFilter,
    agentFilter, setAgentFilter,
    syncedTransactions, filteredTransactions,
    availableYears, filterDimensions, hasFilters,
    metrics, previousMetrics, teamMemberData,
    cityData, leadSourceData, presaleResaleData,
    gciTrends, dealsByMonth, revShareMonthly, revShareByTier,
    revenueShares,
  } = data;

  const subtitle = useMemo(() => {
    if (timeRange === 'year') return `${selectedYear} Performance`;
    if (timeRange === 'ytd') return `${new Date().getFullYear()} Year-to-Date`;
    if (timeRange === 'all') return 'All-Time Performance';
    return `Last ${timeRange.toUpperCase()} Performance`;
  }, [timeRange, selectedYear]);

  return (
    <AppLayout>
      <Header title="Analytics" subtitle={subtitle} />

      <PullToRefresh onRefresh={refreshData} className="min-h-[calc(100dvh-56px)]">
      <motion.div
        className="p-4 sm:p-5 md:p-6 lg:p-6 space-y-5 md:max-w-none"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ── Time Range Pills ── */}
        <motion.div variants={itemVariants} className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1">
          {(['all', 'ytd', '12m', '6m', '3m'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                "px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap",
                timeRange === range
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              {range === 'all' ? 'All' : range === 'ytd' ? 'YTD' : range.toUpperCase()}
            </button>
          ))}
          <div className="w-px h-5 bg-border mx-0.5" />
          {availableYears.map(year => (
            <button
              key={year}
              onClick={() => { setTimeRange('year'); setSelectedYear(year); }}
              className={cn(
                "px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap",
                timeRange === 'year' && selectedYear === year
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              {year}
            </button>
          ))}
        </motion.div>

        {/* ── Filters ── */}
        <motion.div variants={itemVariants} className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          <div className="flex items-center gap-1 shrink-0">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Filter:</span>
          </div>
          <Select value={dealTypeFilter} onValueChange={(v: any) => setDealTypeFilter(v)}>
            <SelectTrigger className="w-[105px] h-8 rounded-full bg-muted/30 border-border/30 text-xs shrink-0">
              <Home className="h-3 w-3 mr-1 text-muted-foreground/50 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-lg">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="presale">Presale</SelectItem>
              <SelectItem value="resale">Resale</SelectItem>
            </SelectContent>
          </Select>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[120px] h-8 rounded-full bg-muted/30 border-border/30 text-xs shrink-0">
              <MapPin className="h-3 w-3 mr-1 text-muted-foreground/50 shrink-0" />
              <SelectValue placeholder="All Cities" />
            </SelectTrigger>
            <SelectContent className="rounded-lg max-h-[300px]">
              <SelectItem value="all">All Cities</SelectItem>
              {filterDimensions.cities.map(c => (
                <SelectItem key={c.name} value={c.name}>{c.name} ({c.count})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filterDimensions.agents.length > 1 && (
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[140px] h-8 rounded-full bg-muted/30 border-border/30 text-xs shrink-0">
                <UserCheck className="h-3 w-3 mr-1 text-muted-foreground/50 shrink-0" />
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent className="rounded-lg max-h-[300px]">
                <SelectItem value="all">All Agents</SelectItem>
                {filterDimensions.agents.map(a => (
                  <SelectItem key={a.name} value={a.name}>{a.name} ({a.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {hasFilters && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => { setDealTypeFilter('all'); setCityFilter('all'); setAgentFilter('all'); }}
                className="text-xs text-primary hover:underline font-medium"
              >
                Clear
              </button>
              <span className="text-[10px] text-muted-foreground">
                {filteredTransactions.length}/{syncedTransactions.length}
              </span>
            </div>
          )}
        </motion.div>

        {/* ── Hero Stats ── */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {/* Total Deals */}
          <div className="landing-card p-3 sm:p-4">
            <p className="metric-label mb-2">All Deals</p>
            <div className="flex items-baseline gap-2">
              <AnimatedNumber value={metrics.totalDeals} className="text-xl sm:text-2xl font-bold text-foreground" duration={1} />
              <ChangeIndicator current={metrics.totalDeals} previous={previousMetrics.totalDeals} />
            </div>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-1">
              {metrics.closedDeals} closed · {metrics.activeDeals} pending
            </p>
          </div>

          {/* Earned */}
          <div className="landing-card p-3 sm:p-4">
            <p className="metric-label mb-2">Earned (Closed)</p>
            <div className="flex items-baseline gap-2">
              <AnimatedNumber value={metrics.closedEffectiveCommission} className="text-xl sm:text-2xl font-bold text-success" duration={1.2} />
              <ChangeIndicator current={metrics.closedEffectiveCommission} previous={previousMetrics.totalGCI} />
            </div>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-1">From {metrics.closedDeals} closed deals</p>
          </div>

          {/* Pipeline */}
          <div className="landing-card p-3 sm:p-4">
            <p className="metric-label mb-2">Pending</p>
            <AnimatedNumber value={metrics.activeEffectiveCommission} className="text-xl sm:text-2xl font-bold text-foreground" duration={1.2} />
            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-1">{metrics.activeDeals} pending deals</p>
          </div>

          {/* Avg Sale Price */}
          <div className="landing-card p-3 sm:p-4">
            <p className="metric-label mb-2">Avg Price</p>
            <AnimatedNumber value={metrics.avgSalePrice} className="text-xl sm:text-2xl font-bold text-foreground" duration={1.2} />
            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-1">Per transaction</p>
          </div>

          {/* Avg Commission */}
          <div className="landing-card p-3 sm:p-4">
            <p className="metric-label mb-2">Avg Comm.</p>
            <AnimatedNumber value={metrics.avgCommission} className="text-xl sm:text-2xl font-bold text-foreground" duration={1.2} />
            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-1">Per deal (effective)</p>
          </div>
        </motion.div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="overview" className="space-y-4">
          <motion.div variants={itemVariants}>
            <TabsList className="w-full flex h-9 p-0.5 bg-muted/30 rounded-xl border border-border/30">
              <TabsTrigger value="overview" className="flex-1 text-xs sm:text-sm font-medium px-1.5 sm:px-3 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm whitespace-nowrap">Overview</TabsTrigger>
              <TabsTrigger value="sources" className="flex-1 text-xs sm:text-sm font-medium px-1.5 sm:px-3 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm whitespace-nowrap">Sources</TabsTrigger>
              <TabsTrigger value="deals" className="flex-1 text-xs sm:text-sm font-medium px-1.5 sm:px-3 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm whitespace-nowrap">Deal Flow</TabsTrigger>
              <TabsTrigger value="team" className="flex-1 text-xs sm:text-sm font-medium px-1.5 sm:px-3 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm whitespace-nowrap">Team</TabsTrigger>
              <TabsTrigger value="revshare" className="flex-1 text-xs sm:text-sm font-medium px-1.5 sm:px-3 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm whitespace-nowrap">RevShare</TabsTrigger>
            </TabsList>
          </motion.div>

          {/* ═══ OVERVIEW ═══ */}
          <TabsContent value="overview" className="space-y-4">
            {/* GCI Trend */}
            <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">GCI Trend</h3>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Monthly + cumulative effective commission (all deals)</p>
                </div>
              </div>
              <div className="h-52 sm:h-64 lg:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={gciTrends}>
                    <defs>
                      <linearGradient id="gciBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(158, 64%, 42%)" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="hsl(158, 64%, 42%)" stopOpacity={0.6} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} width={50} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="gci" name="Monthly GCI" fill="url(#gciBarGrad)" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke="hsl(38, 92%, 50%)" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-5 mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(158, 64%, 42%)' }} />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">Monthly GCI</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(38, 92%, 50%)' }} />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">Cumulative</span>
                </div>
              </div>
            </motion.div>

            {/* Presale vs Resale */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {presaleResaleData.comparisonData.map(type => (
                <div
                  key={type.name}
                  className={cn(
                    "landing-card p-4 cursor-pointer transition-all hover:shadow-md",
                    type.name === 'Presale'
                      ? "bg-gradient-to-br from-blue-500/8 to-indigo-500/3 border-blue-500/15"
                      : "bg-gradient-to-br from-amber-500/8 to-orange-500/3 border-amber-500/15"
                  )}
                  onClick={() => setDealTypeFilter(type.name.toLowerCase() as 'presale' | 'resale')}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{type.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-2xl font-bold">{type.count}</p>
                      <p className="text-[10px] text-muted-foreground">All Deals</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-primary">{formatCurrency(type.gci)}</p>
                      <p className="text-[10px] text-muted-foreground">Total GCI</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{formatCurrency(type.avgCommission)}</p>
                      <p className="text-[10px] text-muted-foreground">Avg Commission</p>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          </TabsContent>

          {/* ═══ SOURCES ═══ */}
          <TabsContent value="sources" className="space-y-4">
            {/* Missing Data Banner */}
            {(() => {
              const missingLeadSource = filteredTransactions.filter(tx => !tx.lead_source).length;
              const missingBuyerType = filteredTransactions.filter(tx => !tx.buyer_type).length;
              const missingCity = filteredTransactions.filter(tx => !tx.city).length;
              const totalMissing = missingLeadSource + missingBuyerType + missingCity;
              if (totalMissing === 0) return null;
              return (
                <motion.div variants={itemVariants} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
                  <span className="text-amber-600 font-medium">⚠ {totalMissing} missing fields across your deals</span>
                  <span className="text-muted-foreground">
                    ({missingLeadSource > 0 && `${missingLeadSource} lead sources`}
                    {missingBuyerType > 0 && `${missingLeadSource > 0 ? ', ' : ''}${missingBuyerType} buyer types`}
                    {missingCity > 0 && `${(missingLeadSource + missingBuyerType) > 0 ? ', ' : ''}${missingCity} cities`})
                  </span>
                  <a href="/deals" className="ml-auto text-primary font-semibold hover:underline whitespace-nowrap">Update Deals →</a>
                </motion.div>
              );
            })()}

            {/* Compact Breakdown Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Lead Sources */}
              <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4">
                <h3 className="metric-label mb-2">Lead Sources</h3>
                {leadSourceData.filter(s => s.name !== 'Unknown').length > 0 ? (
                  <div className="space-y-1.5">
                    {leadSourceData.filter(s => s.name !== 'Unknown').slice(0, 5).map((source, i) => (
                      <div key={source.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-muted-foreground truncate max-w-[80px]">{source.name}</span>
                        </div>
                        <span className="font-semibold">{source.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground py-3">
                    <a href="/deals" className="text-primary hover:underline">Add lead sources</a> to your deals
                  </p>
                )}
              </motion.div>

              {/* Property Types (Presale vs Resale) */}
              <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4">
                <h3 className="metric-label mb-2">Property Types</h3>
                {presaleResaleData.presale.count + presaleResaleData.resale.count > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-muted-foreground">Presale</span>
                      </div>
                      <span className="font-semibold">{presaleResaleData.presale.count}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-muted-foreground">Resale</span>
                      </div>
                      <span className="font-semibold">{presaleResaleData.resale.count}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(presaleResaleData.presale.count / (presaleResaleData.presale.count + presaleResaleData.resale.count)) * 100}%` }} />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground py-3">No data yet</p>
                )}
              </motion.div>

              {/* Client Type (Buyer vs Seller) */}
              <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4">
                <h3 className="metric-label mb-2">
                  Client Type
                </h3>
                {(() => {
                  const buyers = filteredTransactions.filter(tx => !tx.is_listing).length;
                  const sellers = filteredTransactions.filter(tx => tx.is_listing).length;
                  const total = buyers + sellers;
                  if (total === 0) return <p className="text-[11px] text-muted-foreground py-3">No data yet</p>;
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'hsl(217, 91%, 60%)' }} />
                          <span className="text-muted-foreground">Buyers</span>
                        </div>
                        <span className="font-semibold">{buyers}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'hsl(38, 92%, 50%)' }} />
                          <span className="text-muted-foreground">Sellers</span>
                        </div>
                        <span className="font-semibold">{sellers}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                        <div className="h-full rounded-full" style={{ width: `${(buyers / total) * 100}%`, backgroundColor: 'hsl(217, 91%, 60%)' }} />
                      </div>
                    </div>
                  );
                })()}
              </motion.div>

              {/* Buyer Type */}
              <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4">
                <h3 className="metric-label mb-2">Buyer Type</h3>
                {(() => {
                  const types: Record<string, number> = {};
                  filteredTransactions.forEach(tx => {
                    const t = tx.buyer_type || null;
                    if (t) types[t] = (types[t] || 0) + 1;
                  });
                  const entries = Object.entries(types).sort((a, b) => b[1] - a[1]);
                  if (entries.length === 0) return (
                    <p className="text-[11px] text-muted-foreground py-3">
                      <a href="/deals" className="text-primary hover:underline">Add buyer types</a> to your deals
                    </p>
                  );
                  return (
                    <div className="space-y-1.5">
                      {entries.map(([name, count], i) => (
                        <div key={name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-muted-foreground">{name}</span>
                          </div>
                          <span className="font-semibold">{count}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </motion.div>

              {/* Cities */}
              <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4">
                <h3 className="metric-label mb-2">Cities</h3>
                {cityData.length > 0 ? (
                  <div className="space-y-1.5">
                    {cityData.slice(0, 5).map((city, i) => (
                      <div key={city.name} className="flex items-center justify-between text-xs cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1 py-0.5" onClick={() => setCityFilter(city.name)}>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-muted-foreground truncate max-w-[80px]">{city.name}</span>
                        </div>
                        <span className="font-semibold">{city.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground py-3">No data yet</p>
                )}
              </motion.div>

              {/* Solo vs Team */}
              <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4">
                <h3 className="metric-label mb-2">Solo vs Team</h3>
                {metrics.soloDeals + metrics.teamDeals > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'hsl(158, 64%, 42%)' }} />
                        <span className="text-muted-foreground">Solo</span>
                      </div>
                      <span className="font-semibold">{metrics.soloDeals}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'hsl(217, 91%, 60%)' }} />
                        <span className="text-muted-foreground">Team</span>
                      </div>
                      <span className="font-semibold">{metrics.teamDeals}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                      <div className="h-full rounded-full" style={{ width: `${(metrics.soloDeals / (metrics.soloDeals + metrics.teamDeals)) * 100}%`, backgroundColor: 'hsl(158, 64%, 42%)' }} />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground py-3">No data yet</p>
                )}
              </motion.div>
            </div>

            {/* City Performance Table */}
            <motion.div variants={itemVariants} className="landing-card overflow-hidden">
              <div className="p-3 sm:p-4 border-b border-border">
                <h3 className="text-xs sm:text-sm font-semibold">City Performance</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Average price & commission by market (all deals)</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/30">
                {cityData.map(city => (
                  <div
                    key={city.name}
                    className="p-3 sm:p-4 bg-card cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setCityFilter(city.name)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">{city.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{city.value} total deals</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground text-[10px]">Closed</p>
                        <p className="font-semibold">{city.closedCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px]">Avg Price</p>
                        <p className="font-semibold">{city.avgPrice > 0 ? formatCurrency(city.avgPrice) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[10px]">GCI</p>
                        <p className="font-semibold text-primary">{formatCurrency(city.totalGCI)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </TabsContent>

          {/* ═══ DEAL FLOW ═══ */}
          <TabsContent value="deals" className="space-y-4">
            {/* Deals Written Tracker */}
            <motion.div variants={itemVariants}>
              <DealsWrittenCard syncedTransactions={filteredTransactions} />
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-4">
              {/* Deals by Month */}
              <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4 lg:p-6">
                <h3 className="text-sm font-semibold text-foreground mb-0.5">Deals by Month</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-3">Closed vs pending by firm date</p>
                <div className="h-56 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dealsByMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="closed" name="Closed" stackId="a" fill="hsl(158, 64%, 42%)" opacity={0.85} />
                      <Bar dataKey="pending" name="Pending" stackId="a" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} opacity={0.85} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-5 mt-3 pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(158, 64%, 42%)' }} />
                    <span className="text-[10px] sm:text-xs text-muted-foreground">Closed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(38, 92%, 50%)' }} />
                    <span className="text-[10px] sm:text-xs text-muted-foreground">Pending</span>
                  </div>
                </div>
              </motion.div>

              {/* Monthly GCI Area */}
              <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4 lg:p-6">
                <h3 className="text-sm font-semibold text-foreground mb-0.5">Monthly GCI</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground mb-3">Commission earned from closed deals</p>
                <div className="h-56 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dealsByMonth}>
                      <defs>
                        <linearGradient id="gciAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(158, 64%, 42%)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="hsl(158, 64%, 42%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} width={50} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="gci" name="GCI" stroke="hsl(158, 64%, 42%)" fill="url(#gciAreaGrad)" strokeWidth={2.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            </div>
          </TabsContent>

          {/* ═══ TEAM ═══ */}
          <TabsContent value="team" className="space-y-4">
            {/* Team Summary Stats */}
            <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {[
                { label: 'Solo', value: metrics.soloDeals },
                { label: 'Team', value: metrics.teamDeals },
                { label: 'Members', value: teamMemberData.length },
                { label: 'Team Rev', value: formatCurrency(teamMemberData.reduce((s, m) => s + m.userPortion, 0)) },
              ].map(stat => (
                <div key={stat.label} className="landing-card p-3 sm:p-4">
                  <p className="metric-label mb-1">{stat.label}</p>
                  <p className="text-lg sm:text-xl font-bold">{stat.value}</p>
                </div>
              ))}
            </motion.div>

            {teamMemberData.length > 0 ? (
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Performance Chart */}
                <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4 lg:p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-0.5">GCI Split</h3>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-3">Your portion vs theirs</p>
                  <div className="h-56 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={teamMemberData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
                        <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="userPortion" name="Your Portion" stackId="a" fill="hsl(158, 64%, 42%)" opacity={0.85} />
                        <Bar dataKey="teamPortion" name="Their Portion" stackId="a" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} opacity={0.85} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-5 mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(158, 64%, 42%)' }} />
                      <span className="text-[10px] sm:text-xs text-muted-foreground">Your Portion</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(217, 91%, 60%)' }} />
                      <span className="text-[10px] sm:text-xs text-muted-foreground">Their Portion</span>
                    </div>
                  </div>
                </motion.div>

                {/* Team Member Cards */}
                <motion.div variants={itemVariants} className="space-y-2 sm:space-y-3">
                  {teamMemberData.map(member => (
                    <div key={member.name} className="landing-card p-3 sm:p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm">{member.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          {member.deals} deals ({member.closedDeals} closed)
                        </span>
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Total GCI</p>
                          <p className="font-bold">{formatCurrency(member.totalGCI)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Your Share</p>
                          <p className="font-bold text-emerald-600">{formatCurrency(member.userPortion)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Their Share</p>
                          <p className="font-bold">{formatCurrency(member.teamPortion)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Avg Deal</p>
                          <p className="font-bold">{formatCurrency(member.avgDeal)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              </div>
            ) : (
              <motion.div variants={itemVariants} className="landing-card p-12 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-muted-foreground text-sm">No team deals found in this period</p>
              </motion.div>
            )}
          </TabsContent>

          {/* ═══ REVSHARE ═══ */}
          <TabsContent value="revshare" className="space-y-4">
            {revenueShares.length === 0 ? (
              <motion.div variants={itemVariants} className="landing-card p-12 text-center">
                <DollarSign className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-muted-foreground text-sm">No revenue share data yet</p>
              </motion.div>
            ) : (
              <>
                {/* Yearly Totals */}
                <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                  {revShareMonthly.yearlyTotals.map((yt, i) => (
                    <div key={yt.year} className="landing-card p-3 sm:p-4 bg-gradient-to-br from-emerald-500/8 to-teal-500/3 border-emerald-500/15">
                      <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{yt.year}</span>
                      <AnimatedNumber value={yt.total} className="text-lg sm:text-xl font-bold text-emerald-600 mt-1" duration={1} />
                    </div>
                  ))}
                </motion.div>

                {/* YoY Comparison Chart */}
                <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4 lg:p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-0.5">RevShare by Month</h3>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-3">Year-over-year comparison</p>
                  <div className="h-56 sm:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revShareMonthly.chartData} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(0)}`} tickLine={false} axisLine={false} width={50} />
                        <Tooltip content={<ChartTooltip />} />
                        {revShareMonthly.years.map((year, i) => (
                          <Bar key={year} dataKey={year} name={year} fill={YEAR_COLORS[i % YEAR_COLORS.length]} radius={[3, 3, 0, 0]} opacity={0.85} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-5 mt-3 pt-3 border-t border-border">
                    {revShareMonthly.years.map((year, i) => (
                      <div key={year} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: YEAR_COLORS[i % YEAR_COLORS.length] }} />
                        <span className="text-[10px] sm:text-xs text-muted-foreground">{year}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Cumulative + Tier */}
                <div className="grid lg:grid-cols-2 gap-4">
                  <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4 lg:p-6">
                    <h3 className="text-sm font-semibold text-foreground mb-0.5">Cumulative RevShare</h3>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mb-3">All-time growth</p>
                    {(() => {
                      const sorted = [...revenueShares].filter(r => r.period && r.period !== 'unknown').sort((a, b) => a.period.localeCompare(b.period));
                      let cum = 0;
                      const trendData = sorted.map(r => {
                        cum += Number(r.amount);
                        const [y, m] = r.period.split('-');
                        return { period: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m) - 1]} ${y.slice(2)}`, cumulative: cum };
                      });
                      return (
                        <div className="h-52 sm:h-60">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData}>
                              <defs>
                                <linearGradient id="cumRevGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="hsl(158, 64%, 42%)" stopOpacity={0.3} />
                                  <stop offset="95%" stopColor="hsl(158, 64%, 42%)" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                              <XAxis dataKey="period" tick={{ fontSize: 9 }} interval={Math.max(0, Math.floor(trendData.length / 8))} tickLine={false} axisLine={false} />
                              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(0)}`} tickLine={false} axisLine={false} width={50} />
                              <Tooltip content={<ChartTooltip />} />
                              <Area type="monotone" dataKey="cumulative" name="Cumulative" stroke="hsl(158, 64%, 42%)" fill="url(#cumRevGrad)" strokeWidth={2.5} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}
                  </motion.div>

                  {revShareByTier.length > 0 && (
                    <motion.div variants={itemVariants} className="landing-card p-3 sm:p-4 lg:p-6">
                      <h3 className="text-sm font-semibold text-foreground mb-0.5">By Tier</h3>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mb-3">Earned vs missed by tier</p>
                      <div className="h-48 sm:h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={revShareByTier} layout="vertical" barGap={2}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
                            <YAxis type="category" dataKey="tier" tick={{ fontSize: 11 }} width={50} tickLine={false} axisLine={false} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="earned" name="Earned" fill="hsl(158, 64%, 42%)" radius={[0, 4, 4, 0]} opacity={0.85} />
                            <Bar dataKey="missed" name="Missed" fill="hsl(0, 84%, 60%)" radius={[0, 4, 4, 0]} opacity={0.5} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                        {revShareByTier.map((t: any) => (
                          <div key={t.tier} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{t.tier}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-muted-foreground">{t.contributors} agents</span>
                              <span className="font-semibold text-emerald-600">{formatCurrency(t.earned)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
      </PullToRefresh>
    </AppLayout>
  );
}
