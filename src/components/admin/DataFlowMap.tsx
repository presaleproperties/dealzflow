import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowDown, 
  Database, 
  Globe, 
  BarChart3, 
  Users, 
  Banknote, 
  Calculator, 
  RefreshCw,
  Server,
  Layers,
  TrendingUp,
  Receipt,
  Target,
  Shield,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1.5">
      <ArrowDown className="h-4 w-4 text-muted-foreground" />
      {label && <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>}
    </div>
  );
}

function FlowNode({ icon: Icon, title, subtitle, color, items }: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  color: string;
  items?: string[];
}) {
  return (
    <div className="liquid-glass rounded-xl p-3.5 space-y-2">
      <div className="flex items-center gap-2.5">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", color)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {items && items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {items.map((item) => (
            <Badge key={item} variant="outline" className="text-[10px] font-normal py-0 px-1.5 bg-muted/30">
              {item}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function DataFlowMap() {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-3">
        Complete routing of how data is pulled from ReZen API, stored, processed, and displayed.
      </p>
        {/* Source */}
        <FlowNode
          icon={Globe}
          title="ReZen API (Real Broker)"
          subtitle="Arrakis + Yenta endpoints"
          color="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
          items={[
            'GET /transactions/participant/{id}/transactions/OPEN',
            'GET /transactions/participant/{id}/transactions/CLOSED',
            'GET /transactions/participant/{id}/current',
            'GET /transactions/participant/{id}/listings/ACTIVE',
            'GET /revshares/{id}/payments',
            'GET /revshares/payments/{id}/contributions',
            'GET /revshares/{id}/contributions',
            'GET /revshares/performance/{id}/revenue-share/current',
            'GET /revshares/{id}/by-tier',
            'GET /agents/{id}/cap-info',
            'GET /agents/{id}/network-size-by-tier',
            'GET /agents/{id}/front-line-agents-info',
            'GET /agents/{id}/down-line/{tier}',
          ]}
        />

        <FlowArrow label="sync-platform Edge Function" />

        {/* Processing */}
        <FlowNode
          icon={Server}
          title="Edge Function: sync-platform"
          subtitle="Authenticates user, extracts + maps fields, upserts to DB"
          color="bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400"
          items={[
            'JWT validation',
            'buildTransactionRecord() — maps status, dates, commission',
            'extractTransactionFields() — firm_date, myNetPayout, mySplitPercent',
            'Team deal detection (Ravish/Sarb → net payout)',
            'Upsert on (user_id, platform, external_id)',
          ]}
        />

        <FlowArrow label="Upsert to Postgres" />

        {/* Database Tables */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FlowNode
            icon={Database}
            title="synced_transactions"
            subtitle="All deals (open, closed, listings)"
            color="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
            items={[
              'external_id', 'status (active/closed/terminated)',
              'commission_amount (gross)', 'my_net_payout (take-home)',
              'close_date', 'firm_date', 'listing_date',
              'property_address', 'sale_price', 'client_name',
              'is_listing', 'lifecycle_state', 'compliance_status',
              'lead_source', 'mls_number', 'my_split_percent',
              'raw_data (full ReZen payload)',
            ]}
          />
          <FlowNode
            icon={Database}
            title="revenue_share"
            subtitle="Per-agent RevShare contributions"
            color="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
            items={[
              'agent_name', 'tier (1-5)', 'amount',
              'period (YYYY-MM)', 'cap_contribution',
              'Upsert on (user_id, platform, agent_name, period)',
            ]}
          />
          <FlowNode
            icon={Database}
            title="network_agents"
            subtitle="Frontline + downline agents (Tiers 1-5)"
            color="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
            items={[
              'agent_yenta_id', 'agent_name', 'tier',
              'join_date', 'status', 'avatar_url', 'network_size',
            ]}
          />
          <FlowNode
            icon={Database}
            title="network_summary"
            subtitle="Aggregated network stats"
            color="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
            items={[
              'total_network_agents', 'network_size_by_tier',
              'revshare_by_tier', 'revshare_performance', 'agent_cap_info',
            ]}
          />
        </div>

        <FlowArrow label="React Query hooks" />

        {/* Hooks Layer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FlowNode
            icon={Layers}
            title="useSyncedIncome()"
            subtitle="Core income calculation engine"
            color="bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400"
            items={[
              'receivedYTD = closed + thisYear + netAmount',
              'comingIn = active deals → netAmount sum',
              'projectedRevenue2026 = all 2026 deals',
              'Team deals (Ravish/Sarb) → uses myNetPayout',
              'Solo deals → uses gross commission_amount',
              'syncedPayouts[] → used by forecast + charts',
            ]}
          />
          <FlowNode
            icon={Layers}
            title="usePlatformConnections()"
            subtitle="DB query hooks for all synced data"
            color="bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400"
            items={[
              'useSyncedTransactions() → synced_transactions',
              'useRevenueShare() → revenue_share',
              'useSyncLogs() → sync_logs',
              'useSyncPlatform() → triggers sync-platform',
            ]}
          />
        </div>

        <FlowArrow label="Props to components" />

        {/* Dashboard Display */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dashboard Components</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <FlowNode
              icon={Banknote}
              title="QuickStats"
              subtitle="4-card hero grid"
              color="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
              items={[
                'Earned YTD = receivedYTD',
                'Coming In = comingIn (active deals)',
                'Expenses = monthlyRecurringExpenses',
                'Pipeline = pipelineProspects sum',
              ]}
            />
            <FlowNode
              icon={Target}
              title="GCIGoalTracker"
              subtitle="Projected income + goals"
              color="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
              items={[
                'Projected = projectedRevenue2026 + revShareAvg*12',
                'Commissions bar = projectedRevenue2026',
                'RevShare bar = revShareMonthlyAvg * 12',
                'GCI Goal progress = gciYTD / yearly_gci_goal',
                'RevShare Goal = revShareYTD / yearly_revshare_goal',
              ]}
            />
            <FlowNode
              icon={TrendingUp}
              title="IncomeProjection"
              subtitle="Monthly cashflow chart"
              color="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
              items={[
                'syncedPayouts → monthly income bars',
                'revShareMonthlyAvg → projected RS fill',
                'expenses → monthly expense line',
              ]}
            />
            <FlowNode
              icon={Calculator}
              title="Tax Cards"
              subtitle="SafeToSpend + TaxSafety + TaxProjection"
              color="bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"
              items={[
                'projectedCashIn = comingIn',
                'taxSetAside = calculateTax(projected, expenses, province)',
                'Includes GST if registered',
                'Buffer % from settings.tax_buffer_percent',
              ]}
            />
            <FlowNode
              icon={Receipt}
              title="ExpenseCommandCenter"
              subtitle="Expense breakdown + budgets"
              color="bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"
              items={[
                'expenses table → categorized totals',
                'properties → rental expenses',
                'monthlyRecurring + annual calculations',
              ]}
            />
            <FlowNode
              icon={Users}
              title="Network & RevShare"
              subtitle="Agent tree + RevShare summary"
              color="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
              items={[
                'network_agents → SponsorTree',
                'revenue_share → RevShareSummaryCard',
                'revShareYTD = revenue_share filtered by year',
                'revShareMonthlyAvg = trailing 12-month average',
              ]}
            />
          </div>
        </div>

        <FlowArrow label="Auto-sync" />

        {/* Auto Sync */}
        <FlowNode
          icon={Clock}
          title="Daily Auto-Sync (pg_cron)"
          subtitle="Runs scheduled-sync edge function every day at 6 AM UTC"
          color="bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400"
          items={[
            'scheduled-sync → calls sync-platform for each active connection',
            'Handles all platforms (ReZen, Lofty)',
            'Logs results to sync_logs table',
            'Updates platform_connections.last_synced_at',
          ]}
        />
      </CardContent>
    </Card>
  );
}
