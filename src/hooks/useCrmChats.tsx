import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ChatChannel = 'email' | 'sms' | 'whatsapp';

export interface ChatThread {
  id: string;
  contact_id: string;
  channel: ChatChannel;
  status: string | null;
  unread_count: number;
  last_message_at: string | null;
  // Joined contact fields
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  // Last message preview (best-effort)
  last_message_preview?: string | null;
  last_message_direction?: 'inbound' | 'outbound' | null;
}

/**
 * Unified inbox feed — pulls from `crm_conversations` and joins the contact.
 * Used by the new mobile-first /crm/chats page.
 */
export function useCrmChats(channelFilter?: ChatChannel | 'all') {
  return useQuery({
    queryKey: ['crm-chats', channelFilter ?? 'all'],
    queryFn: async (): Promise<ChatThread[]> => {
      let q = supabase
        .from('crm_conversations')
        .select(
          `id, contact_id, channel, status, unread_count, last_message_at,
           crm_contacts!inner ( first_name, last_name, email, phone )`,
        )
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(200);

      if (channelFilter && channelFilter !== 'all') {
        q = q.eq('channel', channelFilter);
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as any[];
      const ids = rows.map(r => r.id);
      // Fetch most-recent message preview per conversation in one round-trip
      let previews = new Map<string, { content: string; direction: string }>();
      if (ids.length > 0) {
        const { data: msgs } = await supabase
          .from('crm_messages')
          .select('conversation_id, content, direction, created_at')
          .in('conversation_id', ids)
          .order('created_at', { ascending: false });
        if (msgs) {
          for (const m of msgs as any[]) {
            if (!previews.has(m.conversation_id)) {
              previews.set(m.conversation_id, { content: m.content ?? '', direction: m.direction });
            }
          }
        }
      }

      return rows.map((r): ChatThread => {
        const c = Array.isArray(r.crm_contacts) ? r.crm_contacts[0] : r.crm_contacts;
        const p = previews.get(r.id);
        return {
          id: r.id,
          contact_id: r.contact_id,
          channel: r.channel as ChatChannel,
          status: r.status,
          unread_count: r.unread_count ?? 0,
          last_message_at: r.last_message_at,
          first_name: c?.first_name ?? null,
          last_name: c?.last_name ?? null,
          email: c?.email ?? null,
          phone: c?.phone ?? null,
          last_message_preview: p?.content ?? null,
          last_message_direction: (p?.direction as any) ?? null,
        };
      });
    },
    staleTime: 30_000,
  });
}
