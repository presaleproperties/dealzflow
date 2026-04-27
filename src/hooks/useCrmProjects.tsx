import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CrmProject {
  id: string;
  name: string;
  usage_count: number;
  color: string | null;
  city: string | null;
  neighborhood: string | null;
  province: string | null;
  developer: string | null;
  property_type: string | null;
  bedrooms_offered: number[] | null;
  price_from: number | null;
  price_to: number | null;
  status: string | null;
  completion_date: string | null;
  website_url: string | null;
  marketing_url: string | null;
  aliases: string[] | null;
  notes: string | null;
  is_active: boolean;
  view_count: number;
  lead_count: number;
  last_viewed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Unified CRM project library — auto-synced from contacts AND from
 * presale-properties behavior views. Includes rich metadata
 * (city, developer, status, price range, etc.) for booking + analytics.
 */
export function useCrmProjects() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['crm-projects'],
    queryFn: async (): Promise<CrmProject[]> => {
      const { data, error } = await supabase
        .from('crm_projects' as any)
        .select('*')
        .eq('is_active', true)
        .order('view_count', { ascending: false })
        .order('usage_count', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown) as CrmProject[];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('crm-projects-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_projects' },
        () => queryClient.invalidateQueries({ queryKey: ['crm-projects'] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}

export function useCreateCrmProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Project name is required');
      const { data, error } = await supabase
        .from('crm_projects' as any)
        .upsert(
          { name: trimmed, usage_count: 0 },
          { onConflict: 'name_lower', ignoreDuplicates: false },
        )
        .select()
        .single();
      if (error) throw error;
      return (data as unknown) as CrmProject;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-projects'] });
    },
  });
}

export function useUpdateCrmProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CrmProject> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_projects' as any)
        .update(patch as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return (data as unknown) as CrmProject;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-projects'] });
    },
  });
}
