import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TemplateSyncEvent = {
  id: string;
  template_id: string | null;
  direction: 'pull' | 'push' | 'test';
  status: 'success' | 'error' | 'pending';
  bridge_endpoint: string | null;
  payload_summary: Record<string, any> | null;
  error: string | null;
  actor_id: string | null;
  created_at: string;
};

/**
 * Read recent sync events for a single template. Powers the "Sync history"
 * accordion inside the editor. RLS gates rows to the template owner / admins.
 */
export function useTemplateSyncLog(templateId: string | null | undefined, limit = 10) {
  return useQuery({
    queryKey: ['crm_template_sync_log', templateId, limit],
    enabled: !!templateId,
    staleTime: 30_000,
    queryFn: async (): Promise<TemplateSyncEvent[]> => {
      const { data, error } = await supabase
        .from('crm_template_sync_log')
        .select('id, template_id, direction, status, bridge_endpoint, payload_summary, error, actor_id, created_at')
        .eq('template_id', templateId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as TemplateSyncEvent[];
    },
  });
}
