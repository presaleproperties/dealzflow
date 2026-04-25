import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CrmSource {
  id: string;
  name: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Fetches the canonical CRM source library (crm_sources table).
 * Auto-synced from crm_contacts.source via a Postgres trigger — always complete.
 */
export function useCrmSources() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['crm-sources'],
    queryFn: async (): Promise<CrmSource[]> => {
      const { data, error } = await supabase
        .from('crm_sources')
        .select('*')
        .order('usage_count', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmSource[];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('crm-sources-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_sources' },
        () => queryClient.invalidateQueries({ queryKey: ['crm-sources'] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}

/** Create a source in the library (the trigger also creates them when used on a contact). */
export function useCreateCrmSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Source name is required');
      const { data, error } = await supabase
        .from('crm_sources')
        .upsert(
          { name: trimmed, usage_count: 0 },
          { onConflict: 'name_lower', ignoreDuplicates: false },
        )
        .select()
        .single();
      if (error) throw error;
      return data as CrmSource;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-sources'] });
    },
  });
}
