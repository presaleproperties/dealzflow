import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CrmContact } from './useCrmContacts';
import { normalizeCrmContactArrays } from '@/lib/crmMultiValue';

function applyJsonFilters(query: any, filters: Record<string, unknown>) {
  if (!filters || Object.keys(filters).length === 0) return query;
  if (filters.status && Array.isArray(filters.status) && (filters.status as string[]).length > 0) {
    query = query.in('status', filters.status as string[]);
  }
  if (filters.source && Array.isArray(filters.source) && (filters.source as string[]).length > 0) {
    query = query.in('source', filters.source as string[]);
  }
  if (filters.lead_type && Array.isArray(filters.lead_type) && (filters.lead_type as string[]).length > 0) {
    query = query.in('lead_type', filters.lead_type as string[]);
  }
  if (filters.assigned_to && typeof filters.assigned_to === 'string') {
    query = query.eq('assigned_to', filters.assigned_to);
  }
  if (filters.tags && Array.isArray(filters.tags) && (filters.tags as string[]).length > 0) {
    query = query.overlaps('tags', filters.tags as string[]);
  }
  if (filters.contact_type && typeof filters.contact_type === 'string') {
    query = query.eq('contact_type', filters.contact_type);
  }
  return query;
}

export type SortKey = 'name' | 'phone' | 'email' | 'project' | 'source' | 'status' | 'assigned_to' | 'last_touch_at' | 'created_at';
export type SortDir = 'asc' | 'desc';

const SORT_COLUMN_MAP: Record<SortKey, string> = {
  name: 'first_name',
  phone: 'phone',
  email: 'email',
  project: 'project',
  source: 'source',
  status: 'status',
  assigned_to: 'assigned_to',
  last_touch_at: 'last_touch_at',
  created_at: 'created_at',
};

interface PaginatedFilters {
  search: string;
  contactType: string;
  statuses: string[];
  sources: string[];
  agents: string[];
  projects: string[];
  leadTypes: string[];
  languages: string[];
  tags: string[];
  excludeTags?: string[];
  propertyTypes?: string[];
  cities?: string[];
  preApproved?: string[];
  campaigns?: string[];
  letterFilter: string;
  pipelineView: 'all' | 'active' | 'directory';
  segmentFilters?: Record<string, unknown>;
  savedViewFilters?: Record<string, unknown>;
  uncontacted7?: boolean;
  stale30?: boolean;
  highScore?: boolean;
  birthdayMonth?: boolean;
}

interface PaginatedParams {
  page: number;
  pageSize: number;
  sortKey: SortKey;
  sortDir: SortDir;
  filters: PaginatedFilters;
}

interface PaginatedResult {
  contacts: CrmContact[];
  totalCount: number;
  isLoading: boolean;
  isFetching: boolean;
}

export function usePaginatedCrmContacts(params: PaginatedParams): PaginatedResult {
  const { page, pageSize, sortKey, sortDir, filters } = params;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['crm-contacts-paginated', page, pageSize, sortKey, sortDir, filters],
    queryFn: async () => {
      let query = supabase
        .from('crm_contacts')
        .select('*', { count: 'exact' });

      if (filters.search) {
        const q = `%${filters.search}%`;
        query = query.or(`first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
      }

      if (filters.contactType) {
        query = query.eq('contact_type', filters.contactType);
      }
      if (filters.statuses.length > 0) {
        query = query.in('status', filters.statuses);
      }
      if (filters.sources.length > 0) {
        query = query.in('source', filters.sources);
      }
      if (filters.agents.length > 0) {
        query = query.in('assigned_to', filters.agents);
      }
      if (filters.projects.length > 0) {
        query = query.overlaps('projects', filters.projects);
      }
      if (filters.leadTypes.length > 0) {
        // Match either the legacy single `lead_type` column OR the unified
        // `lead_types[]` array, so filtering works regardless of which schema
        // a contact uses. Build PostgREST .or() with both predicates.
        const inList = filters.leadTypes
          .map(t => `"${t.replace(/"/g, '\\"')}"`)
          .join(',');
        const arrLiteral = `{${inList}}`;
        query = query.or(
          `lead_type.in.(${filters.leadTypes.map(t => `"${t}"`).join(',')}),lead_types.ov.${arrLiteral}`,
        );
      }
      if (filters.languages.length > 0) {
        query = query.in('language', filters.languages);
      }
      if (filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }
      if (filters.excludeTags && filters.excludeTags.length > 0) {
        // Exclude any contact whose tags array overlaps with the excluded set.
        // PostgREST: not('tags', 'ov', '{a,b}')
        const escaped = filters.excludeTags.map(t => `"${t.replace(/"/g, '\\"')}"`).join(',');
        query = query.not('tags', 'ov', `{${escaped}}`);
      }
      if (filters.propertyTypes && filters.propertyTypes.length > 0) {
        query = query.in('property_type_pref', filters.propertyTypes);
      }
      if (filters.cities && filters.cities.length > 0) {
        query = query.in('city_pref', filters.cities);
      }
      if (filters.preApproved && filters.preApproved.length > 0) {
        if (filters.preApproved.length === 1) {
          query = query.eq('is_pre_approved', filters.preApproved[0] === 'yes');
        }
      }
      if (filters.campaigns && filters.campaigns.length > 0) {
        query = query.in('campaign_source', filters.campaigns);
      }
      if (filters.letterFilter) {
        query = query.ilike('last_name', `${filters.letterFilter}%`);
      }
      if (filters.pipelineView === 'active') {
        query = query.not('status', 'in', '("Closed","Lost / Cold")');
      }
      if (filters.savedViewFilters) {
        query = applyJsonFilters(query, filters.savedViewFilters);
      }
      if (filters.uncontacted7) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        query = query.or(`last_touch_at.is.null,last_touch_at.lt.${sevenDaysAgo}`);
      }
      if (filters.stale30) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
        query = query.or(`last_touch_at.is.null,last_touch_at.lt.${thirtyDaysAgo}`);
      }
      if (filters.highScore) {
        query = query.gte('lead_score', 70);
      }
      if (filters.birthdayMonth) {
        const month = new Date().getMonth() + 1;
        const monthStr = String(month).padStart(2, '0');
        query = query.not('birthday', 'is', null).ilike('birthday', `%-${monthStr}-%`);
      }
      if (filters.segmentFilters) {
        query = applyJsonFilters(query, filters.segmentFilters);
      }

      const dbColumn = SORT_COLUMN_MAP[sortKey] || 'created_at';
      query = query.order(dbColumn, { ascending: sortDir === 'asc', nullsFirst: false });
      if (sortKey === 'name') {
        query = query.order('last_name', { ascending: sortDir === 'asc', nullsFirst: false });
      }

      query = query.range(from, to);

      const { data: rows, error, count } = await query;
      if (error) throw error;

      const contacts = (rows ?? []).map(d => ({
        ...normalizeCrmContactArrays(d),
        contact_type: d.contact_type ?? 'lead',
      })) as CrmContact[];

      return { contacts, totalCount: count ?? 0 };
    },
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  return {
    contacts: data?.contacts ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    isFetching,
  };
}

