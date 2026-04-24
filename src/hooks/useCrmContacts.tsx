import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { normalizeCrmContactArrays, normalizeCrmMultiValueList } from '@/lib/crmMultiValue';

export type CrmContact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  email_secondary: string | null;
  phone: string | null;
  phone_secondary: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  source: string | null;
  status: string | null;
  project: string | null;
  projects: string[];
  assigned_to: string | null;
  tags: string[];
  budget_min: number | null;
  budget_max: number | null;
  bedrooms_preferred: string | null;
  language: string | null;
  lead_type: string | null;
  lead_score: number | null;
  notes: string | null;
  contact_type: string;
  birthday: string | null;
  co_buyer_name: string | null;
  co_buyer_phone: string | null;
  co_buyer_email: string | null;
  co_buyer_birthday: string | null;
  last_contact_at: string | null;
  next_followup_date: string | null;
  status_changed_at: string | null;
  lofty_id: string | null;
  last_touch_at: string | null;
  last_touch_type: string | null;
  stage_changed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmContactInsert = {
  first_name: string;
  last_name: string;
  email?: string;
  email_secondary?: string;
  phone?: string;
  source?: string;
  status?: string;
  project?: string;
  projects?: string[];
  assigned_to?: string;
  tags?: string[];
  contact_type?: string;
  birthday?: string;
  co_buyer_birthday?: string;
};

export const CONTACT_TYPES = ['lead', 'realtor', 'past_client'] as const;

export const LEAD_STATUSES = [
  'New Lead',
  'Contacted',
  'Nurturing',
  'Hot / Engaged',
  'Showing Booked',
  'Offer Made',
  'Closed',
  'Lost / Cold',
] as const;

export const LEAD_SOURCES = [
  'Facebook Ad',
  'Instagram',
  'TikTok',
  'Website Form',
  'presaleproperties.com',
  'Calendly',
  'WhatsApp',
  'Referral',
  'Manual Entry',
] as const;

export const AGENTS = [
  'Uzair Muhammad',
  'Sarb Grewal',
  'Ravish Passy',
] as const;

export const PROJECTS = [
  'Eden by Zenterra',
  'The Rail District',
  'Parkway 2',
  'Reign',
  'Belmont Residences',
  'General',
] as const;

export const LEAD_TYPES = [
  'First-Time Buyer',
  'Investor',
  'Both',
  'presale',
  'resale',
  'commercial',
  'realtor',
] as const;

export const LEAD_TYPE_LABELS: Record<string, string> = {
  'First-Time Buyer': 'First-Time Buyer',
  'Investor': 'Investor',
  'Both': 'Both',
  'presale': 'Pre-Sale',
  'resale': 'Re-Sale',
  'commercial': 'Commercial',
  'realtor': 'Realtor',
};

export function useCrmContacts() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['crm-contacts'],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: Record<string, unknown>[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('crm_contacts')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allData = allData.concat(data);
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
    staleTime: 30_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  useEffect(() => {
    const channel = supabase
      .channel('crm-contacts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_contacts' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
          queryClient.invalidateQueries({ queryKey: ['crm-dashboard-kpis'] });
          queryClient.invalidateQueries({ queryKey: ['crm-pipeline-snapshot'] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
}

export function useDynamicFilterOptions(contacts: CrmContact[]) {
  // Pull canonical library data so the filter dropdowns always include EVERY tag,
  // project, and lead-type that exists across the entire CRM — not just the
  // values that happen to appear on the currently loaded/paginated contacts.
  const { data: tagLibRaw = [] } = useQuery({
    queryKey: ['crm-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_tags')
        .select('name,usage_count')
        .order('usage_count', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ name: string; usage_count: number }>;
    },
    staleTime: 60_000,
  });
  const { data: projectLibRaw = [] } = useQuery({
    queryKey: ['crm-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_projects' as any)
        .select('name,usage_count')
        .order('usage_count', { ascending: false });
      if (error) throw error;
      return (((data ?? []) as unknown) as Array<{ name: string; usage_count: number }>);
    },
    staleTime: 60_000,
  });
  const { data: leadTypeLibRaw = [] } = useQuery({
    queryKey: ['crm-lead-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_lead_types' as any)
        .select('name,usage_count')
        .order('usage_count', { ascending: false });
      if (error) throw error;
      return (((data ?? []) as unknown) as Array<{ name: string; usage_count: number }>);
    },
    staleTime: 60_000,
  });

  // Case-insensitive de-duplication
  const projectCounts = new Map<string, { label: string; count: number }>();
  const tagCounts = new Map<string, { label: string; count: number }>();
  const leadTypeCounts = new Map<string, { label: string; count: number }>();
  const allLanguages = new Set<string>();
  const allCities = new Set<string>();
  const allCampaigns = new Set<string>();

  const seedFromLibrary = (
    map: Map<string, { label: string; count: number }>,
    rows: Array<{ name: string; usage_count: number }>,
  ) => {
    rows.forEach(r => {
      const trimmed = (r.name ?? '').trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { label: trimmed, count: r.usage_count ?? 0 });
      }
    });
  };
  // Seed from libraries first so every canonical value is present even if no loaded
  // contact happens to use it on this page.
  seedFromLibrary(projectCounts, projectLibRaw);
  seedFromLibrary(tagCounts, tagLibRaw);
  seedFromLibrary(leadTypeCounts, leadTypeLibRaw);

  const bumpCount = (map: Map<string, { label: string; count: number }>, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { label: trimmed, count: 1 });
    }
    // If already present (from library seed), trust the library count — don't double-count.
  };

  contacts.forEach(c => {
    normalizeCrmMultiValueList(c.projects).forEach(p => bumpCount(projectCounts, p));
    if (c.project) bumpCount(projectCounts, c.project);
    if (c.language) allLanguages.add(c.language);
    normalizeCrmMultiValueList(c.tags).forEach(t => bumpCount(tagCounts, t));
    normalizeCrmMultiValueList((c as any).lead_types).forEach(t => bumpCount(leadTypeCounts, t));
    if (c.lead_type) bumpCount(leadTypeCounts, c.lead_type);
    if ((c as any).city_pref) allCities.add((c as any).city_pref);
    if ((c as any).campaign_source) allCampaigns.add((c as any).campaign_source);
  });

  const sortByLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });

  const toCountMap = (map: Map<string, { label: string; count: number }>) => {
    const out: Record<string, number> = {};
    map.forEach(({ label, count }) => { out[label] = count; });
    return out;
  };

  return {
    projects: Array.from(projectCounts.values()).sort(sortByLabel).map(v => v.label),
    languages: Array.from(allLanguages).sort(),
    tags: Array.from(tagCounts.values()).sort(sortByLabel).map(v => v.label),
    leadTypes: Array.from(leadTypeCounts.values()).sort(sortByLabel).map(v => v.label),
    cities: Array.from(allCities).sort(),
    campaigns: Array.from(allCampaigns).sort(),
    projectCounts: toCountMap(projectCounts),
    tagCounts: toCountMap(tagCounts),
    leadTypeCounts: toCountMap(leadTypeCounts),
  };
}

export function useAddCrmContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contact: CrmContactInsert) => {
      const row = {
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email || null,
        phone: contact.phone || null,
        source: contact.source || null,
        status: contact.contact_type === 'past_client' ? 'Closed' : (contact.status || 'New Lead'),
        project: contact.project || null,
        assigned_to: contact.assigned_to || null,
        contact_type: contact.contact_type || 'lead',
        ...(contact.contact_type === 'past_client' ? { status_changed_at: new Date().toISOString() } : {}),
      };
      const { data, error } = await supabase
        .from('crm_contacts')
        .insert(row)
        .select()
        .single();
      if (error) throw error;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      toast.success('Lead added successfully');
    },
    onError: (err: Error) => {
      toast.error(`Failed to add lead: ${err.message}`);
    },
  });
}

export function useBulkUpdateContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: Record<string, unknown> }) => {
      const normalizedUpdates = { ...updates };
      if ('tags' in normalizedUpdates) normalizedUpdates.tags = normalizeCrmMultiValueList(normalizedUpdates.tags);
      if ('projects' in normalizedUpdates) normalizedUpdates.projects = normalizeCrmMultiValueList(normalizedUpdates.projects);

      const { error } = await supabase
        .from('crm_contacts')
        .update(normalizedUpdates)
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      toast.success('Contacts updated');
    },
    onError: (err: Error) => {
      toast.error(`Update failed: ${err.message}`);
    },
  });
}

export function useBulkDeleteContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('crm_contacts')
        .delete()
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      toast.success('Contacts deleted');
    },
    onError: (err: Error) => {
      toast.error(`Delete failed: ${err.message}`);
    },
  });
}
