import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BehaviorOverview = {
  window_days: number;
  total_events: number;
  active_sessions_30m: number;
  return_visits: number;
  signup_funnel: { started: number; in_progress: number; completed: number; abandoned: number };
  top_properties: Array<{ property_name: string; property_url: string | null; views: number; unique_leads: number }>;
};

export function useBehaviorOverview(days: number = 30) {
  return useQuery({
    queryKey: ["behavior-overview", days],
    queryFn: async (): Promise<BehaviorOverview> => {
      const { data, error } = await supabase.rpc("crm_behavior_overview" as any, { _days: days });
      if (error) throw error;
      return data as BehaviorOverview;
    },
    refetchInterval: 30_000, // gentle live polling for active-session counter
  });
}
