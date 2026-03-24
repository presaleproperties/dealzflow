import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Users, Zap, CalendarCheck, TrendingUp, ArrowRight } from 'lucide-react';
import { startOfWeek, endOfWeek } from 'date-fns';

interface ConversationRow {
  id: string;
  status: string;
  assigned_to: string;
  created_at: string;
}

interface MessageRow {
  conversation_id: string;
  direction: string;
  sender: string;
  created_at: string;
}

function useLeadsAnalytics() {
  const { user } = useAuth();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

  const { data: allConvs = [] } = useQuery<ConversationRow[]>({
    queryKey: ['leads-analytics-convs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, status, assigned_to, created_at');
      if (error) throw error;
      return data as ConversationRow[];
    },
    enabled: !!user,
  });

  const { data: weekMessages = [] } = useQuery<MessageRow[]>({
    queryKey: ['leads-analytics-msgs', weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('conversation_id, direction, sender, created_at')
        .gte('created_at', weekStart)
        .lte('created_at', weekEnd);
      if (error) throw error;
      return data as MessageRow[];
    },
    enabled: !!user,
  });

  return useMemo(() => {
    const thisWeek = allConvs.filter(
      c => c.created_at >= weekStart && c.created_at <= weekEnd
    );

    const totalThisWeek = thisWeek.length;

    // Qualified = status in qualified/booked/closed
    const qualifiedStatuses = new Set(['qualified', 'booked', 'closed']);
    const qualified = allConvs.filter(c => qualifiedStatuses.has(c.status)).length;
    const qualificationRate =
      allConvs.length > 0 ? Math.round((qualified / allConvs.length) * 100) : 0;

    // Zara response rate: conversations assigned to zara that have ≥1 outbound zara message this week
    const zaraConvIds = new Set(
      allConvs.filter(c => c.assigned_to === 'zara').map(c => c.id)
    );
    const zaraReplied = new Set(
      weekMessages
        .filter(m => m.sender === 'zara' && m.direction === 'outbound')
        .map(m => m.conversation_id)
    );
    const zaraResponseRate =
      zaraConvIds.size > 0
        ? Math.round((zaraReplied.size / zaraConvIds.size) * 100)
        : 0;

    // Booked appointments = conversations with status "booked"
    const booked = allConvs.filter(c => c.status === 'booked').length;

    // Hot leads = heat ≥ 70 isn't in the query, use engaged+qualified+booked as proxy for "warm pipeline"
    const activePipeline = allConvs.filter(
      c => !['disqualified', 'closed', 'unresponsive'].includes(c.status)
    ).length;

    return {
      totalThisWeek,
      qualificationRate,
      zaraResponseRate,
      booked,
      activePipeline,
      totalAll: allConvs.length,
    };
  }, [allConvs, weekMessages, weekStart, weekEnd]);
}

const STATS = [
  {
    key: 'week',
    labelFn: () => 'Leads This Week',
    valueFn: (d: ReturnType<typeof useLeadsAnalytics>) => String(d.totalThisWeek),
    subtitleFn: (d: ReturnType<typeof useLeadsAnalytics>) =>
      `${d.totalAll} total · ${d.activePipeline} active`,
    icon: Users,
    accent: 'text-blue-700 dark:text-blue-400',
    dot: 'bg-blue-500',
    border: 'border-blue-200/50 dark:border-blue-900/40',
    bg: 'bg-blue-50/60 dark:bg-blue-950/15',
  },
  {
    key: 'qual',
    labelFn: () => 'Qualification Rate',
    valueFn: (d: ReturnType<typeof useLeadsAnalytics>) => `${d.qualificationRate}%`,
    subtitleFn: () => 'Qualified or booked',
    icon: TrendingUp,
    accent: 'text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    border: 'border-emerald-200/50 dark:border-emerald-900/40',
    bg: 'bg-emerald-50/60 dark:bg-emerald-950/15',
  },
  {
    key: 'zara',
    labelFn: () => 'Zara Response Rate',
    valueFn: (d: ReturnType<typeof useLeadsAnalytics>) => `${d.zaraResponseRate}%`,
    subtitleFn: () => 'Replied this week',
    icon: Zap,
    accent: 'text-violet-700 dark:text-violet-400',
    dot: 'bg-violet-500',
    border: 'border-violet-200/50 dark:border-violet-900/40',
    bg: 'bg-violet-50/60 dark:bg-violet-950/15',
  },
  {
    key: 'booked',
    labelFn: () => 'Booked Appts',
    valueFn: (d: ReturnType<typeof useLeadsAnalytics>) => String(d.booked),
    subtitleFn: () => 'Total appointments',
    icon: CalendarCheck,
    accent: 'text-orange-700 dark:text-orange-400',
    dot: 'bg-orange-500',
    border: 'border-orange-200/50 dark:border-orange-900/40',
    bg: 'bg-orange-50/60 dark:bg-orange-950/15',
  },
] as const;

export function LeadsAnalyticsCard() {
  const data = useLeadsAnalytics();

  return (
    <div className="space-y-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/70">
            Lead Intelligence
          </span>
        </div>
        <Link
          to="/leads"
          className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
        >
          View Hub
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* 4-stat grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {STATS.map((stat, idx) => {
          const Icon = stat.icon;
          const value = stat.valueFn(data);
          const subtitle = stat.subtitleFn(data);
          const label = stat.labelFn();

          return (
            <motion.div
              key={stat.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'rounded-2xl p-3.5 border relative overflow-hidden',
                'transition-transform duration-300 hover:-translate-y-0.5 cursor-default',
                stat.bg,
                stat.border,
              )}
            >
              {/* Shine line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10" />

              {/* Label + icon */}
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', stat.dot)} />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/70 leading-none">
                    {label}
                  </span>
                </div>
                <Icon className={cn('h-3.5 w-3.5 opacity-40', stat.accent)} />
              </div>

              {/* Value */}
              <p className={cn('text-[24px] font-bold tracking-[-0.03em] leading-none mb-1', stat.accent)}>
                {value}
              </p>

              {/* Subtitle */}
              <p className="text-[11px] text-muted-foreground/60 leading-tight truncate">
                {subtitle}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
