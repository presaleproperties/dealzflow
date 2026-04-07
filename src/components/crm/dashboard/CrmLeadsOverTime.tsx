import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { format, subDays, startOfDay } from 'date-fns';

export function CrmLeadsOverTime() {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-leads-over-time'],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30);
      const { data: contacts } = await supabase
        .from('crm_contacts')
        .select('created_at')
        .gte('created_at', thirtyDaysAgo.toISOString());

      // Build day buckets
      const buckets: Record<string, number> = {};
      for (let i = 30; i >= 0; i--) {
        const key = format(subDays(new Date(), i), 'yyyy-MM-dd');
        buckets[key] = 0;
      }
      (contacts ?? []).forEach((c) => {
        const key = format(startOfDay(new Date(c.created_at)), 'yyyy-MM-dd');
        if (buckets[key] !== undefined) buckets[key]++;
      });

      return Object.entries(buckets).map(([date, count]) => ({
        date: format(new Date(date), 'MMM d'),
        leads: count,
      }));
    },
    staleTime: 60_000,
  });

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm h-full">
      <h3 className="text-sm font-semibold text-foreground mb-4">Leads Over Time</h3>
      {isLoading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(39 67% 55%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(39 67% 55%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              className="fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              className="fill-muted-foreground"
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(222 25% 10%)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="leads"
              stroke="hsl(39 67% 55%)"
              strokeWidth={2}
              fill="url(#goldGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
