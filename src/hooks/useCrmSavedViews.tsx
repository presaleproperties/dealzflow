import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type SavedView = {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, unknown>;
  sort_order: number;
  is_default: boolean;
  created_at: string;
};

export function useCrmSavedViews() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['crm-saved-views', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('crm_saved_views')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as SavedView[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useCreateSavedView() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (view: { name: string; filters: Record<string, unknown>; is_default?: boolean }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('crm_saved_views')
        .insert({ user_id: user.id, name: view.name, filters: view.filters as any, is_default: view.is_default ?? false, sort_order: 99 })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm-saved-views'] }); toast.success('View saved'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_saved_views').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm-saved-views'] }); toast.success('View deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });
}
