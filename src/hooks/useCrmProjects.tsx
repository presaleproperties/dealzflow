import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CrmProject {
  id: string;
  name: string;
  usage_count: number;
  color: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetches the unified CRM project library (crm_projects table).
 * Auto-synced from crm_contacts.projects[] via a Postgres trigger,
 * so this is always the canonical complete set across the entire CRM.
 */
export function useCrmProjects() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['crm-projects'],
    queryFn: async (): Promise<CrmProject[]> => {
      const { data, error } = await supabase
        .from('crm_projects' as any)
        .select('*')
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
