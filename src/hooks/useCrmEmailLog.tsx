import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCrmEmailLog(contactId: string | undefined) {
  return useQuery({
    queryKey: ['crm-email-log', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('crm_email_log')
        .select('*')
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!contactId,
  });
}