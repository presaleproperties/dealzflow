import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeCrmContactArrays } from '@/lib/crmMultiValue';
import type { CrmContact } from '@/hooks/useCrmContacts';

/**
 * Pre-warm cache helpers used by list rows on tap / hover / focus.
 *
 * These mirror the queries fired by `LeadDetailPage` and `CrmChatThreadPage`
 * so that by the time the user lands on the page, React Query already has
 * the data — combined with the IndexedDB persister this means returning to
 * a recently-viewed lead/thread feels instant on cold open too.
 */
export function usePrefetchLead() {
  const qc = useQueryClient();
  return useCallback(
    (id: string | undefined) => {
      if (!id) return;
      void qc.prefetchQuery({
        queryKey: ['crm-contact', id],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('crm_contacts')
            .select('*')
            .eq('id', id)
            .single();
          if (error) throw error;
          return normalizeCrmContactArrays(data) as CrmContact;
        },
        staleTime: 30_000,
      });
      // Activity timeline uses crm_messages joined against this contact.
      void qc.prefetchQuery({
        queryKey: ['crm-contact-messages', id],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('crm_messages')
            .select('*')
            .eq('contact_id', id)
            .order('created_at', { ascending: false })
            .limit(50);
          if (error) throw error;
          return data ?? [];
        },
        staleTime: 30_000,
      });
    },
    [qc],
  );
}

export function usePrefetchChatThread() {
  const qc = useQueryClient();
  return useCallback(
    (conversationId: string | undefined) => {
      if (!conversationId) return;
      void qc.prefetchQuery({
        queryKey: ['crm-chat-thread', conversationId],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('crm_conversations')
            .select(
              `id, contact_id, channel, status, unread_count, last_message_at,
               crm_contacts!inner ( * )`,
            )
            .eq('id', conversationId)
            .maybeSingle();
          if (error) throw error;
          return data;
        },
        staleTime: 30_000,
      });
      void qc.prefetchQuery({
        queryKey: ['crm-chat-thread-messages', conversationId],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('crm_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .limit(500);
          if (error) throw error;
          return data ?? [];
        },
        staleTime: 30_000,
      });
    },
    [qc],
  );
}
