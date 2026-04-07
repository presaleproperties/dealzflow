import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export type CrmConversation = {
  id: string;
  contact_id: string;
  channel: string;
  status: string | null;
  unread_count: number | null;
  last_message_at: string | null;
  assigned_agent: string | null;
  created_at: string | null;
  contact?: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    status: string | null;
  };
  last_message_preview?: string;
};

export type CrmMessage = {
  id: string;
  conversation_id: string;
  contact_id: string | null;
  direction: string;
  content: string | null;
  channel: string | null;
  message_type: string | null;
  sent_by: string | null;
  delivered: boolean | null;
  read: boolean | null;
  created_at: string | null;
};

export function useCrmConversations() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['crm-conversations'],
    queryFn: async () => {
      // Get conversations
      const { data: convs, error } = await supabase
        .from('crm_conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw error;

      // Get contact info for each
      const contactIds = [...new Set((convs ?? []).map(c => c.contact_id))];
      let contactMap: Record<string, { id: string; first_name: string; last_name: string; phone: string | null; status: string | null }> = {};
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('crm_contacts')
          .select('id, first_name, last_name, phone, status')
          .in('id', contactIds);
        (contacts ?? []).forEach(c => { contactMap[c.id] = c; });
      }

      // Get last message for each conversation
      const convIds = (convs ?? []).map(c => c.id);
      let lastMsgMap: Record<string, string> = {};
      if (convIds.length > 0) {
        // Get all messages for these convs, we'll pick last per conv client-side
        const { data: msgs } = await supabase
          .from('crm_messages')
          .select('conversation_id, content, created_at')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false })
          .limit(200);
        (msgs ?? []).forEach(m => {
          if (!lastMsgMap[m.conversation_id] && m.content) {
            lastMsgMap[m.conversation_id] = m.content.length > 60 ? m.content.slice(0, 60) + '…' : m.content;
          }
        });
      }

      return (convs ?? []).map(c => ({
        ...c,
        contact: contactMap[c.contact_id],
        last_message_preview: lastMsgMap[c.id],
      })) as CrmConversation[];
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('crm-conversations-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_conversations' }, () => {
        qc.invalidateQueries({ queryKey: ['crm-conversations'] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_messages' }, () => {
        qc.invalidateQueries({ queryKey: ['crm-conversations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

export function useCrmConversationMessages(conversationId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['crm-conv-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('crm_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmMessage[];
    },
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`crm-msgs-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'crm_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['crm-conv-messages', conversationId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, qc]);

  return query;
}
