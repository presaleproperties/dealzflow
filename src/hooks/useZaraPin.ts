import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'zara:pinned-lead-id';

/** Per-agent pinned lead — survives reloads via localStorage. */
export function useZaraPin() {
  const [pinnedId, setPinnedIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY);
  });

  const setPinnedId = useCallback((id: string | null) => {
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
    setPinnedIdState(id);
    window.dispatchEvent(new CustomEvent('zara:pin-changed', { detail: { id } }));
  }, []);

  useEffect(() => {
    const handler = (e: any) => setPinnedIdState(e.detail?.id ?? null);
    window.addEventListener('zara:pin-changed', handler);
    return () => window.removeEventListener('zara:pin-changed', handler);
  }, []);

  const { data: lead } = useQuery({
    queryKey: ['zara-pinned-lead', pinnedId],
    enabled: !!pinnedId,
    queryFn: async () => {
      if (!pinnedId) return null;
      const { data } = await supabase
        .from('crm_contacts')
        .select('id, first_name, last_name, email, phone, status, lead_type, assigned_to, tags, project, engagement_score')
        .eq('id', pinnedId)
        .maybeSingle();
      return data;
    },
    staleTime: 30_000,
  });

  return { pinnedId, pinnedLead: lead ?? null, setPinnedId, clear: () => setPinnedId(null) };
}
