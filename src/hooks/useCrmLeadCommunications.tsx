import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCrmContactForms(contactId: string | undefined, email?: string | null) {
  return useQuery({
    queryKey: ['crm-contact-forms', contactId, email ?? null],
    queryFn: async () => {
      if (!contactId && !email) return [];
      let q = supabase.from('crm_lead_behavior_forms').select('*').order('submitted_at', { ascending: false }).limit(100);
      if (contactId && email) q = q.or(`contact_id.eq.${contactId},email.eq.${email}`);
      else if (contactId) q = q.eq('contact_id', contactId);
      else if (email) q = q.eq('email', email);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!(contactId || email),
  });
}

export function useCrmContactEngagement(contactId: string | undefined, email?: string | null) {
  return useQuery({
    queryKey: ['crm-contact-engagement', contactId, email ?? null],
    queryFn: async () => {
      if (!contactId && !email) return [];
      let q = supabase.from('crm_lead_behavior_engagement').select('*').order('occurred_at', { ascending: false }).limit(100);
      if (contactId && email) q = q.or(`contact_id.eq.${contactId},email.eq.${email}`);
      else if (contactId) q = q.eq('contact_id', contactId);
      else if (email) q = q.eq('email', email);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!(contactId || email),
  });
}

export function useCrmContactActivityEvents(contactId: string | undefined) {
  return useQuery({
    queryKey: ['crm-contact-activity-events', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('crm_activity_events')
        .select('*')
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!contactId,
  });
}
