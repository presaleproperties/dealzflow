import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * One-tap WhatsApp opener for a lead.
 *
 * Looks for an existing `crm_conversations` row with `channel = 'whatsapp'`
 * for the given contact. If found, navigates to the chat thread page so
 * the user can continue the conversation. Otherwise calls `onCompose` so
 * the parent can open the SendTextDialog pre-set to WhatsApp to start a
 * new conversation.
 */
export function useOpenWhatsAppChat() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  return useCallback(
    async (contactId: string, onCompose: () => void) => {
      try {
        const { data, error } = await supabase
          .from('crm_conversations')
          .select('id, last_message_at')
          .eq('contact_id', contactId)
          .eq('channel', 'whatsapp')
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (data?.id) {
          // Refresh inbox unread counts when leaving the lead page.
          qc.invalidateQueries({ queryKey: ['crm-chats'] });
          navigate(`/crm/chats/${data.id}`);
          return;
        }

        // No existing thread → start a new WhatsApp message.
        onCompose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not open WhatsApp chat';
        toast.error(msg);
        // Fall back to compose so the user is never stuck.
        onCompose();
      }
    },
    [navigate, qc],
  );
}
