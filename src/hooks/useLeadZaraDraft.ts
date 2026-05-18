import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ZaraLeadDraft = {
  id: string;
  contact_id: string;
  channel: 'email' | 'sms' | 'whatsapp';
  inbound_text: string;
  inbound_at: string;
  draft_text: string;
  draft_subject: string | null;
  intent: string | null;
  confidence: number | null;
  guardrails_hit: string[];
  status: 'pending' | 'approved' | 'sent' | 'rejected' | 'snoozed';
  created_at: string;
  expires_at: string;
  consulted_sources: any;
  citations: any;
};

/**
 * Latest *pending* Zara draft for a contact. Realtime-subscribed so the chip
 * appears the moment zara-suggest-reply writes a draft.
 */
export function useLeadZaraDraft(contactId: string | undefined) {
  const qc = useQueryClient();
  const key = ['zara-lead-draft', contactId];

  const query = useQuery({
    queryKey: key,
    enabled: !!contactId,
    queryFn: async (): Promise<ZaraLeadDraft | null> => {
      const { data } = await supabase
        .from('zara_suggested_replies')
        .select(
          'id, contact_id, channel, inbound_text, inbound_at, draft_text, draft_subject, intent, confidence, guardrails_hit, status, created_at, expires_at, consulted_sources, citations',
        )
        .eq('contact_id', contactId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as ZaraLeadDraft) ?? null;
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!contactId) return;
    const ch = supabase
      .channel(`zara-draft-${contactId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'zara_suggested_replies', filter: `contact_id=eq.${contactId}` },
        () => qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  return query;
}
