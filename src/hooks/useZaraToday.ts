import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ZaraTodayKind = 'draft' | 'handoff' | 'nudge';

export interface ZaraTodayItem {
  kind: ZaraTodayKind;
  item_id: string;
  contact_id: string | null;
  title: string;
  body: string | null;
  priority: number;
  created_at: string;
  payload: Record<string, any>;
}

export function useZaraToday() {
  return useQuery({
    queryKey: ['zara-today'],
    queryFn: async (): Promise<ZaraTodayItem[]> => {
      const { data, error } = await supabase.rpc('zara_today_feed' as any);
      if (error) throw error;
      return (data ?? []) as ZaraTodayItem[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useResolveNudge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; action: 'done' | 'snooze' | 'dismiss'; hours?: number }) => {
      const { error } = await supabase.rpc('zara_resolve_nudge' as any, {
        p_nudge_id: args.id,
        p_action: args.action,
        p_hours: args.hours ?? 4,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zara-today'] }),
  });
}

export function useMarkHandoffRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('zara_mark_handoff_read' as any, { p_brief_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zara-today'] }),
  });
}

export interface ZaraOutcomeRow {
  agent_user_id: string | null;
  week: string;
  sent: number;
  replied: number;
  booked: number;
  edited: number;
  avg_edit_distance: number | null;
}

export function useZaraOutcomes(weeks = 8) {
  return useQuery({
    queryKey: ['zara-outcomes', weeks],
    queryFn: async (): Promise<ZaraOutcomeRow[]> => {
      const since = new Date(Date.now() - weeks * 7 * 86400000).toISOString();
      const { data, error } = await supabase
        .from('zara_draft_outcomes_v1' as any)
        .select('*')
        .gte('week', since)
        .order('week', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ZaraOutcomeRow[];
    },
    staleTime: 5 * 60_000,
  });
}
