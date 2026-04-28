import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Email send-log entries for this contact (one per outbound CRM email),
 * including aggregate open/click counters so we can show attribution.
 */
export function useCrmContactEmailSendLog(contactId: string | undefined) {
  return useQuery({
    queryKey: ['crm-email-send-log', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      // Read from crm_email_log — the source of truth for the email bridge
      // (inline composer + tracked sends). Shape it to match what the widget expects.
      const { data, error } = await supabase
        .from('crm_email_log')
        .select(
          'id, subject, sent_at, direction, open_count, click_count, last_opened_at, last_clicked_at, opened_at, clicked_at, tracking_id',
        )
        .eq('contact_id', contactId)
        .eq('direction', 'outbound')
        .order('sent_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        subject: r.subject,
        sent_at: r.sent_at,
        status: r.tracking_id ? 'sent' : 'sent',
        open_count: r.open_count ?? 0,
        click_count: r.click_count ?? 0,
        last_opened_at: r.last_opened_at ?? r.opened_at ?? null,
        last_clicked_at: r.last_clicked_at ?? r.clicked_at ?? null,
        clicked_url: null,
      }));
    },
    enabled: !!contactId,
    refetchInterval: 30_000,
  });
}

/**
 * Per-event email engagement (open / click / unsubscribe) for this contact.
 */
export function useCrmContactEmailEngagement(contactId: string | undefined) {
  return useQuery({
    queryKey: ['crm-email-engagement', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('crm_lead_behavior_engagement')
        .select('id, event_type, campaign_name, link_url, occurred_at, template_id, campaign_id')
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!contactId,
    refetchInterval: 30_000,
  });
}
