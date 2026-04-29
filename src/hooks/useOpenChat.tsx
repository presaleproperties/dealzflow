import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ChatChannel = 'sms' | 'whatsapp' | 'email';

/**
 * One-tap chat opener for a lead on any channel (sms / whatsapp / email).
 *
 * Looks for an existing `crm_conversations` row for the given contact +
 * channel. If found, navigates to the chat thread page. Otherwise calls
 * `onCompose` so the parent can open the matching compose dialog.
 */
export function useOpenChat() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  return useCallback(
    async (contactId: string, channel: ChatChannel, onCompose: () => void) => {
      try {
        const { data, error } = await supabase
          .from('crm_conversations')
          .select('id, last_message_at')
          .eq('contact_id', contactId)
          .eq('channel', channel)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (data?.id) {
          qc.invalidateQueries({ queryKey: ['crm-chats'] });
          navigate(`/crm/chats/${data.id}`);
          return;
        }

        // No existing thread → fall through to compose.
        onCompose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not open chat';
        toast.error(msg);
        onCompose();
      }
    },
    [navigate, qc],
  );
}
