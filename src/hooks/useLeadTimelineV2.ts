import { useEffect } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type TimelineKind =
  | 'note'
  | 'email'
  | 'sms'
  | 'behavior'
  | 'engagement'
  | 'form'
  | 'showing'
  | 'task'
  | 'booking';

export interface TimelineEvent {
  event_id: string;
  kind: TimelineKind;
  sub_kind: string | null;
  direction: 'inbound' | 'outbound' | 'in' | 'out' | null;
  occurred_at: string;
  title: string;
  subtitle: string | null;
  body_excerpt: string | null;
  importance: number;
  metadata: Record<string, any> | null;
}

interface UseLeadTimelineV2Args {
  contactId: string;
  kinds?: TimelineKind[] | null;
  search?: string;
  pageSize?: number;
}

const KEY = (contactId: string, kinds: TimelineKind[] | null | undefined, search: string) =>
  ['lead-timeline-v2', contactId, kinds?.join(',') ?? 'all', search] as const;

export function useLeadTimelineV2({
  contactId,
  kinds,
  search = '',
  pageSize = 50,
}: UseLeadTimelineV2Args) {
  const qc = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: KEY(contactId, kinds, search),
    enabled: !!contactId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('crm_lead_timeline_v2', {
        p_contact_id: contactId,
        p_kinds: kinds && kinds.length > 0 ? kinds : null,
        p_search: search || null,
        p_before: pageParam,
        p_limit: pageSize,
      });
      if (error) throw error;
      return (data ?? []) as TimelineEvent[];
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < pageSize) return undefined;
      return lastPage[lastPage.length - 1].occurred_at;
    },
    staleTime: 15_000,
  });

  // Realtime tail — refetch first page when ANY source-of-truth table inserts/updates
  // a row tied to this contact. Debounced so a burst of changes triggers one refetch.
  useEffect(() => {
    if (!contactId) return;

    let pending: number | null = null;
    const schedule = () => {
      if (pending) window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['lead-timeline-v2', contactId] });
        qc.invalidateQueries({ queryKey: ['lead-timeline-pins', contactId] });
        pending = null;
      }, 350);
    };

    const filter = `contact_id=eq.${contactId}`;
    const tables: { table: string; events: ('INSERT' | 'UPDATE')[] }[] = [
      { table: 'crm_activity_events', events: ['INSERT'] },
      { table: 'crm_messages', events: ['INSERT'] },
      { table: 'crm_email_log', events: ['INSERT'] },
      { table: 'crm_email_events', events: ['INSERT'] },
      { table: 'crm_sms', events: ['INSERT', 'UPDATE'] },
      { table: 'crm_calls', events: ['INSERT'] },
      { table: 'crm_contact_forms', events: ['INSERT'] },
      { table: 'crm_showings', events: ['INSERT', 'UPDATE'] },
      { table: 'crm_tasks', events: ['INSERT', 'UPDATE'] },
      { table: 'crm_calendar_events', events: ['INSERT'] },
      { table: 'crm_deals', events: ['INSERT', 'UPDATE'] },
    ];

    let ch = supabase.channel(`lead-timeline-${contactId}`);
    for (const { table, events } of tables) {
      for (const evt of events) {
        ch = ch.on(
          'postgres_changes' as any,
          { event: evt, schema: 'public', table, filter },
          schedule,
        );
      }
    }
    ch.subscribe();

    return () => {
      if (pending) window.clearTimeout(pending);
      void supabase.removeChannel(ch);
    };
  }, [contactId, qc]);

  const events: TimelineEvent[] = (query.data?.pages ?? []).flat();

  return {
    events,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
  };
}

// ------- Pin / unpin -------

export interface TimelinePin {
  id: string;
  contact_id: string;
  event_kind: string;
  event_id: string;
  pinned_at: string;
}

export function useTimelinePins(contactId: string) {
  return useQuery({
    queryKey: ['lead-timeline-pins', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_timeline_pins')
        .select('id, contact_id, event_kind, event_id, pinned_at')
        .eq('contact_id', contactId)
        .order('pinned_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TimelinePin[];
    },
    staleTime: 30_000,
  });
}

export function useTogglePin(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { event: TimelineEvent; isPinned: boolean }) => {
      const { event, isPinned } = args;
      if (isPinned) {
        const { error } = await supabase
          .from('crm_timeline_pins')
          .delete()
          .eq('contact_id', contactId)
          .eq('event_kind', event.kind)
          .eq('event_id', event.event_id);
        if (error) throw error;
        return { pinned: false };
      }
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error('Not signed in');
      const { error } = await supabase.from('crm_timeline_pins').insert({
        contact_id: contactId,
        event_kind: event.kind,
        event_id: event.event_id,
        pinned_by: uid,
      });
      if (error) throw error;
      return { pinned: true };
    },
    onSuccess: ({ pinned }) => {
      qc.invalidateQueries({ queryKey: ['lead-timeline-pins', contactId] });
      toast.success(pinned ? 'Pinned to important moments' : 'Unpinned');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to pin'),
  });
}
