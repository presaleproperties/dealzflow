import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CrmEmailCampaign = {
  id: string;
  subject: string;
  body_html: string | null;
  status: string | null;
  recipients_count: number | null;
  sent_at: string | null;
  opens: number | null;
  clicks: number | null;
  segment_filter: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string | null;
};

export type CrmEmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body_html: string | null;
  project: string | null;
  times_used: number | null;
  last_used_at: string | null;
  created_at: string | null;
};

export function useCrmCampaigns() {
  return useQuery({
    queryKey: ['crm-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_email_campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmEmailCampaign[];
    },
    staleTime: 30_000,
  });
}

export function useCrmEmailTemplates() {
  return useQuery({
    queryKey: ['crm-email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_email_templates')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as CrmEmailTemplate[];
    },
    staleTime: 60_000,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaign: {
      subject: string;
      body_html: string;
      status: string;
      recipients_count: number;
      segment_filter: Record<string, string | number | boolean | null>;
      sent_at?: string;
    }) => {
      const { data, error } = await supabase
        .from('crm_email_campaigns')
        .insert([campaign])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-campaigns'] });
      toast.success('Campaign created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tpl: { name: string; subject: string; body_html: string; project?: string }) => {
      const { error } = await supabase.from('crm_email_templates').insert(tpl);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-email-templates'] });
      toast.success('Template saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
