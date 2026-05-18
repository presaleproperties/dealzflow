import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CrmContact } from './useCrmContacts';
import { normalizeCrmContactArrays } from '@/lib/crmMultiValue';

/**
 * Lightweight contacts fetcher — selects only the columns needed for
 *   • computing pipeline segment counts (segmentMatching)
 *   • populating dynamic filter dropdowns (useDynamicFilterOptions)
 *   • view counts (All / Closed)
 *   • Pipeline Kanban (drops PII like notes/birthday/budget)
 *
 * SECURITY: Realtime subscription is intentionally DISABLED — see CRM
 * Hardening memory. Streaming changes for every contact to every tab
 * leaks PII. Mutations invalidate the cache via their own onSuccess.
 */
const LITE_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'status',
  'pipeline_segment_id',
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
  'stage_changed_at',
  'status_changed_at',
  'lead_score',
  'created_at',
  'updated_at',
].join(',');

export function useCrmContactsLite() {
  return useQuery({
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
          .is('deleted_at', null)
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
}

