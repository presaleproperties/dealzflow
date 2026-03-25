import { useMemo, useState } from 'react';
import { isTeamDeal as checkIsTeamDeal } from '@/lib/transactionUtils';
import { getEffectiveCommission } from '@/hooks/useAnalyticsData';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Building2, 
  MapPin, 
  Target,
  DollarSign,
  Calendar,
  Briefcase,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Deal, Payout } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart
} from 'recharts';
import { cn } from '@/lib/utils';
import { format, parseISO, startOfMonth, subMonths, isWithinInterval, endOfMonth } from 'date-fns';
import { SyncedPayout } from '@/hooks/useSyncedIncome';

interface BusinessAnalyticsProps {
  deals: Deal[];
  payouts: Payout[];
  syncedPayouts?: SyncedPayout[];
  syncedTransactions?: any[];
}

const CHART_PALETTE = [
  'hsl(231, 62%, 58%)',   // primary indigo
  'hsl(152, 50%, 36%)',   // success green
  'hsl(210, 62%, 52%)',   // info blue
  'hsl(270, 48%, 56%)',   // violet
  'hsl(38, 90%, 52%)',    // warning amber
  'hsl(0, 65%, 52%)',     // destructive red
];

const CHART_COLORS = {
  primary: 'hsl(231, 62%, 58%)',
  secondary: 'hsl(210, 62%, 52%)',
  tertiary: 'hsl(152, 50%, 36%)',
  muted: 'hsl(var(--muted-foreground))',
};

type TimeFilter = 'all' | 'ytd' | '12m' | '6m' | '3m';

export function BusinessAnalytics({ deals, payouts, syncedPayouts = [], syncedTransactions = [] }: BusinessAnalyticsProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

  const filteredDeals = useMemo(() => {
    if (timeFilter === 'all') return deals;
    
    const now = new Date();
    let startDate: Date;
    
    switch (timeFilter) {
      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case '12m':
        startDate = subMonths(now, 12);
        break;
      case '6m':
        startDate = subMonths(now, 6);
        break;
      case '3m':
        startDate = subMonths(now, 3);
        break;
      default:
        return deals;
    }
    
    return deals.filter(deal => {
      const dealDate = deal.close_date_actual || deal.close_date_est || deal.pending_date;
      if (!dealDate) return false;
      return new Date(dealDate) >= startDate;
    });
  }, [deals, timeFilter]);

  const analytics = useMemo(() => {
    // Overview metrics
    const totalDeals = filteredDeals.length;
    const closedDeals = filteredDeals.filter(d => d.status === 'CLOSED').length;
    const pendingDeals = filteredDeals.filter(d => d.status === 'PENDING').length;
    
    // Get all payouts associated with filtered deals
    const relevantPayouts = payouts.filter(p => 
      filteredDeals.some(d => d.id === p.deal_id)
    );
    
    const paidPayouts = relevantPayouts.filter(p => p.status === 'PAID');
    const totalRevenue = paidPayouts.reduce((sum, p) => sum + Number(p.amount), 0);
    
    const projectedPayouts = relevantPayouts.filter(p => p.status !== 'PAID');
    const projectedRevenue = projectedPayouts.reduce((sum, p) => sum + Number(p.amount), 0);
    
    // Synced transaction totals
    const syncedReceived = syncedPayouts.filter(p => p.status === 'closed').reduce((sum, p) => sum + p.netAmount, 0);
    const syncedProjected = syncedPayouts.filter(p => p.status === 'active').reduce((sum, p) => sum + p.netAmount, 0);
    const syncedTotal = syncedReceived + syncedProjected;
    
    // Calculate total expected commission from deals + synced
    const manualExpectedCommission = filteredDeals.reduce((sum, deal) => {
      return sum + Number(deal.gross_commission_est || 0);
    }, 0);
    const totalExpectedCommission = manualExpectedCommission + syncedTotal;
    
    // Average commission based on all deals
    const totalDealCount = totalDeals + syncedPayouts.length;
    const avgCommission = totalDealCount > 0 ? totalExpectedCommission / totalDealCount : 0;

    // Helper to get deal's total value (user's portion for team deals)
    const getDealValue = (deal: Deal) => {
      const dealPayouts = payouts.filter(p => p.deal_id === deal.id);
      if (dealPayouts.length > 0) {
        // Payouts already have user's portion applied
        return dealPayouts.reduce((sum, p) => sum + Number(p.amount), 0);
      }
      // Fallback to gross commission, applying user's portion for team deals
      // team_member_portion stores team member's % (default 70%), user gets (100 - 70) = 30%
      const grossCommission = Number(deal.gross_commission_est || 0);
      if (deal.team_member && deal.team_member_portion && deal.team_member_portion > 0) {
        const userPortionPercent = 100 - deal.team_member_portion;
        return grossCommission * (userPortionPercent / 100);
      }
      return grossCommission;
    };

    // Helper to accumulate into a map
    const accum = (map: Map<string, { count: number; revenue: number }>, key: string, value: number) => {
      const existing = map.get(key) || { count: 0, revenue: 0 };
      map.set(key, { count: existing.count + 1, revenue: existing.revenue + value });
    };

    // Lead source breakdown - combine manual deals + synced transactions
    const leadSourceMap = new Map<string, { count: number; revenue: number }>();
    filteredDeals.forEach(deal => accum(leadSourceMap, deal.lead_source || 'Unknown', getDealValue(deal)));
    syncedTransactions.forEach((tx: any) => accum(leadSourceMap, tx.lead_source || 'Unknown', getEffectiveCommission(tx)));
    const leadSources = Array.from(leadSourceMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue);

    // Property type breakdown — classify as Presale vs Resale
    const propertyTypeMap = new Map<string, { count: number; revenue: number }>();
    filteredDeals.forEach(deal => {
      const label = deal.property_type === 'PRESALE' ? 'Presale' : deal.property_type === 'RESALE' ? 'Resale' : deal.property_type || 'Unknown';
      accum(propertyTypeMap, label, getDealValue(deal));
    });
    syncedTransactions.forEach((tx: any) => {
      const addr = (tx.property_address || '').toLowerCase();
      const hasPartLabel = addr.includes('part 1/2') || addr.includes('part 2/2') || addr.includes('part 3/3');
      const hasProjectName = !!(tx.raw_data?.projectName || tx.project_name);
      const label = (hasPartLabel || hasProjectName) ? 'Presale' : 'Resale';
      accum(propertyTypeMap, label, getEffectiveCommission(tx));
    });
    const propertyTypes = Array.from(propertyTypeMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);

    // Deal type (Buy vs Sell) - manual + synced
    const dealTypeMap = new Map<string, { count: number; revenue: number }>();
    filteredDeals.forEach(deal => accum(dealTypeMap, deal.deal_type, getDealValue(deal)));
    syncedTransactions.forEach((tx: any) => {
      const type = tx.is_listing ? 'SELL' : 'BUY';
      accum(dealTypeMap, type, getEffectiveCommission(tx));
    });
    const dealTypes = Array.from(dealTypeMap.entries())
      .map(([name, data]) => ({ name: name === 'BUY' ? 'Buyer Rep' : 'Seller Rep', ...data }))
      .sort((a, b) => b.count - a.count);

    // Buyer type breakdown
    const buyerTypeMap = new Map<string, { count: number; revenue: number }>();
    filteredDeals.forEach(deal => accum(buyerTypeMap, deal.buyer_type || 'Not Specified', getDealValue(deal)));
    syncedTransactions.forEach((tx: any) => accum(buyerTypeMap, tx.buyer_type || 'Not Specified', getEffectiveCommission(tx)));
    const buyerTypes = Array.from(buyerTypeMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);

    // City breakdown
    const cityMap = new Map<string, { count: number; revenue: number }>();
    filteredDeals.forEach(deal => accum(cityMap, deal.city || 'Unknown', getDealValue(deal)));
    syncedTransactions.forEach((tx: any) => accum(cityMap, tx.city || 'Unknown', getEffectiveCommission(tx)));
    const cities = Array.from(cityMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);

    // Team breakdown - manual + synced
    const teamMap = new Map<string, { count: number; revenue: number }>();
    filteredDeals.forEach(deal => {
      const isTeam = deal.team_member && deal.team_member_portion && deal.team_member_portion > 0;
      accum(teamMap, isTeam ? 'Team Deals' : 'Solo Deals', getDealValue(deal));
    });
    syncedTransactions.forEach((tx: any) => {
      const participants = tx.raw_data?.participants || [];
      const isTeam = checkIsTeamDeal(participants);
      accum(teamMap, isTeam ? 'Team Deals' : 'Solo Deals', getEffectiveCommission(tx));
    });
    const teamBreakdown = Array.from(teamMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);

    // Monthly trend data (last 12 months) - manual deals + synced transactions
    const monthlyData: { month: string; deals: number; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(new Date(), i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      
      const monthDeals = filteredDeals.filter(deal => {
        const dealDate = deal.close_date_actual || deal.completion_date || deal.close_date_est || deal.pending_date;
        if (!dealDate) return false;
        return isWithinInterval(new Date(dealDate), { start: monthStart, end: monthEnd });
      });
      
      const manualRevenue = monthDeals.reduce((sum, deal) => {
        return sum + getDealValue(deal);
      }, 0);

      // Synced transaction income for this month
      const syncedRevenue = syncedPayouts
        .filter(p => {
          const date = parseISO(p.close_date);
          return isWithinInterval(date, { start: monthStart, end: monthEnd });
        })
        .reduce((sum, p) => sum + p.netAmount, 0);
      
      monthlyData.push({
        month: format(monthDate, 'MMM'),
        deals: monthDeals.length,
        revenue: manualRevenue + syncedRevenue,
      });
    }

    return { 
      totalDeals: totalDealCount, 
      closedDeals, 
      pendingDeals,
      totalRevenue: totalRevenue + syncedReceived, 
      avgCommission,
      projectedRevenue: projectedRevenue + syncedProjected,
      totalExpectedCommission,
      leadSources, 
      propertyTypes, 
      dealTypes,
      buyerTypes,
      cities,
      teamBreakdown,
      monthlyData,
    };
  }, [filteredDeals, payouts, syncedPayouts, syncedTransactions]);

  const renderCustomLabel = ({ name, percent }: { name: string; percent: number }) => {
    return percent > 0.08 ? `${(percent * 100).toFixed(0)}%` : '';
  };

  const StatCard = ({ 
    icon: Icon, 
    label, 
    value, 
    subValue,
    trend,
    color = 'primary'
  }: { 
    icon: React.ElementType; 
    label: string; 
    value: string; 
    subValue?: string;
    trend?: 'up' | 'down' | 'neutral';
    color?: 'primary' | 'secondary' | 'warning';
  }) => (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-ios">
      <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/5" />
      <div className="relative">
        <div className={cn(
          "inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3",
          color === 'primary' && "bg-primary/10 text-primary",
          color === 'secondary' && "bg-accent/10 text-accent",
          color === 'warning' && "bg-warning/10 text-warning",
        )}>
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {trend && (
            <span className={cn(
              "inline-flex items-center text-xs font-medium",
              trend === 'up' && "text-success",
              trend === 'down' && "text-destructive",
            )}>
              {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            </span>
          )}
        </div>
        {subValue && (
          <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
        )}
      </div>
    </div>
  );

  const BreakdownCard = ({ 
    icon: Icon, 
    title, 
    data,
    showRevenue = true,
    emptyMessage = "No data yet"
  }: { 
    icon: React.ElementType; 
    title: string; 
    data: { name: string; count: number; revenue: number }[];
    showRevenue?: boolean;
    emptyMessage?: string;
  }) => (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-ios">
      <div className="flex items-center gap-2 mb-4">
        <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-semibold">{title}</h3>
      </div>
      {data.length > 0 ? (
        <>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey={showRevenue ? "revenue" : "count"}
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  label={renderCustomLabel}
                  labelLine={false}
                >
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    showRevenue ? formatCurrency(value) : `${value} deals`, 
                    name
                  ]}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-2">
            {data.slice(0, 4).map((item, i) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2.5 h-2.5 rounded-full" 
                    style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }} 
                  />
                  <span className="text-muted-foreground truncate max-w-[100px]">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs bg-muted px-1.5 py-0.5 rounded">
                    {item.count}
                  </span>
                  {showRevenue && (
                    <span className="font-semibold text-xs">{formatCurrency(item.revenue)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="h-36 flex items-center justify-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header with Time Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Business Analytics
          </h2>
           <p className="text-sm text-muted-foreground mt-1">
            All deals (written &amp; closed) · By close date
          </p>
        </div>
        
        {/* Time Filter Pills */}
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl">
          {(['all', 'ytd', '12m', '6m', '3m'] as TimeFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setTimeFilter(filter)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                timeFilter === filter
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {filter === 'all' ? 'All Time' : filter.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Briefcase}
          label="Total Deals"
          value={analytics.totalDeals.toString()}
          subValue={`${analytics.closedDeals} closed · ${analytics.pendingDeals} pending (all statuses)`}
        />
        <StatCard
          icon={DollarSign}
          label="Total GCI"
          value={formatCurrency(analytics.totalExpectedCommission)}
          subValue={`${formatCurrency(analytics.totalRevenue)} received (closed)`}
          color="primary"
        />
        <StatCard
          icon={Target}
          label="Avg Commission"
          value={formatCurrency(analytics.avgCommission)}
          subValue="Per deal (GCI)"
          color="secondary"
        />
        <StatCard
          icon={TrendingUp}
          label="Pipeline"
          value={formatCurrency(analytics.projectedRevenue)}
          subValue="Pending payouts"
          color="warning"
        />
      </div>

      {/* Monthly Trend Chart */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-ios">
        <div className="flex items-center gap-2 mb-4">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-semibold">Monthly Performance <span className="text-xs font-normal text-muted-foreground">(by close date)</span></h3>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
                formatter={(value: number, name: string) => [
                  name === 'revenue' ? formatCurrency(value) : value,
                  name === 'revenue' ? 'Revenue' : 'Deals'
                ]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={CHART_COLORS.primary}
                strokeWidth={2}
                fill="url(#revenueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Breakdown Charts Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <BreakdownCard
          icon={Users}
          title="Lead Sources"
          data={analytics.leadSources}
          emptyMessage="Add lead sources to your deals"
        />
        <BreakdownCard
          icon={Building2}
          title="Property Types"
          data={analytics.propertyTypes}
        />
        <BreakdownCard
          icon={PieChartIcon}
          title="Client Type"
          data={analytics.dealTypes}
          showRevenue={false}
        />
        <BreakdownCard
          icon={Target}
          title="Buyer Type"
          data={analytics.buyerTypes}
          emptyMessage="Add buyer types to your deals"
        />
        <BreakdownCard
          icon={MapPin}
          title="Cities"
          data={analytics.cities}
        />
        <BreakdownCard
          icon={Briefcase}
          title="Solo vs Team"
          data={analytics.teamBreakdown}
        />
      </div>

      {/* Top Lead Sources Bar Chart */}
      {analytics.leadSources.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-ios">
          <div className="flex items-center gap-2 mb-4">
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-semibold">Revenue by Lead Source</h3>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={analytics.leadSources.slice(0, 6)} 
                layout="vertical"
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis 
                  type="number"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <YAxis 
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
                <Bar 
                  dataKey="revenue" 
                  fill={CHART_COLORS.primary}
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
