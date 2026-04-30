import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContactEmailThread {
  id: string;
  contact_id: string;
  subject: string | null;
  last_message_at: string | null;
  last_message_snippet: string | null;
  last_message_from: string | null;
  message_count: number;
  unread_count: number;
}

/**
 * Returns the list of subject-grouped email threads for a given contact —
 * i.e. each row is one Gmail thread (subject), not one message. Powers the
 * Outlook-style expand/collapse drop-down on email rows in the chats list.
 */
export function useEmailThreadsForContact(contactId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['crm-email-threads-for-contact', contactId],
    enabled: !!contactId && enabled,
    queryFn: async (): Promise<ContactEmailThread[]> => {
      const { data, error } = await supabase
        .from('crm_email_threads' as any)
        .select(
          'id, contact_id, subject, last_message_at, last_message_snippet, last_message_from, message_count, unread_count',
        )
        .eq('contact_id', contactId as string)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as any[]) as ContactEmailThread[];
    },
    staleTime: 15_000,
  });
}
