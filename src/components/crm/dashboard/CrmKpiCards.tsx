import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Users, CalendarDays, Mail, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function CrmKpiCards() {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-dashboard-kpis'],
    queryFn: async () => {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);

      // Paginate contacts to handle >1000 records
      const PAGE_SIZE = 1000;
      let allContacts: { id: string; status: string | null }[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: batch, error } = await supabase
          .from('crm_contacts')
          .select('id, status')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (batch && batch.length > 0) {
          allContacts = allContacts.concat(batch);
          from += PAGE_SIZE;
          hasMore = batch.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      const [showings, campaigns] = await Promise.all([
        supabase
          .from('crm_showings')
          .select('id')
          .gte('showing_date', startOfWeek.toISOString().split('T')[0])
          .lt('showing_date', endOfWeek.toISOString().split('T')[0]),
        supabase
          .from('crm_email_campaigns')
          .select('recipients_count')
          .eq('status', 'sent')
          .gte('sent_at', thirtyDaysAgo.toISOString()),
      ]);
      const activeLeads = allContacts.filter(
        (c) => c.status !== 'Closed' && c.status !== 'Lost / Cold'
      ).length;
      const closed = allContacts.filter((c) => c.status === 'Closed').length;
      const total = allContacts.length;
      const conversionRate = total > 0 ? Math.round((closed / total) * 100) : 0;

      const showingsThisWeek = showings.data?.length ?? 0;

      const emailsSent = (campaigns.data ?? []).reduce(
        (sum, c) => sum + (c.recipients_count ?? 0),
        0
      );

      return { activeLeads, showingsThisWeek, emailsSent, conversionRate };
    },
    staleTime: 60_000,
  });

  const cards = [
    {
      label: 'Active Leads',
      value: data?.activeLeads ?? 0,
      icon: Users,
      color: 'hsl(39 67% 55%)',
      bg: 'hsl(39 67% 55% / 0.12)',
    },
    {
      label: 'Showings This Week',
      value: data?.showingsThisWeek ?? 0,
      icon: CalendarDays,
      color: 'hsl(142 71% 45%)',
      bg: 'hsl(142 71% 45% / 0.12)',
    },
    {
      label: 'Emails Sent (30d)',
      value: data?.emailsSent ?? 0,
      icon: Mail,
      color: 'hsl(38 92% 50%)',
      bg: 'hsl(38 92% 50% / 0.12)',
    },
    {
      label: 'Conversion Rate',
      value: `${data?.conversionRate ?? 0}%`,
      icon: TrendingUp,
      color: 'hsl(39 67% 55%)',
      bg: 'hsl(39 67% 55% / 0.12)',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-card rounded-[10px] lg:rounded-xl border border-border p-3 sm:p-4 shadow-sm flex items-start gap-2 sm:gap-3"
        >
          <div
            className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex-shrink-0"
            style={{ background: card.bg }}
          >
            <card.icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: card.color }} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            {isLoading ? (
              <Skeleton className="h-6 sm:h-7 w-12 sm:w-16 mb-1" />
            ) : (
              <p className="text-xl sm:text-2xl font-bold text-foreground leading-none">{card.value}</p>
            )}
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
