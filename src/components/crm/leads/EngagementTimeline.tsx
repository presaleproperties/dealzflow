/**
 * Engagement timeline — editorial day-grouped feed of the last 50 events for a
 * lead. Zara events get richer rendering (channel + intent + snippet) so the
 * agent can see at a glance what Zara did.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format, isToday, isYesterday, startOfDay } from 'date-fns';
import {
  Mail, MessageSquare, MessageCircle, Phone, Tag, ArrowRight,
  CalendarCheck, User, Inbox, Sparkles, ChevronDown,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Pill } from '@/components/crm/shared/Pill';

interface EngagementRow {
  id: string;
  event_type: string;
  source: string;
  direction: string | null;
  occurred_at: string;
  metadata: Record<string, any> | null;
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
  zara_handoff: Sparkles, zara_response_sent: Sparkles, zara_enabled: Sparkles, zara_disabled: Sparkles,
};

function label(type: string): string {
  const map: Record<string, string> = {
    zara_handoff: 'Zara drafted reply',
    zara_response_sent: 'Zara sent message',
    zara_enabled: 'Zara enabled',
    zara_disabled: 'Zara paused',
    email_sent: 'Email sent',
    email_opened: 'Email opened',
    email_clicked: 'Email clicked',
    email_replied: 'Email reply received',
    sms_sent: 'SMS sent',
    sms_replied: 'SMS reply received',
    call_made: 'Call placed',
    call_received: 'Call received',
    stage_changed: 'Stage changed',
    booking_created: 'Showing booked',
    note_added: 'Note added',
  };
  return map[type] ?? type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function snippetFor(row: EngagementRow): string | null {
  const m = row.metadata ?? {};
  if (typeof m.snippet === 'string') return m.snippet;
  if (typeof m.subject === 'string') return m.subject;
  if (typeof m.body === 'string') return String(m.body).slice(0, 140);
  if (typeof m.tag === 'string') return `#${m.tag}`;
  if (m.prev_stage && m.new_stage) return `${m.prev_stage} → ${m.new_stage}`;
  if (m.new_owner) return `→ ${m.new_owner}`;
  if (typeof m.title === 'string') return m.title;
  return null;
}

function bucketLabel(d: Date): string {
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEE, MMM d');
}

function ZaraEventDetails({ row }: { row: EngagementRow }) {
  const [open, setOpen] = useState(false);
  const m = row.metadata ?? {};
  const channel = m.channel ?? null;
  const intent = m.intent ?? null;
  const confidence = m.confidence != null ? Math.round(Number(m.confidence) * 100) : null;
  const ragProjects: Array<{ name: string }> = Array.isArray(m.rag_projects) ? m.rag_projects : [];
  const guardrails: string[] = Array.isArray(m.guardrails_hit) ? m.guardrails_hit : [];

  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-1 flex-wrap">
        {channel && <Pill size="sm" tone="muted">{String(channel).toUpperCase()}</Pill>}
        {intent && <Pill size="sm" tone="muted">{String(intent).replace(/_/g, ' ')}</Pill>}
        {confidence != null && (
          <Pill size="sm" tone={confidence >= 70 ? 'success' : confidence >= 40 ? 'warning' : 'danger'}>
            {confidence}% confidence
          </Pill>
        )}
        {guardrails.length > 0 && <Pill size="sm" tone="warning">{guardrails.length} guardrail</Pill>}
      </div>
      {(ragProjects.length > 0 || guardrails.length > 0 || m.reasoning) && (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          Details <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
      {open && (
        <div className="rounded-md border border-border/60 bg-card/60 p-2 text-[11px] space-y-1">
          {ragProjects.length > 0 && (
            <div><span className="text-muted-foreground">Sources:</span> {ragProjects.map((p) => p.name).join(' · ')}</div>
          )}
          {guardrails.length > 0 && (
            <div><span className="text-muted-foreground">Guardrails:</span> {guardrails.join(', ')}</div>
          )}
          {typeof m.reasoning === 'string' && (
            <div className="text-muted-foreground italic">"{m.reasoning.slice(0, 220)}"</div>
          )}
        </div>
      )}
    </div>
  );
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

  const grouped = useMemo(() => {
    if (!query.data) return [];
    const buckets = new Map<string, { key: string; label: string; rows: EngagementRow[] }>();
    for (const row of query.data) {
      const day = startOfDay(new Date(row.occurred_at)).toISOString();
      if (!buckets.has(day)) {
        buckets.set(day, { key: day, label: bucketLabel(new Date(row.occurred_at)), rows: [] });
      }
      buckets.get(day)!.rows.push(row);
    }
    return Array.from(buckets.values());
  }, [query.data]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
          Engagement timeline
        </p>
        {query.data && query.data.length > 0 && (
          <span className="text-[10.5px] text-muted-foreground tabular-nums">{query.data.length} events</span>
        )}
      </div>
      <div className="p-3 min-h-[120px]">
        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ) : !query.data || query.data.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground text-center py-8">
            No engagement events yet
          </p>
        ) : (
          <div className="space-y-3">
            {grouped.map((bucket) => (
              <div key={bucket.key}>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold px-1 mb-1.5">
                  {bucket.label}
                </div>
                <ul className="relative space-y-1 before:absolute before:left-[14px] before:top-2 before:bottom-2 before:w-px before:bg-border/60">
                  {bucket.rows.map((row) => {
                    const Icon = ICONS[row.event_type] ?? User;
                    const snip = snippetFor(row);
                    const isZara = row.source === 'zara' || row.event_type.startsWith('zara_');
                    return (
                      <li
                        key={row.id}
                        className="relative flex items-start gap-2.5 pl-1 pr-2 py-2 rounded-md hover:bg-muted/40 transition-colors"
                      >
                        <div
                          className={`relative z-10 w-7 h-7 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                            isZara
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border bg-background text-foreground/70'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" strokeWidth={1.6} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <p className={`text-[12.5px] font-semibold tracking-tight ${isZara ? 'text-foreground' : 'text-foreground'}`}>
                              {label(row.event_type)}
                            </p>
                            {row.direction && (
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {row.direction}
                              </span>
                            )}
                            <p className="text-[10.5px] text-muted-foreground tabular-nums ml-auto">
                              {format(new Date(row.occurred_at), 'h:mm a')}
                            </p>
                          </div>
                          {snip && (
                            <p className="text-[12px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                              {snip}
                            </p>
                          )}
                          {isZara && <ZaraEventDetails row={row} />}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground/70 text-center pt-1">
              Updated {formatDistanceToNow(new Date((query.data[0]?.occurred_at) ?? new Date()), { addSuffix: true })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
