import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useMailerLiteStatus() {
  return useQuery({
    queryKey: ['mailerlite-status'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { connected: false, subscriberCount: 0 };

      const { data, error } = await supabase.functions.invoke('mailerlite-api', {
        body: { action: 'status' },
      });
      if (error) return { connected: false, subscriberCount: 0 };
      return data as { connected: boolean; subscriberCount: number };
    },
    staleTime: 30_000,
  });
}

export function useVerifyMailerLiteKey() {
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const { data, error } = await supabase.functions.invoke('mailerlite-api', {
        body: { action: 'verify_key', apiKey },
      });
      if (error) throw error;
      return data as { valid: boolean; subscriberCount?: number; error?: string };
    },
  });
}

export function useSaveMailerLiteKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const { error } = await supabase.functions.invoke('manage-connection', {
        body: { action: 'upsert', platform: 'mailerlite', api_key: apiKey },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailerlite-status'] });
      toast.success('MailerLite connected');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useMailerLiteGroups() {
  return useQuery({
    queryKey: ['mailerlite-groups'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mailerlite-api', {
        body: { action: 'groups' },
      });
      if (error) throw error;
      return (data?.groups || []) as Array<{ id: string; name: string; active_count: number }>;
    },
    staleTime: 60_000,
  });
}

export function useSyncToMailerLite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('mailerlite-api', {
        body: { action: 'sync_contacts' },
      });
      if (error) throw error;
      return data as { synced: number; total: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['mailerlite-status'] });
      qc.invalidateQueries({ queryKey: ['mailerlite-groups'] });
      toast.success(`Synced ${data.synced} of ${data.total} contacts to MailerLite`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useMailerLiteCampaigns() {
  return useQuery({
    queryKey: ['mailerlite-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('mailerlite-api', {
        body: { action: 'campaigns', limit: 50 },
      });
      if (error) throw error;
      return (data?.campaigns || []) as Array<{
        id: string;
        name: string;
        status: string;
        type: string;
        emails: Array<{ subject: string }>;
        stats: {
          sent: number;
          opens_count: number;
          clicks_count: number;
          open_rate: { float: number };
          click_rate: { float: number };
        };
        finished_at: string | null;
        scheduled_for: string | null;
        created_at: string;
      }>;
    },
    staleTime: 30_000,
  });
}

export function useCreateMailerLiteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      subject: string;
      content: string;
      groupIds: string[];
      recipientCount: number;
      fromName?: string;
      fromEmail?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('mailerlite-api', {
        body: { action: 'create_campaign', ...payload },
      });
      if (error) throw error;
      return data as { campaignId: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailerlite-campaigns'] });
      qc.invalidateQueries({ queryKey: ['crm-campaigns'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSendMailerLiteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, schedule }: { campaignId: string; schedule?: string }) => {
      const action = schedule ? 'schedule_campaign' : 'send_campaign';
      const { data, error } = await supabase.functions.invoke('mailerlite-api', {
        body: { action, campaignId, date: schedule },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailerlite-campaigns'] });
      qc.invalidateQueries({ queryKey: ['crm-campaigns'] });
      toast.success('Campaign sent successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
