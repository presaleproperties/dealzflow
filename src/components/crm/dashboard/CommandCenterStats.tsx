import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Flame, MessageCircle, Mail, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function CommandCenterStats() {
  const navigate = useNavigate();
  const { data: contacts = [], isLoading: contactsLoading } = useCrmContacts();

  const { data: extra, isLoading: extraLoading } = useQuery({
    queryKey: ['cmd-center-stats'],
    queryFn: async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const [convos, emails] = await Promise.all([
        supabase
          .from('crm_whatsapp_conversations')
          .select('id', { count: 'exact', head: true })
          .gte('last_message_at', sevenDaysAgo.toISOString()),
        supabase
          .from('crm_email_log')
          .select('id', { count: 'exact', head: true })
          .gte('sent_at', sevenDaysAgo.toISOString()),
      ]);

      return {
        activeConvos: convos.count ?? 0,
        emailsSent7d: emails.count ?? 0,
      };
    },
    staleTime: 60_000,
  });

  const isLoading = contactsLoading || extraLoading;

  const stats = useMemo(() => {
    const active = contacts.filter(c => c.status !== 'Closed' && c.status !== 'Lost / Cold').length;
    const hot = contacts.filter(c =>
      c.status === 'Showing Booked' || c.status === 'Offer Made' || c.status === 'Hot / Engaged' ||
      (c.tags ?? []).some(t => t.toLowerCase().includes('hot'))
    ).length;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const leadsThisWeek = contacts.filter(c => c.created_at && new Date(c.created_at) >= weekStart).length;

    return { active, hot, leadsThisWeek };
  }, [contacts]);

  const cards = [
    { label: 'Active Leads', value: stats.active, icon: Users, color: 'hsl(39 67% 55%)', onClick: () => navigate('/crm/leads') },
    { label: '🔥 Hot Leads', value: stats.hot, icon: Flame, color: 'hsl(0 84% 60%)', accent: true, onClick: () => navigate('/crm/pipeline') },
    { label: 'Active Convos', value: extra?.activeConvos ?? 0, icon: MessageCircle, color: 'hsl(142 71% 45%)', onClick: () => navigate('/crm/whatsapp') },
    { label: 'Emails (7d)', value: extra?.emailsSent7d ?? 0, icon: Mail, color: 'hsl(262 60% 55%)', onClick: () => navigate('/crm/email') },
    { label: 'Leads This Week', value: stats.leadsThisWeek, icon: TrendingUp, color: 'hsl(210 62% 46%)', onClick: () => navigate('/crm/leads') },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
      {cards.map(card => (
        <button
          key={card.label}
          onClick={card.onClick}
          className="bg-card rounded-[10px] lg:rounded-xl border border-border p-3 sm:p-4 shadow-sm hover:border-primary/30 transition-colors text-left"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <card.icon className="w-4 h-4" style={{ color: card.color }} strokeWidth={2} />
            <span className="text-[11px] sm:text-xs text-muted-foreground truncate">{card.label}</span>
          </div>
          {isLoading ? (
            <Skeleton className="h-7 w-14" />
          ) : (
            <p className={`text-2xl sm:text-[28px] font-bold leading-none ${card.accent ? 'text-[hsl(39_67%_55%)]' : 'text-foreground'}`}>
              {card.value}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}
