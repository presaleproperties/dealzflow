import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Flame, Snowflake, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FunnelStats {
  never_touched: number;
  cold_30d: number;
  new_total: number;
  contacted_total: number;
  hot_total: number;
  showing_total: number;
  closed_total: number;
  total: number;
}

async function fetchFunnelStats(): Promise<FunnelStats> {
  // Single query, all aggregations server-side
  const { data, error } = await supabase.rpc('crm_funnel_snapshot' as never).single();
  if (!error && data) return data as FunnelStats;

  // Fallback: client-side aggregation if RPC missing
  const { data: rows } = await supabase
    .from('crm_contacts')
    .select('status, last_touch_at')
    .limit(10000);
  const list = rows ?? [];
  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const count = (pred: (r: any) => boolean) => list.filter(pred).length;
  return {
    never_touched: count((r) => r.status === 'New Lead' && !r.last_touch_at),
    cold_30d: count((r) => r.status === 'New Lead' && (!r.last_touch_at || r.last_touch_at < cutoff30)),
    new_total: count((r) => r.status === 'New Lead'),
    contacted_total: count((r) => r.status === 'Contacted'),
    hot_total: count((r) => r.status === 'Hot / Engaged'),
    showing_total: count((r) => r.status === 'Showing Booked'),
    closed_total: count((r) => r.status === 'Closed'),
    total: list.length,
  };
}

export function ConversionFunnelBanner() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['crm-funnel-snapshot'],
    queryFn: fetchFunnelStats,
    staleTime: 60_000,
  });

  if (isLoading) {
    return <Skeleton className="h-[88px] w-full rounded-lg" />;
  }
  if (!data) return null;

  const conversionRate =
    data.total > 0 ? ((data.closed_total / data.total) * 100).toFixed(1) : '0';

  const stages = [
    { label: 'New', count: data.new_total, status: 'New Lead' },
    { label: 'Contacted', count: data.contacted_total, status: 'Contacted' },
    { label: 'Hot', count: data.hot_total, status: 'Hot / Engaged' },
    { label: 'Showing', count: data.showing_total, status: 'Showing Booked' },
    { label: 'Closed', count: data.closed_total, status: 'Closed' },
  ];
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-0">
        {/* Left: Untouched alert */}
        <button
          onClick={() => navigate('/crm/leads?status=New+Lead&untouched=1')}
          className={cn(
            'flex items-center gap-3 px-4 py-3 text-left transition-colors border-b lg:border-b-0 lg:border-r border-border',
            data.never_touched > 100
              ? 'bg-destructive/10 hover:bg-destructive/15'
              : data.never_touched > 0
              ? 'bg-amber-500/10 hover:bg-amber-500/15'
              : 'bg-muted/30 hover:bg-muted/50',
          )}
        >
          <div
            className={cn(
              'flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center',
              data.never_touched > 100
                ? 'bg-destructive/20 text-destructive'
                : data.never_touched > 0
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {data.never_touched > 0 ? <Snowflake className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Untouched leads
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums">
                {data.never_touched.toLocaleString()}
              </span>
              <span className="text-[11px] text-muted-foreground">
                of {data.new_total.toLocaleString()} new
              </span>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>

        {/* Right: Funnel */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Pipeline conversion
            </div>
            <div className="flex items-center gap-1.5">
              {data.hot_total > 0 ? (
                <Flame className="w-3.5 h-3.5 text-orange-500" />
              ) : null}
              <span className="text-[11px] text-muted-foreground">
                {conversionRate}% closed of {data.total.toLocaleString()} total
              </span>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {stages.map((s) => {
              const pct = (s.count / maxCount) * 100;
              return (
                <button
                  key={s.label}
                  onClick={() => navigate(`/crm/leads?status=${encodeURIComponent(s.status)}`)}
                  className="group text-left"
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
                      {s.label}
                    </span>
                    <span className="text-xs font-semibold tabular-nums">
                      {s.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        s.label === 'Closed'
                          ? 'bg-emerald-500'
                          : s.label === 'Hot'
                          ? 'bg-orange-500'
                          : s.label === 'Showing'
                          ? 'bg-blue-500'
                          : s.label === 'Contacted'
                          ? 'bg-primary/70'
                          : 'bg-muted-foreground/40',
                      )}
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
