import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { toast } from 'sonner';

export type CrmShowing = {
  id: string;
  contact_id: string;
  project: string;
  unit: string | null;
  showing_date: string;
  showing_time: string;
  status: string | null;
  assigned_agent: string | null;
  notes: string | null;
  created_at: string | null;
};

export type CrmShowingWithContact = CrmShowing & {
  crm_contacts: { id: string; first_name: string; last_name: string } | null;
};

export function useCrmShowings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['crm-showings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_showings')
        .select('*, crm_contacts(id, first_name, last_name)')
        .order('showing_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmShowingWithContact[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('crm-showings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_showings' }, () => {
        qc.invalidateQueries({ queryKey: ['crm-showings'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

export function useCreateShowing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (showing: {
      contact_id: string;
      project: string;
      unit?: string;
      showing_date: string;
      showing_time: string;
      assigned_agent?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('crm_showings')
        .insert({
          contact_id: showing.contact_id,
          project: showing.project,
          unit: showing.unit || null,
          showing_date: showing.showing_date,
          showing_time: showing.showing_time,
          assigned_agent: showing.assigned_agent || null,
          notes: showing.notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-showings'] });
      toast.success('Showing booked');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateShowingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('crm_showings').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-showings'] });
      toast.success('Showing updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
