import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface Conversation {
  id: string;
  user_id: string;
  lead_id: string | null;
  channel: 'whatsapp' | 'sms' | 'email' | 'facebook' | 'instagram' | 'tiktok';
  external_id: string | null;
  lead_name: string;
  lead_phone: string | null;
  lead_email: string | null;
  status: 'new' | 'contacted' | 'engaged' | 'qualified' | 'booked' | 'escalated' | 'unresponsive' | 'disqualified' | 'closed';
  assigned_to: 'zara' | 'uzair';
  heat: number;
  last_message_at: string | null;
  meta_window_expires_at: string | null;
  lofty_contact_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  last_message?: string;
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  sender: 'lead' | 'zara' | 'uzair';
  body: string;
  twilio_message_sid: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  media_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface LeadNote {
  id: string;
  conversation_id: string;
  body: string;
  created_by: string;
  created_at: string;
}

export interface ZaraActivity {
  id: string;
  conversation_id: string;
  action_type: string;
  description: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export function useConversations(filters?: { channel?: string; status?: string; search?: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('conversations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  return useQuery({
    queryKey: ['conversations', filters],
    queryFn: async () => {
      let query = supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (filters?.channel && filters.channel !== 'all') {
        query = query.eq('channel', filters.channel);
      }
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.search) {
        query = query.ilike('lead_name', `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Conversation[];
    },
    enabled: !!user,
  });
}

export function useMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        queryClient.setQueryData(['messages', conversationId], (old: Message[] = []) => {
          return [...old, payload.new as Message];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled: !!conversationId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, body, sender }: { conversationId: string; body: string; sender: 'uzair' | 'zara' }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          direction: 'outbound',
          sender,
          body,
          status: 'sent',
        })
        .select()
        .single();
      if (error) throw error;

      // Update last_message_at on conversation
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      return data;
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error) => {
      toast.error('Failed to send message: ' + error.message);
    },
  });
}

export function useLeadNotes(conversationId: string | null) {
  return useQuery({
    queryKey: ['lead_notes', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as LeadNote[];
    },
    enabled: !!conversationId,
  });
}

export function useAddLeadNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, body }: { conversationId: string; body: string }) => {
      const { data, error } = await supabase
        .from('lead_notes')
        .insert({ conversation_id: conversationId, body, created_by: 'uzair' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['lead_notes', conversationId] });
      toast.success('Note saved');
    },
  });
}

export function useZaraActivity(conversationId: string | null) {
  return useQuery({
    queryKey: ['zara_activity', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('zara_activity')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ZaraActivity[];
    },
    enabled: !!conversationId,
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Conversation> & { id: string }) => {
      const { error } = await supabase
        .from('conversations')
        .update(updates as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useAddConversation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (conv: Omit<Conversation, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('conversations')
        .insert({ ...conv, user_id: user.id } as Record<string, unknown>)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Lead added');
    },
    onError: (error) => {
      toast.error('Failed to add lead: ' + error.message);
    },
  });
}
