import { useNavigate } from 'react-router-dom';
import { Clock, Mail, MessageCircle, UserPlus, CalendarDays, CheckCircle, Zap, ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { formatContactName } from '@/lib/format';
import type { LucideIcon } from 'lucide-react';

interface FeedItem {
  id: string;
  icon: LucideIcon;
  color: string;
  text: string;
  time: string;
  raw: Date;
  link?: string;
}

export function ActivityFeedColumn() {
  const navigate = useNavigate();

  const { data: items, isLoading } = useQuery({
    queryKey: ['cmd-activity-feed'],
    queryFn: async () => {
      const [emails, msgs, contacts, showings] = await Promise.all([
        supabase.from('crm_email_log').select('id, contact_id, subject, sent_at').order('sent_at', { ascending: false }).limit(8),
        supabase.from('crm_messages').select('id, direction, channel, sent_by, contact_id, created_at').order('created_at', { ascending: false }).limit(8),
        supabase.from('crm_contacts').select('id, first_name, last_name, created_at').order('created_at', { ascending: false }).limit(8),
        supabase.from('crm_showings').select('id, project, contact_id, created_at').order('created_at', { ascending: false }).limit(5),
      ]);

      const cIds = new Set<string>();
      (emails.data ?? []).forEach(e => e.contact_id && cIds.add(e.contact_id));
      (msgs.data ?? []).forEach(m => (m as any).contact_id && cIds.add((m as any).contact_id));

      let names: Record<string, string> = {};
      if (cIds.size > 0) {
        const { data: cl } = await supabase.from('crm_contacts').select('id, first_name, last_name').in('id', Array.from(cIds));
        (cl ?? []).forEach(c => { names[c.id] = formatContactName(c.first_name, c.last_name); });
      }

      const all: FeedItem[] = [];

      (emails.data ?? []).forEach(e => all.push({
        id: `e-${e.id}`, icon: Mail, color: 'hsl(262 60% 55%)',
        text: `Emailed ${names[e.contact_id] || 'contact'} — ${e.subject || '(no subject)'}`,
        time: formatDistanceToNow(new Date(e.sent_at), { addSuffix: true }),
        raw: new Date(e.sent_at),
        link: `/crm/leads/${e.contact_id}`,
      }));

      (msgs.data ?? []).forEach(m => all.push({
        id: `m-${m.id}`, icon: MessageCircle, color: 'hsl(142 71% 45%)',
        text: `${m.direction === 'inbound' ? 'Received' : 'Sent'} ${m.channel ?? ''} message`,
        time: formatDistanceToNow(new Date(m.created_at), { addSuffix: true }),
        raw: new Date(m.created_at),
        link: (m as any).contact_id ? `/crm/leads/${(m as any).contact_id}` : undefined,
      }));

      (contacts.data ?? []).forEach(c => all.push({
        id: `c-${c.id}`, icon: UserPlus, color: 'hsl(var(--primary))',
        text: `New: ${formatContactName(c.first_name, c.last_name)}`,
        time: formatDistanceToNow(new Date(c.created_at), { addSuffix: true }),
        raw: new Date(c.created_at),
        link: `/crm/leads/${c.id}`,
      }));

      (showings.data ?? []).forEach(s => all.push({
        id: `s-${s.id}`, icon: CalendarDays, color: 'hsl(210 62% 46%)',
        text: `Showing: ${s.project}`,
        time: formatDistanceToNow(new Date(s.created_at), { addSuffix: true }),
        raw: new Date(s.created_at),
        link: s.contact_id ? `/crm/leads/${s.contact_id}` : undefined,
      }));

      return all.sort((a, b) => b.raw.getTime() - a.raw.getTime()).slice(0, 20);
    },
    staleTime: 30_000,
  });

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
      </div>

      <div className="space-y-0.5 max-h-[350px] overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)
        ) : !items?.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">No activity yet</p>
        ) : (
          items.map(item => (
            <button
              key={item.id}
              onClick={() => item.link && navigate(item.link)}
              className="flex items-center gap-2.5 w-full py-2 px-2 rounded-md hover:bg-muted/40 transition-colors text-left"
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" style={{ color: item.color }} />
              <span className="text-[12px] text-foreground flex-1 truncate">{item.text}</span>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{item.time}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
