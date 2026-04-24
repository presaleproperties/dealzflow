import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CrmTag {
  id: string;
  name: string;
  usage_count: number;
  color: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetches the canonical CRM tag library (crm_tags table).
 * The table is auto-synced from crm_contacts.tags via a Postgres trigger,
 * so this is always the complete set.
 */
export function useCrmTags() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['crm-tags'],
    queryFn: async (): Promise<CrmTag[]> => {
      const { data, error } = await supabase
        .from('crm_tags')
        .select('*')
        .order('usage_count', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmTag[];
    },
    staleTime: 60_000,
  });

  // Realtime sync — refresh when the library changes
  useEffect(() => {
    const channel = supabase
      .channel('crm-tags-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_tags' },
        () => queryClient.invalidateQueries({ queryKey: ['crm-tags'] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}

/** Create a tag in the library (the trigger also creates them when used on a contact). */
export function useCreateCrmTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Tag name is required');
      const { data, error } = await supabase
        .from('crm_tags')
        .upsert(
          { name: trimmed, usage_count: 0 },
          { onConflict: 'name_lower', ignoreDuplicates: false },
        )
        .select()
        .single();
      if (error) throw error;
      return data as CrmTag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-tags'] });
    },
  });
}
