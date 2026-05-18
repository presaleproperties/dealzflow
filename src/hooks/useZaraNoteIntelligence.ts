import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ZaraNoteIntel {
  id: string;
  note_id: string;
  contact_id: string;
  summary: string | null;
  emotional_state: string | null;
  trust_level: number | null;
  buying_readiness: number | null;
  investor_vs_enduser: string | null;
  commitment_level: string | null;
  objections: string[] | null;
  motivations: string[] | null;
  financial_concerns: string[] | null;
  family_context: string | null;
  timing_signals: string[] | null;
  preferred_areas: string[] | null;
  escalation_signals: string[] | null;
  key_quote: string | null;
  recommended_style: string | null;
  recommended_next_step: string | null;
  priority_delta: number | null;
  analyzed_at: string;
}

export function useZaraNoteIntelligence(contactId?: string) {
  return useQuery({
    queryKey: ['zara-note-intelligence', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('zara_note_intelligence')
        .select('*')
        .eq('contact_id', contactId)
        .order('analyzed_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ZaraNoteIntel[];
    },
    staleTime: 30_000,
  });
}
