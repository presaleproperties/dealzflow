import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { useNetworkAgents, useNetworkSummary } from '@/hooks/useNetworkData';
import { useRevenueShare } from '@/hooks/usePlatformConnections';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentDirectory } from '@/components/network/AgentDirectory';
import { SponsorTree } from '@/components/network/SponsorTree';
import { TopPerformers } from '@/components/network/TopPerformers';
import { Users, TrendingUp, Layers, Clock, DollarSign, UserPlus, UserMinus, Network, Trophy, GitBranch, BarChart3 } from 'lucide-react';
import { useMemo, useState, useCallback } from 'react';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area,
} from 'recharts';

const TIER_COLORS = [
  'hsl(158, 64%, 32%)',
  'hsl(175, 60%, 38%)',
  'hsl(38, 75%, 50%)',
  'hsl(280, 60%, 50%)',
  'hsl(200, 70%, 50%)',
];

const TIER_LABELS: Record<number, string> = {
  1: 'Tier 1',
  2: 'Tier 2',
  3: 'Tier 3',
  4: 'Tier 4',
  5: 'Tier 5',
};

export default function NetworkPage() {
  const { data: agents = [], isLoading: agentsLoading } = useNetworkAgents();
  const { data: summary } = useNetworkSummary();
  const { data: revenueShare = [] } = useRevenueShare();
  const [activeTab, setActiveTab] = useState('overview');
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['network-agents'] }),
      queryClient.invalidateQueries({ queryKey: ['network-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['revenue-share'] }),
    ]);
    await new Promise(resolve => setTimeout(resolve, 300));
  }, [queryClient]);

  const fmt = (v: number) => formatCurrency(v);

  // Top 10 agents by revenue
  const top10Revenue = useMemo(() => {
    const agentTotals: Record<string, { name: string; total: number; tier: number }> = {};
    revenueShare.forEach((rs: any) => {
      if (!agentTotals[rs.agent_name]) {
        agentTotals[rs.agent_name] = { name: rs.agent_name, total: 0, tier: rs.tier };
      }
      agentTotals[rs.agent_name].total += Number(rs.amount) || 0;
    });
    return Object.values(agentTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [revenueShare]);

  // Network size by tier
  const tierData = useMemo(() => {
    const tiers: Record<number, number> = {};
    agents.forEach(a => {
      tiers[a.tier] = (tiers[a.tier] || 0) + 1;
    });
    return Object.entries(tiers).map(([tier, count]) => ({
      name: `Tier ${tier}`,
      value: count,
      tier: Number(tier),
    })).sort((a, b) => a.tier - b.tier);
  }, [agents]);

  // Agent additions/departures
  const movementData = useMemo(() => {
    const months: Record<string, { month: string; additions: number; departures: number }> = {};
    agents.forEach(a => {
      if (a.join_date) {
        const m = a.join_date.slice(0, 7);
        if (!months[m]) months[m] = { month: m, additions: 0, departures: 0 };
        months[m].additions++;
      }
      const departureMonth = a.departure_date
        ? a.departure_date.slice(0, 7)
        : (a.status === 'INACTIVE' && a.updated_at ? a.updated_at.slice(0, 7) : null);
      if (departureMonth) {
        if (!months[departureMonth]) months[departureMonth] = { month: departureMonth, additions: 0, departures: 0 };
        months[departureMonth].departures++;
      }
    });
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [agents]);

  // Days with brokerage distribution
  const daysDistribution = useMemo(() => {
    const buckets = [
      { label: '0-90d', min: 0, max: 90, count: 0, agents: [] as string[] },
      { label: '91-180d', min: 91, max: 180, count: 0, agents: [] as string[] },
      { label: '6m-1yr', min: 181, max: 365, count: 0, agents: [] as string[] },
      { label: '1-2yr', min: 366, max: 730, count: 0, agents: [] as string[] },
      { label: '2yr+', min: 731, max: Infinity, count: 0, agents: [] as string[] },
    ];
    agents.forEach(a => {
      const days = a.days_with_brokerage;
      if (days != null) {
        const bucket = buckets.find(b => days >= b.min && days <= b.max);
        if (bucket) {
          bucket.count++;
          bucket.agents.push(a.agent_name);
        }
      }
    });
    return buckets.map(b => ({ name: b.label, value: b.count, agents: b.agents }));
  }, [agents]);

  // RevShare by month
  const revShareByMonth = useMemo(() => {
    const months: Record<string, number> = {};
    revenueShare.forEach((rs: any) => {
      const period = rs.period || '';
      const m = period.slice(0, 7);
      if (m) months[m] = (months[m] || 0) + (Number(rs.amount) || 0);
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([month, amount]) => ({ month, amount }));
  }, [revenueShare]);

  // RevShare by year
  const revShareByYear = useMemo(() => {
    const years: Record<string, number> = {};
    revenueShare.forEach((rs: any) => {
      const period = rs.period || '';
      const y = period.slice(0, 4);
      if (y) years[y] = (years[y] || 0) + (Number(rs.amount) || 0);
    });
    return Object.entries(years)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, amount]) => ({ year, amount }));
  }, [revenueShare]);

  const activeAgents = agents.filter(a => a.status === 'ACTIVE' && !a.departure_date);
  const departedAgents = agents.filter(a => a.status !== 'ACTIVE' || !!a.departure_date);
  const totalRevShare = revenueShare.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
  const retentionRate = agents.length > 0 ? Math.round((activeAgents.length / agents.length) * 100) : 0;

  const tooltipStyle = {
    contentStyle: {
      background: 'hsl(var(--popover))',
      border: '1px solid hsl(var(--border))',
      borderRadius: '12px',
      fontSize: '12px',
      boxShadow: '0 8px 32px -8px hsl(var(--foreground) / 0.2)',
      padding: '10px 14px',
      color: 'hsl(var(--popover-foreground))',
    },
    labelStyle: { color: 'hsl(var(--popover-foreground))' },
    itemStyle: { color: 'hsl(var(--popover-foreground))' },
  };

  if (agentsLoading) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-8 flex items-center justify-center min-h-[50vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Loading network data...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Network" subtitle="Agent network & revenue share" showAddDeal={false} />
      <PullToRefresh onRefresh={handleRefresh} className="min-h-[calc(100dvh-56px)]">
      <div className="p-4 sm:p-5 md:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
        {/* Hero Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/8 via-background to-accent/5 border border-border/40 p-4 sm:p-6 lg:p-8"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent/5 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
          
          <div className="relative">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Network className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground">Network</h1>
                <p className="text-sm text-muted-foreground">Your agent network & revenue share overview</p>
              </div>
            </div>

            {/* Hero Stats Row */}
            <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3.5 mt-4 sm:mt-6">
              {[
                { label: 'Total Agents', value: agents.length.toString(), icon: Users, color: 'text-primary' },
                { label: 'Active', value: activeAgents.length.toString(), icon: UserPlus, color: 'text-success' },
                { label: 'Departed', value: departedAgents.length.toString(), icon: UserMinus, color: 'text-destructive' },
                { label: 'Retention', value: `${retentionRate}%`, icon: TrendingUp, color: 'text-info' },
                { label: 'Total RevShare', value: fmt(totalRevShare), icon: DollarSign, color: 'text-accent' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/30 p-3 sm:p-4 hover:border-border/60 transition-colors"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <stat.icon className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${stat.color}`} />
                    <span className="text-[9px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">{stat.label}</span>
                  </div>
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
          <TabsList className="bg-muted/50 border border-border/30 p-1 h-auto w-full flex overflow-x-auto no-scrollbar gap-0.5">
            {[
              { value: 'overview', label: 'Overview', icon: BarChart3 },
              { value: 'performers', label: 'Performers', icon: Trophy },
              { value: 'tree', label: 'Sponsor Tree', icon: GitBranch },
              { value: 'revshare', label: 'RevShare', icon: DollarSign },
              { value: 'directory', label: 'Directory', icon: Users },
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex-1 min-w-[56px] gap-1 sm:gap-1.5 text-[11px] sm:text-sm data-[state=active]:bg-card data-[state=active]:shadow-sm px-2 sm:px-3 py-2 whitespace-nowrap"
              >
                <tab.icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xs:inline sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top 10 Revenue */}
              <Card className="border-border/40 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Top 10 by Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {top10Revenue.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No revenue share data yet</p>
                  ) : (
                    <div className="h-[220px] sm:h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={top10Revenue} layout="vertical" margin={{ left: 4, right: 8, top: 5, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} horizontal={false} />
                          <XAxis type="number" tickFormatter={(v) => `$${Math.round(v/1000)}k`} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={40} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={90} />
                          <Tooltip formatter={(v: number) => fmt(v)} {...tooltipStyle} />
                          <Bar dataKey="total" fill="hsl(158, 64%, 32%)" radius={[0, 8, 8, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Network Size by Tier */}
              <Card className="border-border/40 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Network by Tier
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {tierData.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No network data yet</p>
                  ) : (
                    <div className="h-[220px] sm:h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={tierData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={4}
                            dataKey="value"
                            strokeWidth={0}
                            label={({ name, value }) => `${name}: ${value}`}
                          >
                            {tierData.map((_, i) => (
                              <Cell key={i} fill={TIER_COLORS[i % TIER_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip {...tooltipStyle} />
                          <Legend
                            iconType="circle"
                            iconSize={8}
                            wrapperStyle={{ fontSize: '12px' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Agent Movement */}
              <Card className="border-border/40 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Network className="w-4 h-4 text-primary" />
                    Agent Movement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {movementData.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No movement data yet</p>
                  ) : (
                    <div className="h-[200px] sm:h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={movementData} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="month" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} interval={1} />
                          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={24} />
                          <Tooltip {...tooltipStyle} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                          <Bar dataKey="additions" name="Joined" fill="hsl(158, 64%, 38%)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="departures" name="Departed" fill="hsl(0, 65%, 55%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tenure Distribution */}
              <Card className="border-border/40 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      Tenure Distribution
                    </CardTitle>
                    <span className="text-[10px] text-muted-foreground">Hover for details</span>
                  </div>
                </CardHeader>
                <CardContent>
                  {daysDistribution.every(b => b.value === 0) ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No tenure data available</p>
                  ) : (
                    <div className="h-[200px] sm:h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={daysDistribution} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} width={24} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const data = payload[0].payload;
                              return (
                                <div className="rounded-xl border border-border/50 bg-card px-3.5 py-3 shadow-xl text-xs max-w-[220px]">
                                  <p className="font-semibold text-foreground mb-1.5">{data.name} — {data.value} agent{data.value !== 1 ? 's' : ''}</p>
                                  <div className="space-y-0.5">
                                    {data.agents.slice(0, 8).map((name: string, i: number) => (
                                      <p key={i} className="text-muted-foreground truncate">• {name}</p>
                                    ))}
                                    {data.agents.length > 8 && (
                                      <p className="text-muted-foreground italic">+{data.agents.length - 8} more</p>
                                    )}
                                  </div>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="value" name="Agents" radius={[6, 6, 0, 0]}>
                            {daysDistribution.map((_, i) => (
                              <Cell key={i} fill={`hsl(158, ${50 + i * 5}%, ${42 - i * 4}%)`} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Top Performers Tab */}
          <TabsContent value="performers">
            <TopPerformers agents={agents} revenueShare={revenueShare} />
          </TabsContent>

          {/* Tree Tab */}
          <TabsContent value="tree">
            <SponsorTree agents={agents} />
          </TabsContent>

          {/* RevShare Tab */}
          <TabsContent value="revshare" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* RevShare by Month */}
              <Card className="border-border/40 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Monthly RevShare</CardTitle>
                </CardHeader>
                <CardContent>
                  {revShareByMonth.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No revenue share data yet</p>
                  ) : (
                    <div className="h-[220px] sm:h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={revShareByMonth} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
                          <defs>
                            <linearGradient id="revShareGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(158, 64%, 32%)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(158, 64%, 32%)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="month" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} interval={2} />
                          <YAxis tickFormatter={(v) => `$${Math.round(v/1000)}k`} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={36} />
                          <Tooltip formatter={(v: number) => fmt(v)} {...tooltipStyle} />
                          <Area
                            type="monotone"
                            dataKey="amount"
                            stroke="hsl(158, 64%, 32%)"
                            strokeWidth={2.5}
                            fill="url(#revShareGrad)"
                            dot={{ r: 3, fill: 'hsl(158, 64%, 32%)', strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: 'hsl(158, 64%, 32%)', strokeWidth: 2, stroke: 'white' }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* RevShare by Year */}
              <Card className="border-border/40 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Yearly RevShare</CardTitle>
                </CardHeader>
                <CardContent>
                  {revShareByYear.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No yearly data yet</p>
                  ) : (
                    <div className="h-[220px] sm:h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revShareByYear} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                          <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis tickFormatter={(v) => `$${Math.round(v/1000)}k`} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={36} />
                          <Tooltip formatter={(v: number) => fmt(v)} {...tooltipStyle} />
                          <Bar dataKey="amount" name="RevShare" fill="hsl(38, 75%, 50%)" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* RevShare by Tier */}
            {summary?.revshare_by_tier && (
              <Card className="border-border/40 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">RevShare by Tier</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {Object.entries(summary.revshare_by_tier).map(([tier, amount], i) => (
                      <motion.div
                        key={tier}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="rounded-xl border border-border/40 p-4 text-center hover:border-border/60 transition-colors"
                      >
                        <div
                          className="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center"
                          style={{ background: TIER_COLORS[i % TIER_COLORS.length] + '18' }}
                        >
                          <span className="text-xs font-bold" style={{ color: TIER_COLORS[i % TIER_COLORS.length] }}>
                            T{tier}
                          </span>
                        </div>
                        <p className="text-lg font-bold text-foreground">{fmt(Number(amount) || 0)}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Tier {tier}</p>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Directory Tab */}
          <TabsContent value="directory">
            <AgentDirectory agents={agents} />
          </TabsContent>
        </Tabs>
      </div>
      </PullToRefresh>
    </AppLayout>
  );
}
