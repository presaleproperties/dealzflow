import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CrmEmailTemplate } from './useCrmEmail';

export type BridgeAssetType = 'email' | 'flyer' | 'social';

export type BridgeTemplate = CrmEmailTemplate & {
  source: 'presale_properties';
  asset_type: BridgeAssetType;
  thumbnail_url: string | null;
  tags_raw: string[];
};

/** Best-effort classification of a Presale template into email/flyer/social. */
function classifyAsset(raw: Record<string, unknown>): BridgeAssetType {
  const tags = (Array.isArray(raw.tags) ? (raw.tags as unknown[]) : []).map((t) =>
    String(t).toLowerCase(),
  );
  if (tags.some((t) => t === 'social' || t === 'instagram' || t === 'facebook')) return 'social';
  if (tags.some((t) => t === 'flyer' || t === 'print' || t === 'one-pager')) return 'flyer';
  if (tags.some((t) => t === 'email' || t === 'campaign')) return 'email';
  const cat = String(raw.category ?? '').toLowerCase();
  if (cat.includes('flyer') || cat.includes('print')) return 'flyer';
  if (cat.includes('social')) return 'social';
  // Presale flyer assets typically have no body_html (they're print one-pagers).
  const bodyHtml = String(raw.body_html ?? '');
  const name = String(raw.name ?? '').toLowerCase();
  if (!bodyHtml && (name.includes('flyer') || name.includes('one-pager'))) return 'flyer';
  return 'email';
}

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
      return list.map((t) => {
        const tagsRaw = (Array.isArray(t.tags) ? (t.tags as unknown[]) : []).map((x) => String(x));
        return {
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
          asset_type: classifyAsset(t),
          thumbnail_url: (t.thumbnail as string) ?? null,
          tags_raw: tagsRaw,
        };
      });
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SendArgs) => {
      const { data, error } = await supabase.functions.invoke('bridge-send-email', {
        body: args,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      if (data?.scheduled) {
        toast.success('Email scheduled');
      } else {
        toast.success('Email sent');
      }
      // Refresh anything that reads from crm_email_log so the lead detail
      // history, dashboard KPIs, recent activity and right-rail update
      // immediately after a send (mobile composer, dialog, campaign fan-out).
      if (variables.contact_id) {
        qc.invalidateQueries({ queryKey: ['crm-email-log', variables.contact_id] });
        qc.invalidateQueries({ queryKey: ['crm-contact-messages', variables.contact_id] });
      }
      qc.invalidateQueries({ queryKey: ['crm-email-log'] });
      qc.invalidateQueries({ queryKey: ['crm-chats'] });
      qc.invalidateQueries({ queryKey: ['crm-recent-activity'] });
      qc.invalidateQueries({ queryKey: ['cmd-activity-feed'] });
      qc.invalidateQueries({ queryKey: ['crm-kpi-cards'] });
      qc.invalidateQueries({ queryKey: ['command-center-stats'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Send failed'),
  });
}
