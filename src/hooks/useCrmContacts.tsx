import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { normalizeCrmContactArrays, normalizeCrmMultiValueList } from '@/lib/crmMultiValue';

export type CrmContact = {
...
};

export type CrmContactInsert = {
...
};

export const CONTACT_TYPES = ['lead', 'realtor', 'past_client'] as const;

export const LEAD_STATUSES = [
...
];

export const LEAD_SOURCES = [
...
];

export const AGENTS = [
...
];

export const PROJECTS = [
...
];

export const LEAD_TYPES = [
...
];

export const LEAD_TYPE_LABELS: Record<string, string> = {
...
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

  // Realtime subscription
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

/** Extract unique values from all contacts for dynamic filter options */
export function useDynamicFilterOptions(contacts: CrmContact[]) {
  const allProjects = new Set<string>();
  const allLanguages = new Set<string>();
  const allTags = new Set<string>();
  const allCities = new Set<string>();
  const allCampaigns = new Set<string>();

  contacts.forEach(c => {
    normalizeCrmMultiValueList(c.projects).forEach(p => { if (p) allProjects.add(p); });
    if (c.project) allProjects.add(c.project);
    if (c.language) allLanguages.add(c.language);
    normalizeCrmMultiValueList(c.tags).forEach(t => { if (t) allTags.add(t); });
    if ((c as any).city_pref) allCities.add((c as any).city_pref);
    if ((c as any).campaign_source) allCampaigns.add((c as any).campaign_source);
  });

  return {
    projects: Array.from(allProjects).sort(),
    languages: Array.from(allLanguages).sort(),
    tags: Array.from(allTags).sort(),
    cities: Array.from(allCities).sort(),
    campaigns: Array.from(allCampaigns).sort(),
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
      const { error } = await supabase
        .from('crm_contacts')
        .update(updates)
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
