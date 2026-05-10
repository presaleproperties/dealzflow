import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ChatChannel = 'sms' | 'whatsapp' | 'email';

/**
 * One-tap chat opener for a lead on any channel.
 *
 * If an existing `crm_conversations` row exists for the contact + channel,
 * navigates to that thread. Otherwise navigates into the inline new-chat
 * pane on the Chats page with the contact pre-selected — no popups.
 *
 * Pass `onCompose` only if you need a fallback (legacy callers).
 */
export function useOpenChat() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  return useCallback(
    async (contactId: string, channel: ChatChannel, onCompose?: () => void) => {
      try {
        // Prefer an existing thread on the requested channel; if none,
        // fall back to ANY thread for that contact so we never strand
        // the user in a blank "new chat" when they already have history.
        const { data: preferred } = await supabase
          .from('crm_conversations')
          .select('id, channel, last_message_at')
          .eq('contact_id', contactId)
          .eq('channel', channel)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

        let data = preferred;
        if (!data?.id) {
          const { data: anyThread, error } = await supabase
            .from('crm_conversations')
            .select('id, channel, last_message_at')
            .eq('contact_id', contactId)
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          data = anyThread;
        }

        qc.invalidateQueries({ queryKey: ['crm-chats'] });

        if (data?.id) {
          navigate(`/crm/chats/${data.id}`);
        } else {
          navigate(`/crm/chats/new?contactId=${encodeURIComponent(contactId)}&channel=${channel}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not open chat';
        toast.error(msg);
        if (onCompose) onCompose();
      }
    },
    [navigate, qc],
  );
}
