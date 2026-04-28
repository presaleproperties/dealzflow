import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface QuickReply {
  label: string;
  body: string;
}

/**
 * Generates 3 AI-suggested quick replies for the current lead conversation.
 * Cached by (contactId, mode); call refetch() to regenerate.
 */
export function useLeadQuickReplies(
  contactId: string | undefined,
  mode: 'email' | 'text',
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['lead-quick-replies', contactId, mode],
    queryFn: async (): Promise<QuickReply[]> => {
      if (!contactId) return [];
      const { data, error } = await supabase.functions.invoke('lead-quick-replies', {
        body: { contact_id: contactId, mode },
      });
      if (error) throw error;
      return (data?.replies ?? []) as QuickReply[];
    },
    enabled: !!contactId && enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
