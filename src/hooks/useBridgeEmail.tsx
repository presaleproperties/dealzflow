import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CrmEmailTemplate } from './useCrmEmail';

export type BridgeTemplate = CrmEmailTemplate & { source: 'presale_properties' };

/**
 * Fetches the live template library from the Presale Properties project
 * via the bridge-templates edge function. Falls back to an empty list if
 * the bridge isn't deployed yet (so the CRM keeps working).
 */
export function useBridgeTemplates() {
  return useQuery({
    queryKey: ['bridge-templates'],
    queryFn: async (): Promise<BridgeTemplate[]> => {
      const { data, error } = await supabase.functions.invoke('bridge-templates', {
        body: {},
      });
      if (error) {
        console.warn('[bridge] templates unavailable:', error.message);
        return [];
      }
      const list = (data?.templates ?? []) as Array<Record<string, unknown>>;
      return list.map((t) => ({
        id: String(t.id),
        name: String(t.name ?? 'Untitled'),
        subject: String(t.subject ?? ''),
        body_html: (t.body_html as string) ?? '',
        project: null,
        category: String(t.category ?? 'general'),
        merge_tags: null,
        is_active: true,
        times_used: null,
        last_used_at: null,
        created_at: (t.updated_at as string) ?? null,
        updated_at: (t.updated_at as string) ?? null,
        source: 'presale_properties',
      }));
    },
    staleTime: 60_000,
    retry: 1,
  });
}

interface SendArgs {
  to: string | string[];
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  template_id?: string | null;
  contact_id?: string | null;
  /** ISO timestamp; if provided, the email is queued via crm_email_schedule. */
  send_at?: string | null;
}

/**
 * Sends (or schedules) an email via the bridge-send-email edge function,
 * which forwards to Presale's Gmail SMTP and writes activity to crm_email_log.
 */
export function useBridgeSendEmail() {
  return useMutation({
    mutationFn: async (args: SendArgs) => {
      const { data, error } = await supabase.functions.invoke('bridge-send-email', {
        body: args,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      if (data?.scheduled) {
        toast.success('Email scheduled');
      } else {
        toast.success('Email sent');
      }
    },
    onError: (err: Error) => toast.error(err.message || 'Send failed'),
  });
}
