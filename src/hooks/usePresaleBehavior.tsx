import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export function usePresaleBehavior(contactId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["presale-behavior", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      if (!contactId) return { views: [], engagement: [], forms: [], sessions: [] };
      const [v, e, f, s] = await Promise.all([
        supabase.from("crm_lead_behavior_views").select("*").eq("contact_id", contactId).order("viewed_at", { ascending: false }).limit(50),
        supabase.from("crm_lead_behavior_engagement").select("*").eq("contact_id", contactId).order("occurred_at", { ascending: false }).limit(50),
        supabase.from("crm_lead_behavior_forms").select("*").eq("contact_id", contactId).order("submitted_at", { ascending: false }).limit(50),
        supabase.from("crm_lead_behavior_sessions").select("*").eq("contact_id", contactId).order("started_at", { ascending: false }).limit(20),
      ]);
      return {
        views: v.data || [],
        engagement: e.data || [],
        forms: f.data || [],
        sessions: s.data || [],
      };
    },
  });

  // Live updates — subscribe to all 4 behavior tables for this contact
  useEffect(() => {
    if (!contactId) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["presale-behavior", contactId] });
    };
    const channel = supabase
      .channel(`presale-behavior-${contactId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_lead_behavior_views", filter: `contact_id=eq.${contactId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_lead_behavior_sessions", filter: `contact_id=eq.${contactId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_lead_behavior_forms", filter: `contact_id=eq.${contactId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_lead_behavior_engagement", filter: `contact_id=eq.${contactId}` }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [contactId, queryClient]);

  return query;
}
