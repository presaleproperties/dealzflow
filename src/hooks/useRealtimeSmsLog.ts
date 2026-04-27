// Realtime sync for crm_sms_log — invalidates message queries on any insert/update/delete.
// Mounted once at the Messaging Center level so incoming SMS/WhatsApp + status updates
// appear live without manual refresh.
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useRealtimeSmsLog() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('crm-sms-log-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_sms_log' },
        () => {
          qc.invalidateQueries({ queryKey: ['crm-sms-log-all'] });
          qc.invalidateQueries({ queryKey: ['crm-sms-log'] });
          qc.invalidateQueries({ queryKey: ['crm-chats'] });
          qc.invalidateQueries({ queryKey: ['crm-chat-thread'] });
          qc.invalidateQueries({ queryKey: ['crm-chat-thread-messages'] });
          qc.invalidateQueries({ queryKey: ['crm-contact-messages'] });
          qc.invalidateQueries({ queryKey: ['crm-recent-activity'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
