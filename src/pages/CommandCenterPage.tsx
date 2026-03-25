import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import {
  Users, Zap, TrendingUp, MessageSquare,
  CircleDot, ArrowRightLeft, Star, MessageCircle,
  LayoutGrid, Handshake, Settings2, Home,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// ─── Animation helpers ─────────────────────────────────────────────────────────
const FadeUp = ({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
    className={className}
  >
    {children}
  </motion.div>
);

// ─── Data hooks ────────────────────────────────────────────────────────────────
function useCommandCenterData() {
  const { user } = useAuth();

  const { data: activeLeadsCount = 0 } = useQuery({
    queryKey: ['command-center-active-leads', user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'closed');
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: zaraCapturesCount = 0 } = useQuery({
    queryKey: ['command-center-zara-captures', user?.id],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { count } = await supabase
        .from('zara_activity')
        .select('*', { count: 'exact', head: true })
        .eq('action_type', 'captured')
        .gte('created_at', sevenDaysAgo.toISOString());
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: dealsThisMonthCount = 0 } = useQuery({
    queryKey: ['command-center-deals-month', user?.id],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'qualified')
        .gte('updated_at', startOfMonth);
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['command-center-unread', user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .gt('heat', 0)
        .neq('status', 'closed');
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: zaraActivity = [] } = useQuery({
    queryKey: ['command-center-zara-activity', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('zara_activity')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: pipelineData = {} } = useQuery({
    queryKey: ['command-center-pipeline', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('conversations')
        .select('status');
      if (!data) return {};
      const counts: Record<string, number> = {};
      data.forEach(({ status }) => {
        if (status) counts[status] = (counts[status] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user,
  });

  return {
    activeLeadsCount,
    zaraCapturesCount,
    dealsThisMonthCount,
    unreadCount,
    zaraActivity,
    pipelineData,
  };
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({
  label,
  value,
  icon: Icon,
  colorVar,
  delay,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  colorVar: string;
  delay: number;
}) {
  return (
    <FadeUp delay={delay}>
      <div className="card-premium p-4 flex items-start gap-3.5 h-full">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: `hsl(${colorVar} / 0.12)` }}
        >
          <Icon className="w-4 h-4" style={{ color: `hsl(${colorVar})` }} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums leading-none mb-1">
            {value}
          </p>
          <p className="text-xs text-muted-foreground leading-snug">{label}</p>
        </div>
      </div>
    </FadeUp>
  );
}

// ─── Zara Activity Icon ────────────────────────────────────────────────────────
function ActivityIcon({ type }: { type: string }) {
  if (type === 'captured') return (
    <span className="w-6 h-6 rounded-full bg-success/15 flex items-center justify-center shrink-0">
      <CircleDot className="w-3 h-3 text-success" />
    </span>
  );
  if (type === 'synced_to_leads') return (
    <span className="w-6 h-6 rounded-full bg-info/15 flex items-center justify-center shrink-0">
      <ArrowRightLeft className="w-3 h-3 text-info" />
    </span>
  );
  if (type === 'qualified') return (
    <span className="w-6 h-6 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
      <Star className="w-3 h-3 text-warning" />
    </span>
  );
  if (type === 'conversation') return (
    <span className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
      <MessageCircle className="w-3 h-3 text-primary" />
    </span>
  );
  return (
    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
      <Zap className="w-3 h-3 text-muted-foreground" />
    </span>
  );
}

// ─── Pipeline Funnel ───────────────────────────────────────────────────────────
const FUNNEL_STAGES = [
  { key: 'new',       label: 'New',       colorVar: 'var(--muted-foreground)' },
  { key: 'contacted', label: 'Contacted', colorVar: 'hsl(var(--info))' },
  { key: 'qualified', label: 'Qualified', colorVar: 'hsl(var(--warning))' },
  { key: 'closed',    label: 'Closed',    colorVar: 'hsl(var(--success))' },
];

function PipelineFunnel({ data }: { data: Record<string, number> }) {
  const stagesWithCounts = FUNNEL_STAGES.map(s => ({
    ...s,
    count: data[s.key] ?? 0,
  }));
  const totalCount = stagesWithCounts.reduce((s, x) => s + x.count, 0);
  const maxCount = Math.max(...stagesWithCounts.map(s => s.count), 1);
  const hasData = totalCount > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-9 h-9 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
          <TrendingUp className="w-4 h-4 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground">No pipeline data yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Lead stages will appear here as conversations move through the funnel
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stagesWithCounts.map((stage, i) => {
        const pct = Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 3 : 0);
        return (
          <motion.div
            key={stage.key}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55 + i * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3"
          >
            <span className="text-xs text-muted-foreground w-20 shrink-0 text-right font-medium">
              {stage.label}
            </span>
            <div className="flex-1 h-7 rounded-lg bg-muted/30 overflow-hidden relative flex items-center">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ delay: 0.6 + i * 0.06, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-lg absolute left-0 top-0"
                style={{ background: stage.colorVar, opacity: 0.75 }}
              />
              {stage.count > 0 && (
                <span
                  className="relative z-10 text-xs font-semibold pl-2.5"
                  style={{ color: stage.colorVar }}
                >
                  {stage.count}
                </span>
              )}
            </div>
            <span
              className="text-sm font-bold tabular-nums w-6 shrink-0 text-right"
              style={{ color: stage.colorVar }}
            >
              {stage.count}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Quick Links ───────────────────────────────────────────────────────────────
const QUICK_LINKS = [
  { label: 'All Leads',     to: '/dashboard',     icon: LayoutGrid },
  { label: 'Conversations', to: '/conversations',  icon: MessageSquare },
  { label: 'Deals',         to: '/deals',          icon: Handshake },
  { label: 'Settings',      to: '/settings',       icon: Settings2 },
];

// ─── Google Calendar with dark mode filter ─────────────────────────────────────
function CalendarEmbed() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <iframe
      src="https://calendar.google.com/calendar/embed?src=info%40meetuzair.com&ctz=America%2FVancouver&mode=WEEK&showTitle=0&showNav=1&showPrint=0&showCalendars=0&showTz=0&showTabs=0&showDate=1"
      className="absolute inset-0 w-full h-full border-0 rounded-b-xl"
      title="Google Calendar"
      style={{
        filter: isDark
          ? 'invert(0.88) hue-rotate(180deg) saturate(0.9) brightness(0.95)'
          : 'none',
        transition: 'filter 0.3s ease',
      }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    />
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function CommandCenterPage() {
  const {
    activeLeadsCount,
    zaraCapturesCount,
    dealsThisMonthCount,
    unreadCount,
    zaraActivity,
    pipelineData,
  } = useCommandCenterData();

  const kpiCards = [
    { label: 'Active Leads',        value: activeLeadsCount,    icon: Users,         colorVar: 'var(--primary)',     delay: 0.04 },
    { label: 'Zara Captures (7d)',   value: zaraCapturesCount,   icon: Zap,           colorVar: 'var(--success)',     delay: 0.08 },
    { label: 'Deals This Month',     value: dealsThisMonthCount, icon: TrendingUp,    colorVar: 'var(--warning)',     delay: 0.12 },
    { label: 'Unread Conversations', value: unreadCount,         icon: MessageSquare, colorVar: 'var(--destructive)', delay: 0.16 },
  ];

  return (
    <AppLayout>
      <Header
        title="Command Center"
        subtitle="Your morning briefing — leads, activity & schedule"
        showAddDeal={false}
      />

      <div className="p-4 md:p-7 lg:p-6 space-y-5 pb-28 lg:pb-8">

        {/* ── KPI Row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpiCards.map((card) => (
            <KPICard key={card.label} {...card} />
          ))}
        </div>

        {/* ── Calendar + Activity ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Calendar — 60% */}
          <FadeUp delay={0.22} className="lg:col-span-3">
            <div className="card-premium overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <h2 className="text-sm font-semibold text-foreground">This Week's Schedule</h2>
              </div>
              {/* Fixed height container — tall enough to show full day */}
              <div className="relative h-[500px] md:h-[560px]">
                <CalendarEmbed />
              </div>
            </div>
          </FadeUp>

          {/* Zara Activity — 40% */}
          <FadeUp delay={0.28} className="lg:col-span-2">
            <div className="card-premium overflow-hidden flex flex-col" style={{ minHeight: '560px' }}>
              <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-success" />
                <h2 className="text-sm font-semibold text-foreground">Zara Activity Log</h2>
              </div>

              <div className="flex-1 overflow-y-auto">
                {zaraActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center h-full min-h-[200px]">
                    <div className="w-10 h-10 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                      <Zap className="w-5 h-5 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-medium text-foreground">No activity yet</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-[200px]">
                      Zara will log captures, qualifications, and syncs here automatically
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {zaraActivity.map((entry: any, i: number) => (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.32 + i * 0.03, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        className="flex items-start gap-3 px-5 py-3.5 hover:bg-muted/20 transition-colors"
                      >
                        <ActivityIcon type={entry.action_type} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                            {entry.description || entry.action_type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </FadeUp>
        </div>

        {/* ── Pipeline Funnel ─────────────────────────────────────── */}
        <FadeUp delay={0.38}>
          <div className="card-premium p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-1.5 h-1.5 rounded-full bg-warning" />
              <h2 className="text-sm font-semibold text-foreground">Lead Pipeline</h2>
              <span className="text-xs text-muted-foreground ml-1">— progression by stage</span>
            </div>
            <PipelineFunnel data={pipelineData as Record<string, number>} />
          </div>
        </FadeUp>

        {/* ── Quick Links ─────────────────────────────────────────── */}
        <FadeUp delay={0.44}>
          {/* On mobile: single column full-width. On sm+: 2-col. On lg+: 4-col */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {QUICK_LINKS.map((link, i) => {
              const Icon = link.icon;
              return (
                <motion.div
                  key={link.to}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.46 + i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link
                    to={link.to}
                    className={cn(
                      'flex items-center gap-3.5 px-4 py-4 rounded-xl border border-border/50',
                      'bg-card/70 hover:bg-card hover:border-border transition-all duration-200',
                      'hover:shadow-[0_4px_16px_-4px_hsl(0_0%_0%/0.08)]',
                      'group w-full'
                    )}
                  >
                    <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                      <Icon className="w-4.5 h-4.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {link.label}
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </FadeUp>

      </div>
    </AppLayout>
  );
}
