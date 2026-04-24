import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EmailClickEvent {
  link_url: string | null;
  occurred_at: string;
  tracking_id: string | null;
}

/**
 * Fetch all email_click engagement events for a contact and bucket them by
 * tracking_id so the email history view can show which links each sent
 * message generated clicks on.
 */
export function useCrmEmailClicks(contactId: string | undefined) {
  return useQuery({
    queryKey: ['crm-email-clicks', contactId],
    queryFn: async () => {
      const map: Record<string, EmailClickEvent[]> = {};
      if (!contactId) return map;
      const { data, error } = await supabase
        .from('crm_lead_behavior_engagement')
        .select('link_url, occurred_at, metadata')
        .eq('contact_id', contactId)
        .eq('event_type', 'email_click')
        .order('occurred_at', { ascending: true });
      if (error) throw error;
      for (const row of data ?? []) {
        const tid =
          (row.metadata as { tracking_id?: string } | null)?.tracking_id ?? null;
        if (!tid) continue;
        (map[tid] ||= []).push({
          link_url: row.link_url,
          occurred_at: row.occurred_at,
          tracking_id: tid,
        });
      }
      return map;
    },
    enabled: !!contactId,
  });
}
