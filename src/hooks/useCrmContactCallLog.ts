import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CrmCallLogRow = {
  id: string;
  contact_id: string | null;
  agent_user_id: string | null;
  direction: 'inbound' | 'outbound' | string;
  from_number: string | null;
  to_number: string | null;
  status: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  recording_url: string | null;
  recording_duration_sec: number | null;
  recording_sid: string | null;
  twilio_call_sid: string | null;
  error_code: string | null;
  error_message: string | null;
  voicemail_dropped_id: string | null;
  notes: string | null;
  created_at: string;
};

/** Fetches all phone calls logged for a single CRM contact. */
export function useCrmContactCallLog(contactId: string | undefined) {
  return useQuery({
    queryKey: ['crm-contact-call-log', contactId],
    queryFn: async (): Promise<CrmCallLogRow[]> => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('crm_call_log')
        .select('*')
        .eq('contact_id', contactId)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmCallLogRow[];
    },
    enabled: !!contactId,
  });
}
