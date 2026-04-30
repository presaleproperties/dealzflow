import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  // Email subject of latest message (email channel only)
  subject?: string | null;
  // True when latest message has attachments (MMS media or email attachment markers)
  has_attachment?: boolean;
  // Inbox controls
  is_starred?: boolean;
  is_archived?: boolean;
  snoozed_until?: string | null;
  // Last outbound delivery state ('failed' surfaces a red dot in the inbox row)
  last_outbound_status?: string | null;
}

/**
 * Unified inbox feed — pulls from `crm_conversations` and joins the contact.
 * Used by the new mobile-first /crm/chats page.
 */
/** UI-level filter — 'text' is a virtual channel meaning SMS ∪ WhatsApp. */
export type ChatChannelFilter = ChatChannel | 'text' | 'all';

export function useCrmChats(channelFilter?: ChatChannelFilter) {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('crm-chats-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_conversations' }, () => {
        qc.invalidateQueries({ queryKey: ['crm-chats'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_messages' }, () => {
        qc.invalidateQueries({ queryKey: ['crm-chats'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

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

      if (channelFilter === 'text') {
        q = q.in('channel', ['sms', 'whatsapp']);
      } else if (channelFilter && channelFilter !== 'all') {
        q = q.eq('channel', channelFilter);
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as any[];
      const ids = rows.map(r => r.id);
      // Fetch most-recent message preview per conversation in one round-trip
      type LatestMsg = { content: string; direction: string; source_table: string | null; source_id: string | null };
      let previews = new Map<string, LatestMsg>();
      if (ids.length > 0) {
        const { data: msgs } = await supabase
          .from('crm_messages')
          .select('conversation_id, content, direction, created_at, source_table, source_id')
          .in('conversation_id', ids)
          .order('created_at', { ascending: false });
        if (msgs) {
          for (const m of msgs as any[]) {
            if (!previews.has(m.conversation_id)) {
              previews.set(m.conversation_id, {
                content: m.content ?? '',
                direction: m.direction,
                source_table: m.source_table ?? null,
                source_id: m.source_id ?? null,
              });
            }
          }
        }
      }

      // Enrich latest message with subject (email) + attachment flag (mms / email).
      const emailIds: string[] = [];
      const smsIds: string[] = [];
      previews.forEach((p) => {
        if (!p.source_id) return;
        if (p.source_table === 'crm_email_log') emailIds.push(p.source_id);
        else if (p.source_table === 'crm_sms_log') smsIds.push(p.source_id);
      });

      const subjectById = new Map<string, string>();
      const attachIds = new Set<string>();
      if (emailIds.length > 0) {
        const { data: emails } = await supabase
          .from('crm_email_log')
          .select('id, subject, body')
          .in('id', emailIds);
        for (const e of (emails ?? []) as any[]) {
          if (e.subject) subjectById.set(e.id, e.subject);
          // Heuristic: emails with inline cid:/img-src/filename markers in body
          const html = (e.body ?? '') as string;
          if (/cid:|<\s*img[^>]+src=|filename=/i.test(html)) attachIds.add(e.id);
        }
      }
      if (smsIds.length > 0) {
        const { data: smsRows } = await supabase
          .from('crm_sms_log')
          .select('id, media_urls')
          .in('id', smsIds);
        for (const s of (smsRows ?? []) as any[]) {
          if (Array.isArray(s.media_urls) && s.media_urls.length > 0) attachIds.add(s.id);
        }
      }

      return rows.map((r): ChatThread => {
        const c = Array.isArray(r.crm_contacts) ? r.crm_contacts[0] : r.crm_contacts;
        const p = previews.get(r.id);
        const subject = p?.source_table === 'crm_email_log' && p.source_id ? subjectById.get(p.source_id) ?? null : null;
        const has_attachment = !!(p?.source_id && attachIds.has(p.source_id));
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
          subject,
          has_attachment,
        };
      });
    },
    staleTime: 5_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    select: (threads: ChatThread[]) => {
      // Collapse to one row per (contact_id, channel). When multiple
      // crm_conversations rows exist for the same lead+channel, keep the
      // most-recently-active conversation as the canonical row but sum
      // unread counts across the duplicates so nothing is lost.
      const byKey = new Map<string, ChatThread>();
      for (const t of threads) {
        const key = `${t.contact_id}::${t.channel}`;
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, { ...t });
          continue;
        }
        existing.unread_count = (existing.unread_count ?? 0) + (t.unread_count ?? 0);
        // threads arrive sorted by last_message_at desc, so `existing` already
        // holds the freshest preview/timestamp — nothing else to merge.
      }
      return Array.from(byKey.values()).sort((a, b) => {
        const av = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bv = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return bv - av;
      });
    },
  });
}
