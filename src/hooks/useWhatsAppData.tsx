import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type WAConversation = {
  id: string;
  user_id: string;
  contact_id: string;
  phone_number: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  status: string;
  created_at: string;
  contact?: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    status: string | null;
  };
};

export type WAMessage = {
  id: string;
  conversation_id: string;
  user_id: string;
  direction: string;
  message_type: string;
  content: string | null;
  template_name: string | null;
  status: string;
  whatsapp_message_id: string | null;
  created_at: string;
};

export type WATemplate = {
  id: string;
  name: string;
  body_text: string;
  category: string;
  status: string;
  language: string;
};

export function useWAConversations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['wa-conversations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_whatsapp_conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw error;

      const contactIds = [...new Set((data ?? []).map(c => c.contact_id))];
      let contactMap: Record<string, WAConversation['contact']> = {};
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('crm_contacts')
          .select('id, first_name, last_name, phone, status')
          .in('id', contactIds);
        (contacts ?? []).forEach(c => { contactMap[c.id] = c; });
      }

      return (data ?? []).map(c => ({
        ...c,
        contact: contactMap[c.contact_id],
      })) as WAConversation[];
    },
    enabled: !!user,
    staleTime: 10_000,
  });
}

export function useWAMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['wa-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('crm_whatsapp_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as WAMessage[];
    },
    enabled: !!conversationId,
  });
}

export function useWATemplates() {
  return useQuery({
    queryKey: ['wa-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_whatsapp_templates')
        .select('*')
        .eq('status', 'approved')
        .order('name');
      if (error) throw error;
      return (data ?? []) as WATemplate[];
    },
    staleTime: 60_000,
  });
}

export function useSendWAMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, content, messageType = 'text', templateName }: {
      conversationId: string;
      content: string;
      messageType?: string;
      templateName?: string;
    }) => {
      const { error } = await supabase
        .from('crm_whatsapp_messages')
        .insert({
          conversation_id: conversationId,
          user_id: user!.id,
          direction: 'outbound',
          message_type: messageType,
          content,
          template_name: templateName ?? null,
          status: 'pending',
        });
      if (error) throw error;

      // Update conversation preview
      await supabase
        .from('crm_whatsapp_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: content.length > 60 ? content.slice(0, 60) + '…' : content,
        })
        .eq('id', conversationId);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wa-messages', vars.conversationId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: () => toast.error('Failed to send message'),
  });
}

export function useCreateWAConversation() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ contactId, phoneNumber }: { contactId: string; phoneNumber: string }) => {
      // Check if conversation already exists
      const { data: existing } = await supabase
        .from('crm_whatsapp_conversations')
        .select('id')
        .eq('contact_id', contactId)
        .eq('user_id', user!.id)
        .maybeSingle();

      if (existing) return existing.id;

      const { data, error } = await supabase
        .from('crm_whatsapp_conversations')
        .insert({
          user_id: user!.id,
          contact_id: contactId,
          phone_number: phoneNumber,
          status: 'active',
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: () => toast.error('Failed to create conversation'),
  });
}
