import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CrmCity {
  id: string;
  name: string;
  region: string | null;
  province: string | null;
  project_count: number;
  lead_count: number;
  is_active: boolean;
}

export interface CrmNeighborhood {
  id: string;
  name: string;
  city_id: string | null;
  city_name: string | null;
  project_count: number;
  lead_count: number;
  is_active: boolean;
}

export function useCrmCities() {
  return useQuery({
    queryKey: ['crm-cities'],
    queryFn: async (): Promise<CrmCity[]> => {
      const { data, error } = await supabase
        .from('crm_cities' as any)
        .select('*')
        .eq('is_active', true)
        .order('lead_count', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown) as CrmCity[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useCrmNeighborhoods(cityId?: string | null) {
  return useQuery({
    queryKey: ['crm-neighborhoods', cityId ?? 'all'],
    queryFn: async (): Promise<CrmNeighborhood[]> => {
      let q = supabase.from('crm_neighborhoods' as any).select('*').eq('is_active', true);
      if (cityId) q = q.eq('city_id', cityId);
      const { data, error } = await q.order('name', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown) as CrmNeighborhood[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpsertCrmCity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (city: Partial<CrmCity> & { name: string }) => {
      const { data, error } = await supabase
        .from('crm_cities' as any)
        .upsert(city as any, { onConflict: 'name_lower', ignoreDuplicates: false })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-cities'] }),
  });
}
