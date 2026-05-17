/**
 * Engagement reports — three signal cards backed by `crm_engagement_events`
 * and the `crm_contact_last_touch` view. Each card is a drill-in link that
 * pre-filters the Leads list via `?filter=<key>`.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight } from 'lucide-react';

function Card({
  to,
  title,
  value,
  hint,
  loading,
}: {
  to: string;
  title: string;
  value: string | number;
  hint: string;
  loading?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</p>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
        {loading ? <Skeleton className="h-9 w-20" /> : value}
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">{hint}</p>
    </Link>
  );
}

export default function CrmEngagementReportsPage() {
  const cold = useQuery({
    queryKey: ['engagement-cold-leads'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('crm_contact_last_touch')
        .select('contact_id, last_inbound_at, last_outbound_at')
        .is('last_inbound_at', null)
        .lt('last_outbound_at', cutoff);
      if (error) throw error;
      return (data ?? []).length;
    },
  });

  const high = useQuery({
    queryKey: ['engagement-high'],
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('crm_engagement_events')
        .select('contact_id')
        .in('event_type', ['email_opened', 'email_clicked', 'whatsapp_read', 'email_replied', 'sms_replied'])
        .gte('occurred_at', since);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ contact_id: string }>) {
        counts[r.contact_id] = (counts[r.contact_id] ?? 0) + 1;
      }
      return Object.values(counts).filter((n) => n >= 3).length;
    },
  });

  const latency = useQuery({
    queryKey: ['engagement-reply-latency'],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('crm_engagement_events')
        .select('contact_id, event_type, occurred_at')
        .in('event_type', ['email_sent', 'email_replied'])
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: true });
      if (error) throw error;
      const lastSent: Record<string, number> = {};
      const deltas: number[] = [];
      for (const r of (data ?? []) as Array<{ contact_id: string; event_type: string; occurred_at: string }>) {
        const t = new Date(r.occurred_at).getTime();
        if (r.event_type === 'email_sent') {
          if (lastSent[r.contact_id] == null) lastSent[r.contact_id] = t;
        } else if (r.event_type === 'email_replied' && lastSent[r.contact_id] != null) {
          deltas.push((t - lastSent[r.contact_id]) / 60000);
          delete lastSent[r.contact_id];
        }
      }
      if (!deltas.length) return null;
      deltas.sort((a, b) => a - b);
      const m = deltas[Math.floor(deltas.length / 2)];
      return Math.round(m);
    },
  });

  const fmtMins = (m: number | null | undefined) => {
    if (m == null) return '—';
    if (m < 60) return `${m}m`;
    if (m < 1440) return `${Math.round(m / 60)}h`;
    return `${Math.round(m / 1440)}d`;
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Engagement</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Signals from the engagement event log. Tap a card to drill into the matching leads.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          to="/crm/leads?filter=cold_7d"
          title="Cold leads"
          value={cold.data ?? 0}
          hint="No inbound; last outbound more than 7 days ago"
          loading={cold.isLoading}
        />
        <Card
          to="/crm/leads?filter=high_engagement_14d"
          title="High engagement"
          value={high.data ?? 0}
          hint="3+ engagement signals in the last 14 days"
          loading={high.isLoading}
        />
        <Card
          to="/crm/leads?filter=replied_30d"
          title="Reply latency (median)"
          value={fmtMins(latency.data ?? null)}
          hint="Median time email_sent → email_replied, last 30 days"
          loading={latency.isLoading}
        />
      </div>
    </div>
  );
}
