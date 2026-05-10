/**
 * Saved searches / smart folders for the CRM inbox.
 * Each user owns their own views; RLS scopes everything by `auth.uid()`.
 *
 * A "view" captures: channel filter + query + advanced filters (sender,
 * subject, dateRange, unreadOnly, attachmentsOnly), so reopening it puts
 * the inbox into the exact same state.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type InboxViewChannel = 'all' | 'email' | 'text' | 'sms' | 'whatsapp';

export interface InboxViewFilters {
  sender?: string;
  subject?: string;
  dateRange?: 'any' | 'today' | '7d' | '30d' | 'custom';
  customFrom?: string;
  customTo?: string;
  unreadOnly?: boolean;
  attachmentsOnly?: boolean;
  starredOnly?: boolean;
  showArchived?: boolean;
  showCampaigns?: boolean;
  hasFailures?: boolean;
}

export interface InboxView {
  id: string;
  user_id: string;
  name: string;
  channel: InboxViewChannel;
  query: string;
  filters: InboxViewFilters;
  pinned: boolean;
  sort_order: number;
}

const KEY = (uid?: string | null) => ['crm-inbox-views', uid ?? 'anon'];

export function useCrmInboxViews() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: KEY(user?.id),
    enabled: !!user?.id,
    queryFn: async (): Promise<InboxView[]> => {
      const { data, error } = await supabase
        .from('crm_inbox_views')
        .select('*')
        .order('pinned', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r, filters: (r.filters ?? {}) as InboxViewFilters,
      })) as InboxView[];
    },
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async (v: Omit<InboxView, 'id' | 'user_id' | 'sort_order'> & { sort_order?: number }) => {
      if (!user?.id) throw new Error('Not signed in');
      const { error } = await supabase.from('crm_inbox_views').insert([{
        user_id: user.id,
        name: v.name,
        channel: v.channel,
        query: v.query,
        filters: v.filters as any,
        pinned: v.pinned,
        sort_order: v.sort_order ?? 0,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY(user?.id) });
      toast.success('Saved view');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not save view'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_inbox_views').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(user?.id) }),
    onError: (e: any) => toast.error(e?.message ?? 'Could not delete view'),
  });

  return { views: list.data ?? [], isLoading: list.isLoading, create, remove };
}
