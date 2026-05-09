import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LEAD_SOURCES as LEGACY_SOURCES } from '@/hooks/useCrmContacts';

export interface CanonicalLeadSource {
  slug: string;
  display_name: string;
  source_type: string;
  is_active: boolean;
}

/**
 * Fetches the canonical, admin-managed list of lead sources from
 * `crm_lead_sources`. Falls back to the legacy hardcoded list if the
 * query fails (offline, RLS hiccup, etc.) so the Add-lead dialog never
 * gets stuck on an empty source picker.
 *
 * Use this for ALL new lead-source pickers. Free-text source entry is
 * forbidden — every lead must map to a known source slug/display name.
 */
export function useCanonicalLeadSources() {
  return useQuery({
    queryKey: ['crm-lead-sources', 'canonical'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CanonicalLeadSource[]> => {
      const { data, error } = await supabase
        .from('crm_lead_sources')
        .select('slug, display_name, source_type, is_active')
        .eq('is_active', true)
        .order('display_name', { ascending: true });
      if (error || !data || data.length === 0) {
        return LEGACY_SOURCES.map((s) => ({
          slug: s.toLowerCase().replace(/\s+/g, '_'),
          display_name: s,
          source_type: 'manual',
          is_active: true,
        }));
      }
      return data as CanonicalLeadSource[];
    },
  });
}
