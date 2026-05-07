import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CrmContact } from './useCrmContacts';
import { normalizeCrmContactArrays } from '@/lib/crmMultiValue';

/**
 * Lightweight contacts fetcher — selects only the columns needed for
 *   • computing pipeline segment counts (segmentMatching)
 *   • populating dynamic filter dropdowns (useDynamicFilterOptions)
 *   • view counts (All / Closed)
 *
 * Drops payload from ~50 columns × 6900 rows to ~13 columns × 6900 rows,
 * making the Leads page render its pills/filters dramatically faster while
 * the visible table itself is still served by usePaginatedCrmContacts.
 */
const LITE_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'status',
  'source',
  'lead_type',
  'lead_types',
  'tags',
  'projects',
  'project',
  'language',
  'contact_type',
  'assigned_to',
  'city_pref',
  'property_type_pref',
  'is_pre_approved',
  'campaign_source',
  'last_touch_at',
].join(',');

export function useCrmContactsLite() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['crm-contacts-lite'],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: Record<string, unknown>[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('crm_contacts')
          .select(LITE_COLUMNS)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allData = allData.concat(data as unknown as Record<string, unknown>[]);
          from += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      return allData.map(d => ({
        ...normalizeCrmContactArrays(d),
        contact_type: (d as Record<string, unknown>).contact_type as string ?? 'lead',
      })) as CrmContact[];
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  useEffect(() => {
    const channel = supabase
      .channel('crm-contacts-lite-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_contacts' },
        () => queryClient.invalidateQueries({ queryKey: ['crm-contacts-lite'] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}
