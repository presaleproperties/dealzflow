/**
 * Resolves the engagement-report URL filter param to a concrete set of
 * contact ids that the Leads table can constrain on. Backed by
 * `crm_contact_last_touch` view + `crm_engagement_events` table.
 *
 * Supported filters (mirrors the three /crm/reports/engagement cards):
 *   - cold_7d            → last_inbound_at IS NULL AND last_outbound_at < now-7d
 *   - high_engagement_14d → ≥3 engagement signals in last 14d
 *   - replied_30d        → contacts that replied to an email in last 30d,
 *                          returned in ascending reply-latency order
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const ENGAGEMENT_FILTER_LABELS: Record<string, string> = {
  cold_7d: 'Cold (7+ days)',
  high_engagement_14d: 'High engagement (14d)',
  replied_30d: 'Replied (30d)',
};

export type EngagementFilterKey = keyof typeof ENGAGEMENT_FILTER_LABELS;

export function isEngagementFilter(v: string | null | undefined): v is EngagementFilterKey {
  return !!v && v in ENGAGEMENT_FILTER_LABELS;
}

async function fetchIds(filter: EngagementFilterKey): Promise<string[]> {
  if (filter === 'cold_7d') {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await supabase
      .from('crm_contact_last_touch')
      .select('contact_id')
      .is('last_inbound_at', null)
      .lt('last_outbound_at', cutoff)
      .limit(2000);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.contact_id).filter(Boolean);
  }

  if (filter === 'high_engagement_14d') {
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data, error } = await supabase
      .from('crm_engagement_events')
      .select('contact_id')
      .in('event_type', ['email_opened', 'email_clicked', 'whatsapp_read', 'email_replied', 'sms_replied'])
      .gte('occurred_at', since)
      .limit(20000);
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as Array<{ contact_id: string }>) {
      counts.set(r.contact_id, (counts.get(r.contact_id) ?? 0) + 1);
    }
    return Array.from(counts.entries()).filter(([, n]) => n >= 3).map(([id]) => id);
  }

  if (filter === 'replied_30d') {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await supabase
      .from('crm_engagement_events')
      .select('contact_id, event_type, occurred_at')
      .in('event_type', ['email_sent', 'email_replied'])
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: true })
      .limit(20000);
    if (error) throw error;
    const lastSent = new Map<string, number>();
    const latency = new Map<string, number>();
    for (const r of (data ?? []) as Array<{ contact_id: string; event_type: string; occurred_at: string }>) {
      const t = new Date(r.occurred_at).getTime();
      if (r.event_type === 'email_sent') {
        if (!lastSent.has(r.contact_id)) lastSent.set(r.contact_id, t);
      } else if (r.event_type === 'email_replied' && lastSent.has(r.contact_id)) {
        const delta = t - (lastSent.get(r.contact_id) as number);
        if (!latency.has(r.contact_id) || delta < (latency.get(r.contact_id) as number)) {
          latency.set(r.contact_id, delta);
        }
        lastSent.delete(r.contact_id);
      }
    }
    return Array.from(latency.entries()).sort((a, b) => a[1] - b[1]).map(([id]) => id);
  }

  return [];
}

export function useEngagementFilterIds(filter: string | null | undefined) {
  const enabled = isEngagementFilter(filter);
  return useQuery({
    queryKey: ['engagement-filter-ids', filter],
    queryFn: () => fetchIds(filter as EngagementFilterKey),
    enabled,
    staleTime: 30_000,
  });
}
