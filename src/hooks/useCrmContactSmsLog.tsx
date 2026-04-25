import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CrmSmsLogRow = {
  id: string;
  contact_id: string | null;
  user_id: string | null;
  direction: 'inbound' | 'outbound' | string | null;
  to_number: string | null;
  from_number: string | null;
  body: string | null;
  status: string | null;
  twilio_message_sid: string | null;
  error_message: string | null;
  error_code: string | null;
  sent_at: string | null;
  created_at: string;
  delivered_at: string | null;
  message_type: string | null;
  media_urls: string[] | null;
  num_segments: number | null;
  channel: 'sms' | 'whatsapp' | string | null;
};

/**
 * Fetches all SMS / WhatsApp messages logged for a single CRM contact so they
 * can be merged into the lead activity timeline.
 */
export function useCrmContactSmsLog(contactId: string | undefined) {
  return useQuery({
    queryKey: ['crm-contact-sms-log', contactId],
    queryFn: async (): Promise<CrmSmsLogRow[]> => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('crm_sms_log')
        .select('*')
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CrmSmsLogRow[];
    },
    enabled: !!contactId,
  });
}
