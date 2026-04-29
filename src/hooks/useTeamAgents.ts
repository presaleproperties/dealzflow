import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TeamAgent = {
  id: string;
  name: string;
  headshot_url: string | null;
  focal_y: number | null;
  role: string | null;
};

/**
 * Live list of active CRM team members for assignee dropdowns / pickers.
 * Replaces the legacy hardcoded AGENTS constant so newly invited members
 * (e.g. Zara) appear automatically. Sorted alphabetically.
 */
export function useTeamAgents() {
  return useQuery({
    queryKey: ['crm_team_agents'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TeamAgent[]> => {
      const { data, error } = await supabase
        .from('crm_team')
        .select('id, display_name, headshot_url, headshot_focal_y, role, is_active')
        .eq('is_active', true)
        .order('display_name', { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .filter((r: any) => r.display_name)
        .map((r: any) => ({
          id: r.id,
          name: r.display_name as string,
          headshot_url: (r.headshot_url as string | null) ?? null,
          focal_y: (r.headshot_focal_y as number | null) ?? null,
          role: (r.role as string | null) ?? null,
        }));
    },
  });
}

/** Convenience: just the names, used wherever the legacy AGENTS string list was consumed. */
export function useAgentNames(): string[] {
  const { data } = useTeamAgents();
  return (data ?? []).map((a) => a.name);
}
