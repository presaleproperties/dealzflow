import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { CrmContact } from './useCrmContacts';
import { normalizeCrmContactArrays, normalizeCrmMultiValueList } from '@/lib/crmMultiValue';

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
      return normalizeCrmContactArrays(data) as CrmContact;
    },
    enabled: !!id,
    /**
     * Instant-render placeholder: when the user taps a lead from the list
     * (or returns to one they've already viewed), reuse the row already in
     * the React Query cache so the page paints immediately while the full
     * record is fetched in the background.
     */
    placeholderData: () => {
      if (!id) return undefined;
      const lists: Array<readonly unknown[]> = [
        ['crm-contacts'],
        ['crm-contacts-lite'],
        ['crm-contacts-paginated'],
      ];
      for (const key of lists) {
        const cached = queryClient.getQueriesData<{ contacts?: CrmContact[] } | CrmContact[]>({ queryKey: key });
        for (const [, value] of cached) {
          if (!value) continue;
          const rows = Array.isArray(value) ? value : (value as { contacts?: CrmContact[] }).contacts;
          const hit = rows?.find((r) => r?.id === id);
          if (hit) return normalizeCrmContactArrays(hit) as CrmContact;
        }
      }
      return undefined;
    },
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
    mutationFn: async ({ id, updates, oldValues }: { id: string; updates: Record<string, unknown>; oldValues?: Record<string, unknown> }) => {
      const finalUpdates = { ...updates };
      if ('tags' in finalUpdates) finalUpdates.tags = normalizeCrmMultiValueList(finalUpdates.tags);
      if ('projects' in finalUpdates) finalUpdates.projects = normalizeCrmMultiValueList(finalUpdates.projects);

      if (finalUpdates.contact_type === 'past_client') {
        finalUpdates.status = 'Closed';
        if (!finalUpdates.status_changed_at) {
          finalUpdates.status_changed_at = new Date().toISOString();
        }
      }
      const { error } = await supabase.from('crm_contacts').update(finalUpdates).eq('id', id);
      if (error) throw error;

      // Log system notes for key changes
      const { data: { session } } = await supabase.auth.getSession();
      if (session && oldValues) {
        const systemNotes: string[] = [];

        if (updates.status && oldValues.status && updates.status !== oldValues.status) {
          systemNotes.push(`Stage changed from "${oldValues.status}" to "${updates.status}"`);
        }
        if (updates.assigned_to && oldValues.assigned_to && updates.assigned_to !== oldValues.assigned_to) {
          systemNotes.push(`Lead reassigned from "${oldValues.assigned_to}" to "${updates.assigned_to}"`);
        }

        for (const content of systemNotes) {
          await (supabase.from('crm_notes' as any) as any).insert({
            contact_id: id,
            user_id: session.user.id,
            content,
            note_type: 'system',
          });
        }
      }
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['crm-contact', id] });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['crm-notes', id] });
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
      // Lead score on the list is denormalized — refresh after each new task
      // so the score badge keeps up.
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['crm-contact', vars.contact_id] });
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
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['crm-contacts-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['crm-contact', vars.contact_id] });
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
