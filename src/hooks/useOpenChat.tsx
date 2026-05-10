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
        // Server-side resolution: walks the Identity Vault so duplicate
        // contact rows that share a normalized phone (SMS/WhatsApp) or
        // email (Email) all resolve to the same existing thread.
        const { data: convId, error } = await supabase.rpc(
          'crm_find_existing_conversation',
          { _contact_id: contactId, _channel: channel },
        );
        if (error) throw error;
        const data = convId ? { id: convId as string } : null;

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
