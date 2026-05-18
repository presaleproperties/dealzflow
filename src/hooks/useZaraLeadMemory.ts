import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ZaraAppointmentRef {
  kind?: string | null;        // booked | showed | missed | completed
  when?: string | null;        // YYYY-MM-DD
  project?: string | null;
}

export interface ZaraLeadFacts {
  budget_min?: number | null;
  budget_max?: number | null;
  timeline?: string | null;
  decision_makers?: string[] | null;
  motivations?: string[] | null;
  objections?: string[] | null;
  must_haves?: string[] | null;
  dealbreakers?: string[] | null;
  financing_status?: string | null;
  preferred_neighborhoods?: string[] | null;
  preferred_language?: string | null;
  preferred_channel?: string | null;
  family_situation?: string | null;
  urgency_signal?: string | null;
  last_objection?: string | null;
  next_steps?: string[] | null;
  project_interest?: string | null;
  current_neighborhood?: string | null;
  key_quotes?: string[] | null;
  // ── Relationship Memory Continuity (Phase 7)
  investor_vs_enduser?: 'investor' | 'end_user' | 'mixed' | null;
  preferred_cities?: string[] | null;
  preferred_property_type?: string | null;
  school_preferences?: string | null;
  commute_concerns?: string | null;
  timing_concerns?: string | null;
  emotional_objections?: string[] | null;
  emotional_hesitation?: string | null;
  projects_compared?: string[] | null;
  viewed_projects?: string[] | null;
  downloaded_floorplans?: string[] | null;
  appointment_history?: ZaraAppointmentRef[] | null;
}

export interface ZaraLeadMemory {
  contact_id: string;
  summary: string;
  facts: ZaraLeadFacts;
  refreshed_at: string;
  turn_count: number;
  version: number;
  continuity_openers?: string[] | null;
  relationship_stage?: string | null;
  last_topics?: string[] | null;
  continuity_refreshed_at?: string | null;
  // Lead Intelligence rollup (from agent notes)
  intelligence_summary?: string | null;
  recommended_style?: string | null;
  recommended_next_step?: string | null;
  intelligence_priority?: number | null;
  intelligence_refreshed_at?: string | null;
}

export function useZaraLeadMemory(contactId: string | undefined) {
  const query = useQuery<ZaraLeadMemory | null>({
    queryKey: ['zara-lead-memory', contactId],
    enabled: !!contactId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zara_lead_memory')
        .select('contact_id, summary, facts, refreshed_at, turn_count, version, continuity_openers, relationship_stage, last_topics, continuity_refreshed_at, intelligence_summary, recommended_style, recommended_next_step, intelligence_priority, intelligence_refreshed_at')
        .eq('contact_id', contactId!)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return (data as ZaraLeadMemory) ?? null;
    },
  });

  // Live updates when zara-roll-memory bumps the row
  useEffect(() => {
    if (!contactId) return;
    const ch = supabase
      .channel(`zara-memory-${contactId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'zara_lead_memory', filter: `contact_id=eq.${contactId}` },
        () => query.refetch(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [contactId]); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export function isMemoryStale(refreshedAt: string | undefined, days = 60): boolean {
  if (!refreshedAt) return false;
  const ageMs = Date.now() - new Date(refreshedAt).getTime();
  return ageMs > days * 86_400_000;
}
