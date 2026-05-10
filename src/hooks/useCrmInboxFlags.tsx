/**
 * Mutations for inbox controls on a conversation row:
 *   - star / unstar (pin to top)
 *   - archive / unarchive (hide from default inbox)
 *   - snooze until / unsnooze (auto-restore at time)
 *   - mark read / unread
 *
 * All mutations support a single id or a list of ids so the same hook
 * powers row-level actions and the bulk-select toolbar.
 *
 * Cache invalidation: every mutation invalidates the `crm-chats` query so
 * the inbox list reflects the change immediately.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Ids = string | string[];

const toArray = (ids: Ids): string[] => (Array.isArray(ids) ? ids : [ids]);

export function useCrmInboxFlags() {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['crm-chats'] });
    qc.invalidateQueries({ queryKey: ['crm-chat-thread'] });
  };

  const updateFlags = useMutation({
    mutationFn: async (args: { ids: Ids; patch: Record<string, unknown> }) => {
      const ids = toArray(args.ids);
      const { error } = await supabase
        .from('crm_conversations')
        .update(args.patch)
        .in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: inv,
    onError: (e: any) => toast.error(e?.message ?? 'Could not update'),
  });

  const star = (ids: Ids, next = true) =>
    updateFlags.mutateAsync({ ids, patch: { is_starred: next } });

  const archive = (ids: Ids, next = true) =>
    updateFlags.mutateAsync({ ids, patch: { is_archived: next } });

  /** Pass null to clear snooze. */
  const snooze = (ids: Ids, untilIso: string | null) =>
    updateFlags.mutateAsync({ ids, patch: { snoozed_until: untilIso } });

  const markRead = (ids: Ids) =>
    updateFlags.mutateAsync({ ids, patch: { unread_count: 0 } });

  const markUnread = (ids: Ids) =>
    updateFlags.mutateAsync({ ids, patch: { unread_count: 1 } });

  const remove = useMutation({
    mutationFn: async (ids: Ids) => {
      const arr = toArray(ids);
      const { error } = await supabase
        .from('crm_conversations')
        .delete()
        .in('id', arr);
      if (error) throw error;
      return arr.length;
    },
    onSuccess: inv,
    onError: (e: any) => toast.error(e?.message ?? 'Could not delete'),
  });

  return {
    star, archive, snooze, markRead, markUnread,
    remove: (ids: Ids) => remove.mutateAsync(ids),
    isPending: updateFlags.isPending || remove.isPending,
  };
}

/** Common snooze presets. Returns ISO strings. */
export function snoozePresets(): { id: string; label: string; iso: string }[] {
  const now = new Date();
  const inHours = (h: number) => {
    const d = new Date(now); d.setHours(d.getHours() + h); return d.toISOString();
  };
  const tomorrow9 = (() => {
    const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString();
  })();
  const monday9 = (() => {
    const d = new Date(now);
    const dow = d.getDay(); // 0=Sun
    const add = ((8 - dow) % 7) || 7; // next Monday
    d.setDate(d.getDate() + add); d.setHours(9, 0, 0, 0); return d.toISOString();
  })();
  return [
    { id: '1h',  label: 'In 1 hour',         iso: inHours(1) },
    { id: '3h',  label: 'In 3 hours',        iso: inHours(3) },
    { id: 'tom', label: 'Tomorrow, 9 AM',    iso: tomorrow9 },
    { id: 'mon', label: 'Next Monday, 9 AM', iso: monday9 },
  ];
}
