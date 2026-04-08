import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type EmailSettings = {
  id: string;
  user_id: string;
  sender_name: string | null;
  reply_to: string | null;
  signature_html: string | null;
  created_at: string;
  updated_at: string;
};

export function useEmailSettings() {
  return useQuery({
    queryKey: ['crm-email-settings'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data, error } = await (supabase.from('crm_email_settings' as any) as any)
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as EmailSettings | null);
    },
    staleTime: 60_000,
  });
}

export function useUpsertEmailSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: { sender_name?: string; reply_to?: string; signature_html?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { error } = await (supabase.from('crm_email_settings' as any) as any)
        .upsert({
          user_id: session.user.id,
          ...settings,
        }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-email-settings'] });
      toast.success('Email settings saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
