import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { format, subDays, startOfDay } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCrmContacts } from '@/hooks/useCrmContacts';

export function CrmLeadsOverTime() {
  const isMobile = useIsMobile();
  const { data: contacts = [], isLoading } = useCrmContacts();

  const chartData = useMemo(() => {
    const thirtyDaysAgo = subDays(new Date(), 30);
    const buckets: Record<string, number> = {};
    for (let i = 30; i >= 0; i--) {
      const key = format(subDays(new Date(), i), 'yyyy-MM-dd');
      buckets[key] = 0;
    }
    contacts.forEach((c) => {
      if (!c.created_at) return;
      const d = new Date(c.created_at);
      if (d < thirtyDaysAgo) return;
      const key = format(startOfDay(d), 'yyyy-MM-dd');
      if (buckets[key] !== undefined) buckets[key]++;
    });
    return Object.entries(buckets).map(([date, count]) => ({
      date: format(new Date(date), 'MMM d'),
      leads: count,
    }));
  }, [contacts]);

  const chartHeight = isMobile ? 200 : 220;

  return (
    <div className="bg-card rounded-[10px] lg:rounded-xl border border-border p-3 sm:p-4 lg:p-5 shadow-sm h-full">
      <h3 className="text-sm font-semibold text-foreground mb-3 sm:mb-4">Leads Over Time</h3>
      {isLoading ? (
        <Skeleton className="h-[200px] sm:h-[220px] w-full" />
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
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
              interval={isMobile ? 1 : 'preserveStartEnd'}
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
