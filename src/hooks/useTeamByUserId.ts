import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TeamMemberLite = {
  user_id: string;
  display_name: string;
  headshot_url: string | null;
  focal_y: number | null;
  role: string | null;
};

/**
 * Lookup map of every active CRM team member keyed by their `user_id`
 * (auth.uid). Used by activity timeline cards to render an attribution
 * badge ("who made this change / sent this email / wrote this note").
 *
 * Cached aggressively because team rosters change very rarely.
 */
export function useTeamByUserId() {
  return useQuery({
    queryKey: ['crm_team_by_user_id'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Record<string, TeamMemberLite>> => {
      const { data, error } = await supabase
        .from('crm_team')
        .select('user_id, display_name, headshot_url, headshot_focal_y, role, is_active')
        .eq('is_active', true);
      if (error) throw error;
      const map: Record<string, TeamMemberLite> = {};
      for (const r of (data ?? []) as any[]) {
        if (!r.user_id) continue;
        map[r.user_id] = {
          user_id: r.user_id,
          display_name: r.display_name || 'Agent',
          headshot_url: r.headshot_url ?? null,
          focal_y: r.headshot_focal_y ?? null,
          role: r.role ?? null,
        };
      }
      return map;
    },
  });
}

/** Initials from a display name — "Sarb Gill" → "SG", "Ravish" → "R". */
export function initialsFromName(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
