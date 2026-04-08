import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useGmailStatus() {
  return useQuery({
    queryKey: ['gmail-status'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { connected: false, gmailEmail: null };

      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'status' },
      });
      if (error) throw error;
      return data as { connected: boolean; gmailEmail: string | null };
    },
    staleTime: 30_000,
  });
}

export function useConnectGmail() {
  return useMutation({
    mutationFn: async (redirectUrl: string) => {
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'get_auth_url', redirectUrl },
      });
      if (error) throw error;
      return data as { authUrl: string };
    },
    onSuccess: (data) => {
      window.location.href = data.authUrl;
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDisconnectGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'disconnect' },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gmail-status'] });
      toast.success('Gmail disconnected');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSendGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      to: string;
      subject: string;
      bodyText: string;
      bodyHtml?: string;
      contactId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('gmail-send', {
        body: payload,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; messageId: string };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['crm-contact-messages', vars.contactId] });
      qc.invalidateQueries({ queryKey: ['crm-email-log', vars.contactId] });
      toast.success('Email sent via Gmail');
    },
    onError: (err: Error) => toast.error(`Failed to send: ${err.message}`),
  });
}

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
