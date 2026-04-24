import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

/** Persist a new ordering of segments by updating sort_order on each row. */
export function useReorderCrmLeadSegments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Update sequentially in steps of 10 to keep ordering predictable
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('crm_lead_segments').update({ sort_order: (idx + 1) * 10 }).eq('id', id),
        ),
      );
    },
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: ['crm-lead-segments'] });
      const prev = qc.getQueryData<LeadSegment[]>(['crm-lead-segments']);
      if (prev) {
        const byId = new Map(prev.map(s => [s.id, s]));
        const next = orderedIds.map((id, idx) => ({ ...(byId.get(id) as LeadSegment), sort_order: (idx + 1) * 10 }));
        qc.setQueryData(['crm-lead-segments'], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['crm-lead-segments'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['crm-lead-segments'] });
    },
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

      // Run all segment counts in parallel instead of sequentially.
      // With ~7k contacts and 8+ segments, sequential awaits made this take 5-10s.
      const results = await Promise.all(
        segments.map(async (seg) => {
          let query = supabase.from('crm_contacts').select('id', { count: 'exact', head: true });
          query = applyFilters(query, baseFilters);
          query = applyFilters(query, seg.filter_config);
          const { count, error } = await query;
          return { id: seg.id, count: error ? 0 : (count ?? 0) };
        }),
      );

      for (const r of results) counts[r.id] = r.count;
      return counts;
    },
    enabled: segments.length > 0,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
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
