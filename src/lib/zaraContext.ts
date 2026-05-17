/**
 * Zara handoff context — bundles a contact, their last-touch summary, and
 * the most recent engagement events so the Zara surfaces (and the
 * `get-zara-context` edge function) have everything they need in one shot.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ZaraContext {
  contact: Record<string, unknown> | null;
  lastTouch: {
    last_outbound_at: string | null;
    last_inbound_at: string | null;
    last_event_at: string | null;
    engagement_signal_count: number;
  } | null;
  recentEvents: Array<Record<string, unknown>>;
}

export async function getZaraContext(contactId: string): Promise<ZaraContext> {
  const [contactRes, lastTouchRes, eventsRes] = await Promise.all([
    supabase.from('crm_contacts').select('*').eq('id', contactId).maybeSingle(),
    supabase
      .from('crm_contact_last_touch')
      .select('*')
      .eq('contact_id', contactId)
      .maybeSingle(),
    supabase
      .from('crm_engagement_events')
      .select('*')
      .eq('contact_id', contactId)
      .order('occurred_at', { ascending: false })
      .limit(20),
  ]);

  return {
    contact: (contactRes.data as Record<string, unknown> | null) ?? null,
    lastTouch: (lastTouchRes.data as ZaraContext['lastTouch']) ?? null,
    recentEvents: (eventsRes.data as Array<Record<string, unknown>>) ?? [],
  };
}
