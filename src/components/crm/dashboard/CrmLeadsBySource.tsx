import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

export function CrmLeadsBySource() {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-leads-by-source'],
    queryFn: async () => {
      const { data: contacts } = await supabase
        .from('crm_contacts')
        .select('source');

      const counts: Record<string, number> = {};
      (contacts ?? []).forEach((c) => {
        const src = c.source || 'Unknown';
        counts[src] = (counts[src] ?? 0) + 1;
      });

      return Object.entries(counts)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);
    },
    staleTime: 60_000,
  });

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm h-full">
      <h3 className="text-sm font-semibold text-foreground mb-4">Leads by Source</h3>
      {isLoading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : !data?.length ? (
        <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
          No contacts yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              dataKey="source"
              type="category"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              width={100}
              tickLine={false}
              axisLine={false}
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
            <Bar dataKey="count" fill="hsl(39 67% 55%)" radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
