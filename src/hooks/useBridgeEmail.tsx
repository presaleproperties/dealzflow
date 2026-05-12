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
      // Read directly from the unified table — RLS already scopes results
      // to the caller (their own + team templates). No need for the legacy
      // bridge-templates edge function.
      const { data, error } = await supabase
        .from('crm_email_templates')
        .select('id, name, subject, body_html, category, project, is_active, times_used, last_used_at, created_at, updated_at, source, owner_scope')
        .eq('is_active', true)
        .eq('source', 'presale')
        .order('updated_at', { ascending: false });
      if (error) {
        console.warn('[bridge] templates unavailable:', error.message);
        return [];
      }
      return (data ?? []).map((t) => ({
        id: String(t.id),
        name: String(t.name ?? 'Untitled'),
        subject: String(t.subject ?? ''),
        body_html: (t.body_html as string) ?? '',
        project: t.project ?? null,
        category: String(t.category ?? 'general'),
        merge_tags: null,
        is_active: true,
        times_used: t.times_used ?? null,
        last_used_at: t.last_used_at ?? null,
        created_at: t.created_at ?? null,
        updated_at: t.updated_at ?? null,
        source: 'presale_properties',
        owner_scope: 'team:presale',
        owner_agent_slug: null,
        created_by_agent_slug: null,
        asset_type: classifyAsset(t),
        thumbnail_url: (t as any).thumbnail ?? null,
        tags_raw: [],
      }));
    },
    // Keep templates fresh: refetch every 60s in background, on focus, and on reconnect.
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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
      // Immediate sends go straight through Gmail (synchronous). Only
      // scheduled (`send_at`) sends are queued. We never set queue_only here —
      // doing so was making every "Send" land in crm_email_schedule and
      // surface a misleading "delivery will retry" toast even when Gmail
      // was healthy. The bridge-send-email edge fn falls back to the queue
      // automatically if the inbox is genuinely disconnected.
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
      } else if (data?.queued) {
        if (data?.reason === 'inbox_not_connected') {
          toast.warning('Email queued — connect your inbox', {
            description: data?.message
              || "Your Gmail isn't connected yet. Go to Settings → Email → Connect Gmail to send immediately.",
            duration: 8000,
            action: {
              label: 'Connect',
              onClick: () => { window.location.href = '/crm/settings?tab=email'; },
            },
          });
        } else if (data?.reason === 'no_email_provider') {
          toast.warning('Email queued — no provider available', {
            description: data?.message
              || 'Connect your Gmail in Settings → Email, or ask an admin to configure the Resend fallback.',
            duration: 10000,
            action: {
              label: 'Connect Gmail',
              onClick: () => { window.location.href = '/crm/settings?tab=email'; },
            },
          });
        } else {
          toast.success('Email queued', {
            description: data?.message || 'It will send on the next queue cycle.',
          });
        }
      } else if (data?.sent_via === 'resend' || data?.sent_via === 'resend_fallback') {
        toast.success('Email sent via fallback', {
          description: data?.sent_via === 'resend_fallback'
            ? 'Sent from noreply@dealzflow.ca because Gmail send failed. Replies will still come to you.'
            : 'Sent from noreply@dealzflow.ca. Connect your Gmail in Settings → Email to send from your own address.',
          duration: 6000,
        });
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
      qc.invalidateQueries({ queryKey: ['crm-chat-thread'] });
      qc.invalidateQueries({ queryKey: ['crm-chat-thread-messages'] });
      qc.invalidateQueries({ queryKey: ['crm-recent-activity'] });
      qc.invalidateQueries({ queryKey: ['cmd-activity-feed'] });
      qc.invalidateQueries({ queryKey: ['crm-kpi-cards'] });
      qc.invalidateQueries({ queryKey: ['command-center-stats'] });
    },
    onError: (err: Error) => {
      const msg = err.message || 'Send failed';
      if (/gmail.*expired|reconnect/i.test(msg)) {
        toast.error('Gmail reconnect needed', {
          description: msg,
          duration: 10000,
          action: {
            label: 'Reconnect',
            onClick: () => { window.location.href = '/crm/settings?tab=email'; },
          },
        });
      } else {
        toast.error(msg);
      }
    },
  });
}
