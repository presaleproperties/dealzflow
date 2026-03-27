import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useAdmin';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, Eye, MousePointerClick, Users, TrendingUp,
  Megaphone, BarChart3, AlertCircle, ExternalLink, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type DatePreset = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'this_month';

const DATE_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: '7 Days' },
  { value: 'last_14d', label: '14 Days' },
  { value: 'last_30d', label: '30 Days' },
  { value: 'this_month', label: 'This Month' },
];

function useMetaAds(datePreset: DatePreset) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['meta-ads', user?.id, datePreset],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-ads?date_preset=${datePreset}`;
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

function formatCurrency(val: number, compact = false): string {
  if (compact) {
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toFixed(0)}`;
  }
  return `$${val.toFixed(2)}`;
}

function formatNum(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toLocaleString();
}

// ─── Not Configured State ──────────────────────────────────────────────────────
function NotConfigured() {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#1877F2]/10 flex items-center justify-center mb-4">
        <Megaphone className="w-7 h-7 text-[#1877F2]/50" />
      </div>
      <p className="text-sm font-semibold text-foreground">Connect Facebook Ads</p>
      <p className="text-xs text-muted-foreground mt-1.5 max-w-[260px] leading-relaxed">
        Add your Meta Ads API credentials in Settings to see live ad performance here
      </p>
      <div className="mt-5 space-y-2 w-full max-w-[280px]">
        {[
          { icon: DollarSign, text: 'Real-time spend & budget tracking' },
          { icon: Users, text: 'Lead count & cost per lead metrics' },
          { icon: BarChart3, text: 'Campaign performance breakdown' },
        ].map((tip, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.08 }}
            className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/30 border border-border/30 text-left"
          >
            <tip.icon className="w-3.5 h-3.5 text-[#1877F2]/50 mt-0.5 shrink-0" />
            <span className="text-[11px] text-muted-foreground leading-snug">{tip.text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string; icon: any; color: string; sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-3.5 relative overflow-hidden group hover:border-border/60 transition-colors">
      <div className="absolute -right-2 -top-2 w-12 h-12 rounded-full opacity-[0.06] blur-xl pointer-events-none" style={{ background: color }} />
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3 h-3" style={{ color }} />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-bold tracking-tight tabular-nums text-foreground leading-none">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ─── Campaign Row ──────────────────────────────────────────────────────────────
function CampaignRow({ campaign, maxSpend }: { campaign: any; maxSpend: number }) {
  const pct = maxSpend > 0 ? (campaign.spend / maxSpend) * 100 : 0;
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 py-2.5"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            campaign.status === 'ACTIVE' ? 'bg-success' : 'bg-muted-foreground/30'
          )} />
          <span className="text-[12px] font-medium text-foreground truncate">{campaign.name}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(pct, 2)}%` }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full bg-[#1877F2]/60"
          />
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[11px] font-bold tabular-nums text-foreground">{formatCurrency(campaign.spend)}</p>
        <p className="text-[9px] text-muted-foreground tabular-nums">
          {campaign.leads > 0 ? `${campaign.leads} leads · $${campaign.cpl.toFixed(0)} CPL` : `${formatNum(campaign.impressions)} imp`}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Coming Soon (non-admin users) ─────────────────────────────────────────────
function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#1877F2]/10 flex items-center justify-center mb-5">
        <Megaphone className="w-8 h-8 text-[#1877F2]/40" />
      </div>
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <p className="text-sm font-semibold text-foreground">Ad Dashboard Coming Soon</p>
      </div>
      <p className="text-xs text-muted-foreground mt-1 max-w-[260px] leading-relaxed">
        Track your Facebook & Instagram ad performance, leads, and spend — all in one place.
      </p>
      <div className="mt-6 space-y-2 w-full max-w-[260px]">
        {[
          { icon: DollarSign, text: 'Real-time spend & ROI tracking' },
          { icon: Users, text: 'Lead count & cost per lead' },
          { icon: BarChart3, text: 'Campaign performance breakdown' },
        ].map((tip, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/30 border border-border/30 text-left"
          >
            <tip.icon className="w-3.5 h-3.5 text-[#1877F2]/40 mt-0.5 shrink-0" />
            <span className="text-[11px] text-muted-foreground leading-snug">{tip.text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Widget ───────────────────────────────────────────────────────────────
export function FacebookAdsWidget() {
  const { data: isAdmin } = useIsAdmin();
  const [datePreset, setDatePreset] = useState<DatePreset>('last_7d');
  const { data, isLoading, isError } = useMetaAds(datePreset);
  const [tab, setTab] = useState<'overview' | 'campaigns'>('overview');

  const isNotConfigured = data?.error === 'not_configured';
  const isApiError = data?.error === 'api_error';

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border/40 flex items-center gap-3 shrink-0">
        <div className="w-6 h-6 rounded-lg bg-[#1877F2]/10 flex items-center justify-center">
          <Megaphone className="w-3.5 h-3.5 text-[#1877F2]" />
        </div>
        <h2 className="text-sm font-semibold text-foreground flex-1">Facebook Ads</h2>

        {data?.configured && (
          <>
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">
              {(['overview', 'campaigns'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'text-[10px] font-medium px-2.5 py-1 rounded-md transition-all duration-200',
                    tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t === 'overview' ? 'Overview' : 'Campaigns'}
                </button>
              ))}
            </div>
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="text-[10px] font-medium bg-muted/40 border border-border/30 rounded-lg px-2 py-1 text-foreground cursor-pointer"
            >
              {DATE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : isNotConfigured ? (
          <NotConfigured />
        ) : isApiError ? (
          <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
            <AlertCircle className="w-8 h-8 text-destructive/50 mb-3" />
            <p className="text-sm font-medium text-foreground">Connection Error</p>
            <p className="text-xs text-muted-foreground mt-1">{data?.message || 'Failed to fetch ad data'}</p>
          </div>
        ) : data?.configured ? (
          <AnimatePresence mode="wait">
            {tab === 'overview' ? (
              <motion.div
                key="overview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <KPICard
                    label="Ad Spend"
                    value={formatCurrency(data.summary.spend, true)}
                    icon={DollarSign}
                    color="#1877F2"
                    sub={data.account.spendCap ? `Cap: ${formatCurrency(data.account.spendCap, true)}` : undefined}
                  />
                  <KPICard
                    label="Leads"
                    value={data.summary.leads.toString()}
                    icon={Users}
                    color="#10B981"
                    sub={data.summary.cpl > 0 ? `$${data.summary.cpl.toFixed(2)} per lead` : undefined}
                  />
                  <KPICard
                    label="Impressions"
                    value={formatNum(data.summary.impressions)}
                    icon={Eye}
                    color="#8B5CF6"
                    sub={`Reach: ${formatNum(data.summary.reach)}`}
                  />
                  <KPICard
                    label="Clicks"
                    value={formatNum(data.summary.clicks)}
                    icon={MousePointerClick}
                    color="#F59E0B"
                    sub={`CTR: ${data.summary.ctr.toFixed(2)}%`}
                  />
                </div>

                {/* Secondary metrics */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { label: 'CPC', value: formatCurrency(data.summary.cpc) },
                    { label: 'CPM', value: formatCurrency(data.summary.cpm) },
                    { label: 'Frequency', value: data.summary.frequency.toFixed(1) },
                  ].map(m => (
                    <div key={m.label} className="text-center py-2.5 rounded-xl bg-muted/20 border border-border/20">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">{m.label}</p>
                      <p className="text-sm font-bold tabular-nums text-foreground mt-0.5">{m.value}</p>
                    </div>
                  ))}
                </div>

                {data.summary.messaging > 0 && (
                  <div className="mt-3 px-3 py-2.5 rounded-xl bg-success/8 border border-success/15 flex items-center gap-2.5">
                    <TrendingUp className="w-3.5 h-3.5 text-success shrink-0" />
                    <span className="text-[11px] font-medium text-foreground">
                      {data.summary.messaging} conversations started via ads
                    </span>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="campaigns"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-4 py-3"
              >
                {data.campaigns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <p className="text-sm text-muted-foreground">No campaigns found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20">
                    {data.campaigns
                      .sort((a: any, b: any) => b.spend - a.spend)
                      .map((c: any) => (
                        <CampaignRow
                          key={c.id}
                          campaign={c}
                          maxSpend={Math.max(...data.campaigns.map((x: any) => x.spend))}
                        />
                      ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        ) : null}
      </div>
    </div>
  );
}
