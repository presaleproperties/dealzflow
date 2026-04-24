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
      const { data, error } = await supabase
        .from('crm_email_send_log')
        .select(
          'id, subject, sent_at, status, template_id, template_type, campaign_id, open_count, click_count, last_opened_at, last_clicked_at, clicked_url',
        )
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
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
