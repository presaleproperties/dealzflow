import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useExpenses } from '@/hooks/useExpenses';
import { useProperties } from '@/hooks/useProperties';
import { useSettings } from '@/hooks/useSettings';
import { useRefreshData } from '@/hooks/useRefreshData';
import { useOnboarding } from '@/hooks/useOnboarding';
import { cn } from '@/lib/utils';

import { QuickStats } from '@/components/dashboard/QuickStats';
import { IncomeProjection } from '@/components/dashboard/IncomeProjection';
import { ExpenseAnalytics } from '@/components/dashboard/ExpenseAnalytics';
import { TaxProjection } from '@/components/dashboard/TaxProjection';
import { TaxSafetyCard } from '@/components/dashboard/TaxSafetyCard';
import { SafeToSpendCard } from '@/components/dashboard/SafeToSpendCard';
import { ExpenseCommandCenter } from '@/components/dashboard/ExpenseCommandCenter';
import { AIBusinessInsights } from '@/components/dashboard/AIBusinessInsights';
import { PipelinePreview } from '@/components/dashboard/PipelinePreview';
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { InsightsGreeting } from '@/components/dashboard/InsightsGreeting';
import { UpcomingRevenue } from '@/components/dashboard/UpcomingRevenue';
import { NeedsAttention } from '@/components/dashboard/NeedsAttention';
import { RevShareSummaryCard } from '@/components/dashboard/RevShareSummaryCard';
import { BusinessAnalytics } from '@/components/dashboard/BusinessAnalytics';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Plug, ArrowRight, Sparkles } from 'lucide-react';
import { getMonthlyRecurringExpenses, getAnnualExpenses } from '@/lib/expenseCalculations';
import { useSyncedTransactions, useRevenueShare, usePlatformConnections, useSyncPlatform } from '@/hooks/usePlatformConnections';
import { useSyncedIncome } from '@/hooks/useSyncedIncome';
import { usePipelineProspects } from '@/hooks/usePipelineProspects';
import { calculateTax, Province, TaxType } from '@/lib/taxCalculator';
import { GCIGoalTracker } from '@/components/dashboard/GCIGoalTracker';
import { DealsWrittenCard } from '@/components/dashboard/DealsWrittenCard';
import { NotificationCenter } from '@/components/dashboard/NotificationCenter';

export default function DashboardPage() {
  const { data: expenses = [] } = useExpenses();
  const { data: properties = [] } = useProperties();
  const { data: settings } = useSettings();
  const { data: syncedTransactions = [] } = useSyncedTransactions();
  const { data: revenueShare = [] } = useRevenueShare();
  // Dashboard projections (Coming In, Earned YTD, active deal counts) use ONLY ReZen-synced data.
  // Manual historical imports are for records/inventory/analytics only — not live projections.
  const rezenTransactions = useMemo(
    () => syncedTransactions.filter((tx: any) => tx.platform !== 'manual'),
    [syncedTransactions]
  );
  const { syncedPayouts, receivedYTD, comingIn, projectedRevenue2026 } = useSyncedIncome(rezenTransactions);
  const { data: pipelineProspects = [] } = usePipelineProspects();
  const { data: connections = [] } = usePlatformConnections();
  const syncPlatform = useSyncPlatform();
  const { showOnboarding, isChecking, completeOnboarding } = useOnboarding();
  const refreshData = useRefreshData();
  const [isSyncing, setIsSyncing] = useState(false);

  const activeConnection = connections.find((c: any) => c.is_active);

  const handleResync = async () => {
    if (!activeConnection || isSyncing) return;
    setIsSyncing(true);
    try {
      await syncPlatform.mutateAsync({ platform: activeConnection.platform, connectionId: activeConnection.id });
      await refreshData();
    } finally {
      setIsSyncing(false);
    }
  };

  const userName = (settings as any)?.full_name?.split(' ')[0] || undefined;
  const now = new Date();
  const thisYear = now.getFullYear();

  const province = ((settings as any)?.province || 'BC') as Province;
  const taxType = ((settings as any)?.tax_type || 'self-employed') as TaxType;
  const taxBuffer = (settings as any)?.tax_buffer_percent || 5;
  const gstRegistered = (settings as any)?.gst_registered || false;
  const gstRate = (settings as any)?.gst_rate || 0.05;

  const revShareMonthlyAvg = useMemo(() => {
    if (revenueShare.length === 0) return 0;
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const cutoff = format(twelveMonthsAgo, 'yyyy-MM');
    const recentRevShare = revenueShare.filter((r: any) => r.period >= cutoff);
    if (recentRevShare.length === 0) {
      const total = revenueShare.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
      const uniqueMonths = new Set(revenueShare.map((r: any) => r.period));
      return uniqueMonths.size > 0 ? total / uniqueMonths.size : 0;
    }
    const total = recentRevShare.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
    const uniqueMonths = new Set(recentRevShare.map((r: any) => r.period));
    return uniqueMonths.size > 0 ? total / uniqueMonths.size : 0;
  }, [revenueShare]);

  const revShareYTD = useMemo(() => {
    const yearPrefix = `${thisYear}-`;
    return revenueShare
      .filter((r: any) => r.period && r.period.startsWith(yearPrefix))
      .reduce((sum: number, r: any) => sum + Number(r.amount), 0);
  }, [revenueShare, thisYear]);

  const expenseTotals = useMemo(() => {
    const monthly = getMonthlyRecurringExpenses(expenses, properties);
    const annual = getAnnualExpenses(expenses, properties);
    return { monthly, annual };
  }, [expenses, properties]);

  const dealCounts = useMemo(() => {
    const active = rezenTransactions.filter((tx: any) => tx.status === 'active').length;
    const closedYTD = rezenTransactions.filter((tx: any) =>
      tx.status === 'closed' && tx.close_date && new Date(tx.close_date).getFullYear() === thisYear
    ).length;
    return { active, closedYTD };
  }, [rezenTransactions, thisYear]);

  const incomeTotals = useMemo(() => {
    return { paid: receivedYTD, projected: comingIn };
  }, [receivedYTD, comingIn]);

  const taxSetAsideRequired = useMemo(() => {
    const totalIncome = incomeTotals.paid + incomeTotals.projected;
    const deductibleRatio = totalIncome > 0 ? incomeTotals.projected / totalIncome : 0;
    const deductibleForProjected = expenseTotals.annual * deductibleRatio;
    const taxBreakdown = calculateTax(incomeTotals.projected, deductibleForProjected, province, taxType);
    const gstOwed = gstRegistered ? incomeTotals.projected * gstRate : 0;
    const bufferMultiplier = 1 + (taxBuffer / 100);
    return (taxBreakdown.totalTax + gstOwed) * bufferMultiplier;
  }, [incomeTotals.paid, incomeTotals.projected, expenseTotals.annual, province, taxType, taxBuffer, gstRegistered, gstRate]);

  const comingInDateRange = useMemo(() => {
    const activeDates = syncedPayouts
      .filter(p => p.status === 'active' && p.close_date)
      .map(p => new Date(p.close_date))
      .sort((a, b) => a.getTime() - b.getTime());
    if (activeDates.length === 0) return '';
    const earliest = activeDates[0];
    const latest = activeDates[activeDates.length - 1];
    const fmtEarliest = format(earliest, 'MMM yyyy');
    const fmtLatest = format(latest, 'MMM yyyy');
    return fmtEarliest === fmtLatest ? fmtEarliest : `${fmtEarliest} – ${fmtLatest}`;
  }, [syncedPayouts]);

  if (isChecking) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            <p className="text-muted-foreground text-sm">Loading...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const hasConnection = connections.length > 0;
  const isEmpty = !hasConnection && syncedTransactions.length === 0;
  const activePipeline = pipelineProspects.filter(p => p.status === 'active');

  const quickStatsProps = {
    receivedYTD,
    comingIn,
    monthlyExpenses: expenseTotals.monthly,
    activeDeals: dealCounts.active,
    closedDealsYTD: dealCounts.closedYTD,
    pipelineCount: activePipeline.length,
    pipelinePotential: activePipeline.reduce((sum, p) => sum + Number(p.potential_commission), 0),
    comingInDateRange,
  };

  const goalTrackerProps = {
    gciYTD: receivedYTD,
    revShareYTD,
    projectedRevenue: projectedRevenue2026,
    revShareMonthlyAvg,
  };

  const tabTriggerClass = "text-[13px] font-semibold px-4 rounded-[10px] tracking-tight data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground/70";

  return (
    <AppLayout>
      <OnboardingWizard open={showOnboarding} onComplete={completeOnboarding} />

      <Header
        title="Dashboard"
        subtitle={format(now, 'EEEE, MMMM d, yyyy')}
        showAddDeal={false}
        action={
          <div className="flex items-center gap-1.5">
            <NotificationCenter syncedTransactions={syncedTransactions} pipelineProspects={pipelineProspects} />
            {activeConnection && (
              <button
                onClick={handleResync}
                disabled={isSyncing}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 active:scale-[0.97]",
                  "bg-secondary/60 text-secondary-foreground hover:bg-secondary border border-border/40",
                  isSyncing && "opacity-50 pointer-events-none"
                )}
              >
                <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
                {isSyncing ? 'Syncing...' : 'Sync'}
              </button>
            )}
            <div className="hidden sm:flex items-center gap-1.5">
              {[
                { label: 'New Deal', path: '/deals/new', primary: true },
                { label: 'Expenses', path: '/expenses' },
                { label: 'Forecast', path: '/forecast' },
              ].map((action) => (
                <Link key={action.path} to={action.path}>
                  <button
                    className={cn(
                      "inline-flex items-center px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 active:scale-[0.97]",
                      action.primary
                        ? "btn-premium"
                        : "bg-secondary/60 text-secondary-foreground hover:bg-secondary border border-border/40"
                    )}
                  >
                    {action.label}
                  </button>
                </Link>
              ))}
            </div>
          </div>
        }
      />

      {isEmpty ? (
        <EmptyDashboard />
      ) : (
        <PullToRefresh onRefresh={refreshData} className="min-h-[calc(100vh-56px)]">
          {/* Connect banner */}
          {connections.length === 0 && (
            <div className="px-4 lg:px-6 pt-4">
              <Link to="/settings?tab=integrations">
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-primary/6 border border-primary/15 hover:bg-primary/10 transition-colors cursor-pointer">
                  <Plug className="w-3.5 h-3.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold">Connect ReZen to auto-sync your deals</p>
                    <p className="text-[11px] text-muted-foreground">Settings → Integrations</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                </div>
              </Link>
            </div>
          )}

          {/* Mobile Dashboard */}
          <div className="sm:hidden">
            <div className="px-5 pt-3 pb-3">
              <p className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-widest">{format(now, 'EEEE, MMMM d')}</p>
              <h1 className="text-[20px] font-bold tracking-[-0.03em] mt-0.5 text-foreground">Dashboard</h1>
            </div>

            <div className="px-5 mb-3">
              <QuickStats {...quickStatsProps} />
            </div>

            <div className="px-5 mb-3">
              <GCIGoalTracker {...goalTrackerProps} />
            </div>

            <Tabs defaultValue="insights" className="pb-8">
              <div className="px-5 mb-3">
                <TabsList className="w-full grid grid-cols-4 h-9 bg-muted/40 rounded-xl p-0.5 border border-border/30">
                  {[
                    { value: 'insights', label: 'Insights' },
                    { value: 'cashflow', label: 'Cashflow' },
                    { value: 'taxes', label: 'Taxes' },
                    { value: 'analytics', label: 'Analytics' },
                  ].map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="text-[11px] font-semibold rounded-[10px] tracking-tight data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground"
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="insights" className="px-5 space-y-3 mt-0">
                <UpcomingRevenue syncedTransactions={syncedTransactions} />
                <PipelinePreview layout="horizontal" />
                <NeedsAttention syncedTransactions={syncedTransactions} />
              </TabsContent>

              <TabsContent value="cashflow" className="px-5 space-y-3 mt-0">
                <IncomeProjection payouts={[]} expenses={expenses} revShareMonthlyAvg={revShareMonthlyAvg} properties={properties} syncedPayouts={syncedPayouts} />
                <RevShareSummaryCard revenueShare={revenueShare} />
              </TabsContent>

              <TabsContent value="taxes" className="px-5 space-y-3 mt-0">
                <SafeToSpendCard
                  projectedCashIn={incomeTotals.projected}
                  monthlyExpenses={expenseTotals.monthly}
                  taxSetAsideRequired={taxSetAsideRequired}
                />
                <TaxSafetyCard
                  paidIncome={incomeTotals.paid}
                  projectedIncome={incomeTotals.projected}
                  deductibleExpenses={expenseTotals.annual}
                />
                <TaxProjection
                  projectedIncome={incomeTotals.projected}
                  paidIncome={incomeTotals.paid}
                  totalExpenses={expenseTotals.annual}
                />
              </TabsContent>

              <TabsContent value="analytics" className="px-5 space-y-3 mt-0">
                <DealsWrittenCard syncedTransactions={syncedTransactions} compact />
                <ExpenseAnalytics expenses={expenses} />
                <AIBusinessInsights syncedTransactions={syncedTransactions} />
                <BusinessAnalytics deals={[]} payouts={[]} syncedPayouts={syncedPayouts} syncedTransactions={syncedTransactions} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Tablet + Desktop Layout */}
          <div className="hidden sm:block p-5 md:p-6 lg:p-6 space-y-5">
            {/* On tablet, show 2-col QuickStats + Goals side by side */}
            <div className="grid md:grid-cols-2 lg:grid-cols-1 gap-5">
              <div className="space-y-5">
                <QuickStats {...quickStatsProps} />
              </div>
              <div className="md:flex md:items-stretch">
                <div className="w-full">
                  <GCIGoalTracker {...goalTrackerProps} />
                </div>
              </div>
            </div>

            <Tabs defaultValue="insights" className="space-y-5">
              <TabsList className="w-auto inline-flex h-10 p-0.5 bg-muted/40 rounded-xl border border-border/30">
                <TabsTrigger value="insights" className={tabTriggerClass}>Insights</TabsTrigger>
                <TabsTrigger value="cashflow" className={tabTriggerClass}>Cashflow</TabsTrigger>
                <TabsTrigger value="taxes" className={tabTriggerClass}>Taxes</TabsTrigger>
                <TabsTrigger value="analytics" className={tabTriggerClass}>Analytics</TabsTrigger>
              </TabsList>

              {/* Insights Tab */}
              <TabsContent value="insights" className="mt-0 space-y-5">
                <InsightsGreeting
                  syncedTransactions={syncedTransactions}
                  revenueShare={revenueShare}
                  userName={userName}
                  receivedYTD={receivedYTD}
                  revShareMonthlyAvg={revShareMonthlyAvg}
                />
                <PipelinePreview layout="horizontal" />
                <div className="grid md:grid-cols-2 gap-4 items-start">
                  <UpcomingRevenue syncedTransactions={syncedTransactions} />
                  <NeedsAttention syncedTransactions={syncedTransactions} />
                </div>
                <RevShareSummaryCard revenueShare={revenueShare} />
              </TabsContent>

              {/* Cashflow Tab */}
              <TabsContent value="cashflow" className="mt-0 space-y-5">
                <IncomeProjection payouts={[]} expenses={expenses} revShareMonthlyAvg={revShareMonthlyAvg} properties={properties} syncedPayouts={syncedPayouts} />
                <ExpenseCommandCenter
                  expenses={expenses}
                  properties={properties}
                  monthlyExpenses={expenseTotals.monthly}
                  annualExpenses={expenseTotals.annual}
                />
              </TabsContent>

              {/* Taxes Tab */}
              <TabsContent value="taxes" className="mt-0 space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <SafeToSpendCard
                    projectedCashIn={incomeTotals.projected}
                    monthlyExpenses={expenseTotals.monthly}
                    taxSetAsideRequired={taxSetAsideRequired}
                  />
                  <TaxSafetyCard
                    paidIncome={incomeTotals.paid}
                    projectedIncome={incomeTotals.projected}
                    deductibleExpenses={expenseTotals.annual}
                  />
                </div>
                <TaxProjection
                  projectedIncome={incomeTotals.projected}
                  paidIncome={incomeTotals.paid}
                  totalExpenses={expenseTotals.annual}
                />
              </TabsContent>

              {/* Analytics Tab */}
              <TabsContent value="analytics" className="mt-0 space-y-5">
                <div className="grid md:grid-cols-2 gap-5">
                  <DealsWrittenCard syncedTransactions={syncedTransactions} compact />
                  <ExpenseAnalytics expenses={expenses} />
                </div>
                <AIBusinessInsights syncedTransactions={syncedTransactions} />
                <BusinessAnalytics deals={[]} payouts={[]} syncedPayouts={syncedPayouts} syncedTransactions={syncedTransactions} />
              </TabsContent>
            </Tabs>
          </div>
        </PullToRefresh>
      )}
    </AppLayout>
  );
}
