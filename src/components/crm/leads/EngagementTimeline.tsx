/**
 * Engagement timeline widget — last 50 events for a contact, rendered as a
 * compact log with Tabler-style outline icons. Fed by `crm_engagement_events`.
 */
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Mail, MessageSquare, MessageCircle, Phone, Tag, ArrowRight,
  CalendarCheck, User, Inbox, Bot,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface EngagementRow {
  id: string;
  event_type: string;
  source: string;
  direction: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
}

const ICONS: Record<string, typeof Mail> = {
  email_sent: Mail, email_delivered: Mail, email_opened: Mail, email_clicked: Mail,
  email_bounced: Mail, email_replied: Inbox,
  sms_sent: MessageSquare, sms_delivered: MessageSquare, sms_failed: MessageSquare, sms_replied: MessageSquare,
  whatsapp_sent: MessageCircle, whatsapp_delivered: MessageCircle, whatsapp_read: MessageCircle, whatsapp_replied: MessageCircle,
  call_made: Phone, call_received: Phone, call_missed: Phone, call_voicemail: Phone,
  stage_changed: ArrowRight,
  tag_added: Tag, tag_removed: Tag,
  note_added: User, task_added: User, task_completed: User,
  booking_created: CalendarCheck, booking_attended: CalendarCheck, booking_no_show: CalendarCheck,
  lead_created: User, lead_assigned: User, lead_reassigned: User,
  zara_handoff: Bot, zara_response_sent: Bot,
};

function label(type: string): string {
  return type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function snippetFor(row: EngagementRow): string | null {
  const m = row.metadata ?? {};
  if (typeof m.snippet === 'string') return m.snippet;
  if (typeof m.subject === 'string') return m.subject;
  if (typeof m.tag === 'string') return `#${m.tag}`;
  if (m.prev_stage && m.new_stage) return `${m.prev_stage} → ${m.new_stage}`;
  if (m.new_owner) return `→ ${m.new_owner}`;
  if (typeof m.title === 'string') return m.title;
  return null;
}

export function EngagementTimeline({ contactId }: { contactId: string | undefined }) {
  const query = useQuery({
    queryKey: ['engagement-events', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_engagement_events')
        .select('id, event_type, source, direction, occurred_at, metadata')
        .eq('contact_id', contactId!)
        .order('occurred_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as EngagementRow[];
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-border/60 bg-muted/30">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground">
          Engagement timeline
        </p>
      </div>
      <div className="p-3 min-h-[120px]">
        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ) : !query.data || query.data.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground text-center py-4">
            No engagement events yet
          </p>
        ) : (
          <ul className="space-y-1.5">
            {query.data.map((row) => {
              const Icon = ICONS[row.event_type] ?? User;
              const snip = snippetFor(row);
              return (
                <li
                  key={row.id}
                  className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/40 transition-colors"
                >
                  <div className="w-6 h-6 rounded border border-border/60 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-3 h-3 text-foreground/70" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[12.5px] font-medium text-foreground">{label(row.event_type)}</p>
                      <span className="text-[10px] px-1.5 py-0 rounded font-semibold bg-muted text-muted-foreground uppercase tracking-wide">
                        {row.source}
                      </span>
                      <p className="text-[10.5px] text-muted-foreground tabular-nums ml-auto">
                        {formatDistanceToNow(new Date(row.occurred_at), { addSuffix: true })}
                      </p>
                    </div>
                    {snip && (
                      <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">{snip}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
