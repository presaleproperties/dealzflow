/**
 * Single-query lookup of contact_ids that have at least one draft for the
 * current user. Used by the inbox row to surface a "Draft" chip without
 * firing a query per row.
 *
 * Realtime invalidation is handled via the existing draft hooks (queries
 * sharing `crm-thread-draft*` keys). This hook keeps a 30s stale window
 * which is plenty for the inbox row chip.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useDraftContactIds() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['crm-thread-drafts-set', user?.id ?? 'anon'],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('crm_thread_drafts')
        .select('contact_id')
        .eq('user_id', user.id);
      if (error) return [];
      return (data ?? []).map((r: any) => r.contact_id).filter(Boolean);
    },
  });

  const set = useMemo(() => new Set(query.data ?? []), [query.data]);
  return { set, isLoading: query.isLoading };
}
