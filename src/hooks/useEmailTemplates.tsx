import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string | null;
  preview_text: string | null;
  html_content: string;
  category: string;
  project_tags: string[];
  area_tags: string[];
  source: string;
  thumbnail_url: string | null;
  is_active: boolean;
  is_favorite: boolean;
  times_used: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
};

export function useEmailTemplates() {
  return useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates' as any)
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EmailTemplate[];
    },
    staleTime: 30_000,
  });
}

export function useEmailTemplateStats() {
  const { data: templates = [] } = useEmailTemplates();
  const total = templates.length;
  const bySource = templates.reduce((acc, t) => {
    acc[t.source] = (acc[t.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return { total, bySource };
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tpl: Partial<EmailTemplate> & { name: string; html_content: string }) => {
      const { error } = await supabase
        .from('email_templates' as any)
        .insert({ ...tpl, source: tpl.source || 'dealflow' } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<EmailTemplate> }) => {
      const { error } = await supabase
        .from('email_templates' as any)
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSoftDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_templates' as any)
        .update({ is_active: false } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template archived');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase
        .from('email_templates' as any)
        .update({ is_favorite } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
