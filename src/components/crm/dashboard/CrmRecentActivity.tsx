import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, UserPlus, CalendarDays, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  icon: typeof MessageCircle;
  color: string;
  text: string;
  time: string;
  raw: Date;
}

export function CrmRecentActivity() {
  const { data: items, isLoading } = useQuery({
    queryKey: ['crm-recent-activity'],
    queryFn: async () => {
      const [msgs, contacts, showings, tasks] = await Promise.all([
        supabase
          .from('crm_messages')
          .select('id, direction, channel, sent_by, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('crm_contacts')
          .select('id, first_name, last_name, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('crm_showings')
          .select('id, project, assigned_agent, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('crm_tasks')
          .select('id, title, status, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const all: ActivityItem[] = [];

      (msgs.data ?? []).forEach((m) =>
        all.push({
          id: `msg-${m.id}`,
          icon: MessageCircle,
          color: 'hsl(142 71% 45%)',
          text: `${m.direction === 'inbound' ? 'Received' : 'Sent'} ${m.channel ?? ''} message${m.sent_by ? ` by ${m.sent_by}` : ''}`,
          time: formatDistanceToNow(new Date(m.created_at), { addSuffix: true }),
          raw: new Date(m.created_at),
        })
      );

      (contacts.data ?? []).forEach((c) =>
        all.push({
          id: `contact-${c.id}`,
          icon: UserPlus,
          color: 'hsl(39 67% 55%)',
          text: `New contact: ${c.first_name} ${c.last_name}`,
          time: formatDistanceToNow(new Date(c.created_at), { addSuffix: true }),
          raw: new Date(c.created_at),
        })
      );

      (showings.data ?? []).forEach((s) =>
        all.push({
          id: `showing-${s.id}`,
          icon: CalendarDays,
          color: 'hsl(210 62% 46%)',
          text: `Showing booked: ${s.project}${s.assigned_agent ? ` — ${s.assigned_agent}` : ''}`,
          time: formatDistanceToNow(new Date(s.created_at), { addSuffix: true }),
          raw: new Date(s.created_at),
        })
      );

      (tasks.data ?? []).forEach((t) =>
        all.push({
          id: `task-${t.id}`,
          icon: CheckCircle,
          color: 'hsl(38 92% 50%)',
          text: `Task: ${t.title} (${t.status})`,
          time: formatDistanceToNow(new Date(t.created_at), { addSuffix: true }),
          raw: new Date(t.created_at),
        })
      );

      return all.sort((a, b) => b.raw.getTime() - a.raw.getTime()).slice(0, 10);
    },
    staleTime: 30_000,
  });

  return (
    <div className="bg-card rounded-[10px] lg:rounded-xl border border-border p-3 sm:p-4 lg:p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h3>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : !items?.length ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No activity yet — start by adding contacts.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors">
              <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: item.color }} strokeWidth={2} />
              <span className="text-sm text-foreground flex-1 truncate">{item.text}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{item.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
