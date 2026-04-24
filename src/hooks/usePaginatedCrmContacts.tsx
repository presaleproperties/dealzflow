import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CrmContact } from './useCrmContacts';

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

// Map frontend sort keys to actual DB columns
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

      // Search across name, email, phone
      if (filters.search) {
        const q = `%${filters.search}%`;
        query = query.or(`first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
      }

      // Filters
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
        // Match contacts whose projects array overlaps with filter
        query = query.overlaps('projects', filters.projects);
      }
      if (filters.leadTypes.length > 0) {
        query = query.in('lead_type', filters.leadTypes);
      }
      if (filters.languages.length > 0) {
        query = query.in('language', filters.languages);
      }
      if (filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }
      if (filters.propertyTypes && filters.propertyTypes.length > 0) {
        query = query.in('property_type_pref', filters.propertyTypes);
      }
      if (filters.cities && filters.cities.length > 0) {
        query = query.in('city_pref', filters.cities);
      }
      if (filters.preApproved && filters.preApproved.length > 0) {
        // values arrive as 'yes' / 'no'
        if (filters.preApproved.length === 1) {
          query = query.eq('is_pre_approved', filters.preApproved[0] === 'yes');
        }
        // when both selected, no filter (matches all)
      }
      if (filters.campaigns && filters.campaigns.length > 0) {
        query = query.in('campaign_source', filters.campaigns);
      }

      // A-Z letter filter
      if (filters.letterFilter) {
        query = query.ilike('last_name', `${filters.letterFilter}%`);
      }

      // Pipeline view filter
      if (filters.pipelineView === 'active') {
        query = query.not('status', 'in', '("Closed","Lost / Cold")');
      }

      // Saved view filters
      if (filters.savedViewFilters) {
        query = applyJsonFilters(query, filters.savedViewFilters);
      }

      // Uncontacted 7+ days special filter
      if (filters.uncontacted7) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        query = query.or(`last_touch_at.is.null,last_touch_at.lt.${sevenDaysAgo}`);
      }

      // Stale 30+ days
      if (filters.stale30) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
        query = query.or(`last_touch_at.is.null,last_touch_at.lt.${thirtyDaysAgo}`);
      }

      // High score leads
      if (filters.highScore) {
        query = query.gte('lead_score', 70);
      }

      // Birthday this month
      if (filters.birthdayMonth) {
        const month = new Date().getMonth() + 1;
        const monthStr = String(month).padStart(2, '0');
        query = query.not('birthday', 'is', null).ilike('birthday', `%-${monthStr}-%`);
      }

      // Segment filters
      if (filters.segmentFilters) {
        query = applyJsonFilters(query, filters.segmentFilters);
      }

      // Sort
      const dbColumn = SORT_COLUMN_MAP[sortKey] || 'created_at';
      query = query.order(dbColumn, { ascending: sortDir === 'asc', nullsFirst: false });

      // If sorting by first_name, also sort by last_name as secondary
      if (sortKey === 'name') {
        query = query.order('last_name', { ascending: sortDir === 'asc', nullsFirst: false });
      }

      // Pagination
      query = query.range(from, to);

      const { data: rows, error, count } = await query;
      if (error) throw error;

      const contacts = (rows ?? []).map(d => ({
        ...d,
        tags: (d.tags as string[] | null) ?? [],
        projects: (d.projects as string[] | null) ?? [],
        contact_type: d.contact_type ?? 'lead',
      })) as CrmContact[];

      return { contacts, totalCount: count ?? 0 };
    },
    staleTime: 15_000,
    placeholderData: (prev) => prev, // keep previous data while loading new page
  });

  return {
    contacts: data?.contacts ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    isFetching,
  };
}
