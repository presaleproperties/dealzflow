import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CrmLeadType {
  id: string;
  name: string;
  label: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Fetches the unified CRM lead-type library (crm_lead_types table).
 * Auto-synced from crm_contacts.lead_types[] via a Postgres trigger,
 * so this is always the canonical complete set across the entire CRM.
 */
export function useCrmLeadTypes() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['crm-lead-types'],
    queryFn: async (): Promise<CrmLeadType[]> => {
      const { data, error } = await supabase
        .from('crm_lead_types' as any)
        .select('*')
        .order('usage_count', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown) as CrmLeadType[];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('crm-lead-types-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_lead_types' },
        () => queryClient.invalidateQueries({ queryKey: ['crm-lead-types'] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}

export function useCreateCrmLeadType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Lead type name is required');
      const { data, error } = await supabase
        .from('crm_lead_types' as any)
        .upsert(
          { name: trimmed, usage_count: 0 },
          { onConflict: 'name_lower', ignoreDuplicates: false },
        )
        .select()
        .single();
      if (error) throw error;
      return (data as unknown) as CrmLeadType;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-lead-types'] });
    },
  });
}
