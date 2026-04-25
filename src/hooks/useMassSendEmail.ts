// useMassSendEmail — sends one email per recipient via the
// `crm-mass-send-email` edge function. Each recipient gets a personalized
// message (variable substitution happens server-side per row).

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MassSendArgs {
  recipient_ids: string[];
  subject: string;
  body_html: string;
  append_signature: boolean;
  signature_id: string | null;
  cc?: string | null;
  bcc?: string | null;
}

export interface MassSendResult {
  job_id: string;
  queued: number;
  skipped: number;
  estimated_seconds: number;
}

export function useMassSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: MassSendArgs): Promise<MassSendResult> => {
      const { data, error } = await supabase.functions.invoke('crm-mass-send-email', {
        body: args,
      });
      if (error) {
        throw new Error(error.message ?? 'Mass send failed');
      }
      if (!data?.job_id) {
        throw new Error(data?.error ?? 'Mass send returned no job id');
      }
      return data as MassSendResult;
    },
    onSuccess: (res) => {
      toast.success(
        res.queued === 1
          ? 'Email queued'
          : `${res.queued.toLocaleString()} emails queued · ~${Math.max(1, Math.round(res.estimated_seconds / 60))}m to send`,
        {
          description: res.skipped > 0
            ? `${res.skipped} skipped (suppressed, bounced, or no email)`
            : undefined,
        },
      );
      qc.invalidateQueries({ queryKey: ['crm-email-log'] });
      qc.invalidateQueries({ queryKey: ['crm-mass-send-jobs'] });
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Mass send failed');
    },
  });
}
