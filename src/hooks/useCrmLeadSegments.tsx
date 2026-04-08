import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type LeadSegment = {
  id: string;
  name: string;
  emoji: string | null;
  filter_config: Record<string, unknown>;
  color: string;
  sort_order: number;
  is_default: boolean;
};

export function useCrmLeadSegments() {
  return useQuery({
    queryKey: ['crm-lead-segments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_lead_segments')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as LeadSegment[];
    },
    staleTime: 60_000,
  });
}

/** Get live counts for each segment, optionally scoped to a base filter (saved view). */
export function useSegmentCounts(
  segments: LeadSegment[],
  baseFilters: Record<string, unknown>,
) {
  return useQuery({
    queryKey: ['crm-segment-counts', segments.map(s => s.id), baseFilters],
    queryFn: async () => {
      const counts: Record<string, number> = {};

      for (const seg of segments) {
        let query = supabase.from('crm_contacts').select('id', { count: 'exact', head: true });

        // Apply base filters from saved view
        query = applyFilters(query, baseFilters);
        // Apply segment filters on top
        query = applyFilters(query, seg.filter_config);

        const { count, error } = await query;
        if (!error) counts[seg.id] = count ?? 0;
      }

      return counts;
    },
    enabled: segments.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

function applyFilters(query: any, filters: Record<string, unknown>) {
  if (!filters || Object.keys(filters).length === 0) return query;

  if (filters.status && Array.isArray(filters.status) && (filters.status as string[]).length > 0) {
    query = query.in('status', filters.status as string[]);
  }
  if (filters.source && Array.isArray(filters.source) && (filters.source as string[]).length > 0) {
    query = query.in('source', filters.source as string[]);
  }
  if (filters.lead_type && Array.isArray(filters.lead_type) && (filters.lead_type as string[]).length > 0) {
    query = query.in('lead_type', filters.lead_type as string[]);
  }
  if (filters.assigned_to && typeof filters.assigned_to === 'string') {
    query = query.eq('assigned_to', filters.assigned_to);
  }
  if (filters.tags && Array.isArray(filters.tags) && (filters.tags as string[]).length > 0) {
    query = query.overlaps('tags', filters.tags as string[]);
  }
  if (filters.contact_type && typeof filters.contact_type === 'string') {
    query = query.eq('contact_type', filters.contact_type);
  }

  return query;
}
