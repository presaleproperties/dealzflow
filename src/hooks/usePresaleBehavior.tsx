import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePresaleBehavior(contactId?: string) {
  return useQuery({
    queryKey: ["presale-behavior", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      if (!contactId) return { views: [], engagement: [], forms: [], sessions: [] };
      const [v, e, f, s] = await Promise.all([
        supabase.from("crm_lead_behavior_views").select("*").eq("contact_id", contactId).order("viewed_at", { ascending: false }).limit(20),
        supabase.from("crm_lead_behavior_engagement").select("*").eq("contact_id", contactId).order("occurred_at", { ascending: false }).limit(20),
        supabase.from("crm_lead_behavior_forms").select("*").eq("contact_id", contactId).order("submitted_at", { ascending: false }).limit(20),
        supabase.from("crm_lead_behavior_sessions").select("*").eq("contact_id", contactId).order("started_at", { ascending: false }).limit(10),
      ]);
      return {
        views: v.data || [],
        engagement: e.data || [],
        forms: f.data || [],
        sessions: s.data || [],
      };
    },
  });
}
