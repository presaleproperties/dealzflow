import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { CrmContact } from './useCrmContacts';

export function useCrmContact(id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['crm-contact', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('crm_contacts')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as CrmContact;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`crm-contact-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_contacts', filter: `id=eq.${id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['crm-contact', id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, queryClient]);

  return query;
}

export function useCrmContactMessages(contactId: string | undefined) {
  return useQuery({
    queryKey: ['crm-contact-messages', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('crm_messages')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!contactId,
  });
}

export function useCrmContactShowings(contactId: string | undefined) {
  return useQuery({
    queryKey: ['crm-contact-showings', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('crm_showings')
        .select('*')
        .eq('contact_id', contactId)
        .order('showing_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!contactId,
  });
}

export function useCrmContactTasks(contactId: string | undefined) {
  return useQuery({
    queryKey: ['crm-contact-tasks', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('crm_tasks')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!contactId,
  });
}

export function useUpdateCrmContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase.from('crm_contacts').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['crm-contact', id] });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAddCrmTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (task: { contact_id: string; title: string; description?: string; due_date?: string; priority?: string; task_type?: string; assigned_to?: string }) => {
      const { error } = await supabase.from('crm_tasks').insert(task);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['crm-contact-tasks', vars.contact_id] });
      toast.success('Task created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAddCrmShowing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (showing: { contact_id: string; project: string; unit?: string; showing_date: string; showing_time: string; assigned_agent?: string; notes?: string }) => {
      const { error } = await supabase.from('crm_showings').insert(showing);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['crm-contact-showings', vars.contact_id] });
      toast.success('Showing booked');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAddCrmMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (msg: { contact_id: string; conversation_id?: string; direction: string; content: string; channel: string; sent_by?: string; message_type?: string }) => {
      // If no conversation, create one
      let convId = msg.conversation_id;
      if (!convId) {
        const { data: conv, error: convErr } = await supabase
          .from('crm_conversations')
          .insert({ contact_id: msg.contact_id, channel: msg.channel, status: 'open' })
          .select('id')
          .single();
        if (convErr) throw convErr;
        convId = conv.id;
      }
      const { error } = await supabase.from('crm_messages').insert({
        conversation_id: convId!,
        contact_id: msg.contact_id,
        direction: msg.direction,
        content: msg.content,
        channel: msg.channel,
        sent_by: msg.sent_by,
        message_type: msg.message_type || 'text',
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['crm-contact-messages', vars.contact_id] });
      toast.success('Message saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
