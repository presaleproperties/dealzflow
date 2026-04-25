import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type MessagingChannel = 'sms' | 'whatsapp';

export interface SmsLogRow {
  id: string;
  user_id: string | null;
  contact_id: string | null;
  direction: 'inbound' | 'outbound';
  to_number: string;
  from_number: string | null;
  body: string;
  status: string;
  message_type: string;
  media_urls: string[];
  twilio_message_sid: string | null;
  campaign_id: string | null;
  scheduled_for: string | null;
  delivered_at: string | null;
  num_segments: number | null;
  error_code: string | null;
  error_message: string | null;
  price: number | null;
  price_unit: string | null;
  channel: MessagingChannel;
  sent_at: string;
  created_at: string;
}

export interface SmsTemplate {
  id: string;
  name: string;
  body: string;
  category: string;
  channel: MessagingChannel;
  merge_tags: string[];
  default_media_urls: string[];
  is_active: boolean;
  times_used: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsCampaign {
  id: string;
  name: string;
  body: string;
  channel: MessagingChannel;
  media_urls: string[];
  template_id: string | null;
  segment_filter: any;
  recipients_count: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  reply_count: number;
  optout_count: number;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  throttle_per_min: number;
  from_number: string | null;
  messaging_service_sid: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsOptOut {
  id: string;
  phone: string;
  contact_id: string | null;
  reason: string | null;
  source: string;
  opted_out_at: string;
  re_opted_in_at: string | null;
}

export interface SmsNumber {
  id: string;
  user_id: string | null;
  phone: string;
  label: string | null;
  is_company: boolean;
  is_active: boolean;
  channel: 'sms' | 'whatsapp' | 'both';
  twilio_sid: string | null;
}

// ============== Logs ==============

export function useContactSmsLog(contactId?: string | null) {
  return useQuery({
    queryKey: ['crm-sms-log', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_sms_log')
        .select('*')
        .eq('contact_id', contactId!)
        .order('sent_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) as SmsLogRow[];
    },
  });
}

export function useAllSmsLog(opts: { direction?: 'inbound' | 'outbound'; channel?: MessagingChannel; limit?: number } = {}) {
  return useQuery({
    queryKey: ['crm-sms-log-all', opts],
    queryFn: async () => {
      let q = supabase.from('crm_sms_log').select('*').order('sent_at', { ascending: false });
      if (opts.direction) q = q.eq('direction', opts.direction);
      if (opts.channel) q = q.eq('channel', opts.channel);
      if (opts.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) as SmsLogRow[];
    },
  });
}

// ============== Templates ==============

export function useSmsTemplates() {
  return useQuery({
    queryKey: ['crm-sms-templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_sms_templates').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) as SmsTemplate[];
    },
  });
}

export function useSaveSmsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: Partial<SmsTemplate> & { name: string; body: string }) => {
      const payload: any = {
        name: template.name,
        body: template.body,
        category: template.category || 'general',
        channel: (template as any).channel || 'sms',
        merge_tags: template.merge_tags || [],
        default_media_urls: template.default_media_urls || [],
        is_active: template.is_active ?? true,
      };
      if (template.id) {
        const { data, error } = await supabase.from('crm_sms_templates').update(payload).eq('id', template.id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('crm_sms_templates').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-sms-templates'] });
      toast.success('Template saved');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save template'),
  });
}

export function useDeleteSmsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_sms_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-sms-templates'] });
      toast.success('Template deleted');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete'),
  });
}

// ============== Send (single) ==============

export interface SendSmsArgs {
  contact_id?: string | null;
  to: string;
  body: string;
  from?: string;
  media_urls?: string[];
  campaign_id?: string;
  scheduled_for?: string;
  skip_quiet_hours?: boolean;
  ignore_optout?: boolean;
  channel?: MessagingChannel;
}

export function useSendSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SendSmsArgs) => {
      const { data, error } = await supabase.functions.invoke('send-sms', { body: args });
      if (error) throw new Error(error.message || 'Send failed');
      if (data?.error) throw new Error(data.error);
      return data;
    },
    // Optimistic insert — message bubble appears instantly while the request is in flight.
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['crm-sms-log-all'] });
      const previous = qc.getQueriesData({ queryKey: ['crm-sms-log-all'] });

      const optimistic: SmsLogRow = {
        id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        user_id: null,
        contact_id: vars.contact_id || null,
        direction: 'outbound',
        to_number: vars.to,
        from_number: vars.from || null,
        body: vars.body,
        status: vars.scheduled_for ? 'scheduled' : 'sending',
        message_type: (vars.media_urls?.length ?? 0) > 0 ? 'mms' : 'sms',
        media_urls: vars.media_urls || [],
        twilio_message_sid: null,
        campaign_id: vars.campaign_id || null,
        scheduled_for: vars.scheduled_for || null,
        delivered_at: null,
        num_segments: 1,
        error_code: null,
        error_message: null,
        price: null,
        price_unit: null,
        channel: vars.channel || 'sms',
        sent_at: vars.scheduled_for || new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      qc.setQueriesData<SmsLogRow[]>({ queryKey: ['crm-sms-log-all'] }, (old) =>
        old ? [optimistic, ...old] : [optimistic],
      );
      if (vars.contact_id) {
        qc.setQueriesData<SmsLogRow[]>({ queryKey: ['crm-sms-log', vars.contact_id] }, (old) =>
          old ? [optimistic, ...old] : [optimistic],
        );
      }
      return { previous, optimisticId: optimistic.id };
    },
    onSuccess: (data, vars) => {
      if (vars.contact_id) {
        qc.invalidateQueries({ queryKey: ['crm-sms-log', vars.contact_id] });
      }
      qc.invalidateQueries({ queryKey: ['crm-sms-log-all'] });
      qc.invalidateQueries({ queryKey: ['crm-recent-activity'] });
      if (data?.scheduled) toast.success('Text scheduled');
      else if (data?.queued) toast.success('Saved — will send once Twilio is connected');
      else toast.success('Text sent');
    },
    onError: (e: any, _vars, ctx) => {
      // Roll back optimistic update
      ctx?.previous?.forEach(([key, value]) => qc.setQueryData(key, value));
      toast.error(e?.message || 'Failed to send text');
    },
  });
}

// ============== Delete a single message OR an entire conversation ==============

export function useDeleteSmsMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_sms_log').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-sms-log-all'] });
      qc.invalidateQueries({ queryKey: ['crm-sms-log'] });
      toast.success('Message deleted');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete message'),
  });
}

export function useDeleteSmsConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ phoneLast10, channel }: { phoneLast10: string; channel: MessagingChannel }) => {
      // Match either inbound or outbound where the other party's number ends with phoneLast10
      const { data: rows, error: fetchErr } = await supabase
        .from('crm_sms_log')
        .select('id, to_number, from_number, direction, channel');
      if (fetchErr) throw fetchErr;
      const ids = (rows || [])
        .filter((r: any) => (r.channel || 'sms') === channel)
        .filter((r: any) => {
          const other = r.direction === 'inbound' ? r.from_number : r.to_number;
          return (other || '').replace(/\D/g, '').slice(-10) === phoneLast10;
        })
        .map((r: any) => r.id);
      if (ids.length === 0) return { count: 0 };
      const { error } = await supabase.from('crm_sms_log').delete().in('id', ids);
      if (error) throw error;
      return { count: ids.length };
    },
    onSuccess: ({ count }) => {
      qc.invalidateQueries({ queryKey: ['crm-sms-log-all'] });
      qc.invalidateQueries({ queryKey: ['crm-sms-log'] });
      toast.success(`Conversation deleted (${count} message${count === 1 ? '' : 's'})`);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete conversation'),
  });
}

// ============== Bulk send ==============

export interface BulkSmsArgs {
  name: string;
  body: string;
  media_urls?: string[];
  contact_ids?: string[];
  filter?: any;
  scheduled_for?: string;
  throttle_per_min?: number;
  dry_run?: boolean;
  channel?: MessagingChannel;
}

export function useBulkSendSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: BulkSmsArgs) => {
      const { data, error } = await supabase.functions.invoke('bulk-send-sms', { body: args });
      if (error) throw new Error(error.message || 'Bulk send failed');
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['crm-sms-campaigns'] });
      qc.invalidateQueries({ queryKey: ['crm-sms-log-all'] });
      if (!data?.dry_run) {
        if (data?.scheduled) toast.success(`Blast scheduled for ${data.recipient_count} recipients`);
        else toast.success(`Blast started — ${data.recipient_count} recipients`);
      }
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to start blast'),
  });
}

// ============== Campaigns ==============

export function useSmsCampaigns() {
  return useQuery({
    queryKey: ['crm-sms-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_sms_campaigns').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) as SmsCampaign[];
    },
  });
}

// ============== Opt-outs ==============

export function useSmsOptOuts() {
  return useQuery({
    queryKey: ['crm-sms-opt-outs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_sms_opt_outs').select('*').order('opted_out_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) as SmsOptOut[];
    },
  });
}

export function useIsPhoneOptedOut(phone?: string | null) {
  return useQuery({
    queryKey: ['crm-sms-optout-check', phone],
    enabled: !!phone,
    queryFn: async () => {
      const { data } = await supabase.from('crm_sms_opt_outs').select('id').eq('phone', phone!).is('re_opted_in_at', null).maybeSingle();
      return !!data;
    },
  });
}

// ============== Numbers ==============

export function useSmsNumbers() {
  return useQuery({
    queryKey: ['crm-sms-numbers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_sms_numbers').select('*').order('is_company', { ascending: false });
      if (error) throw error;
      return (data as any[]) as SmsNumber[];
    },
  });
}

// ============== Settings ==============

export function useSmsSettings() {
  return useQuery({
    queryKey: ['crm-sms-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_sms_settings').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

// ============== Variables (canonical merge tags) ==============

export const SMS_VARIABLES = [
  { tag: '{{first_name}}', label: 'First name', sample: 'Sarah' },
  { tag: '{{last_name}}', label: 'Last name', sample: 'Chen' },
  { tag: '{{full_name}}', label: 'Full name', sample: 'Sarah Chen' },
  { tag: '{{email}}', label: 'Email', sample: 'sarah@example.com' },
  { tag: '{{phone}}', label: 'Phone', sample: '+1 604-555-0100' },
  { tag: '{{city}}', label: 'City', sample: 'Vancouver' },
  { tag: '{{agent_name}}', label: 'Agent name', sample: 'Ravish' },
  { tag: '{{company}}', label: 'Company', sample: 'DealzFlow' },
];

export function renderSmsTemplate(body: string, ctx: Record<string, any>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const path = String(key).split('.');
    let v: any = ctx;
    for (const p of path) v = v?.[p];
    if (v === null || v === undefined) return '';
    return String(v);
  });
}

export function smsSegments(body: string): { count: number; chars: number; perSegment: number } {
  const chars = body.length;
  // GSM-7 basic detection (non-strict): if any char is outside basic Latin, use UCS-2 (70 chars / 67 multi)
  const isUnicode = /[^\x00-\x7F]/.test(body);
  if (chars === 0) return { count: 1, chars: 0, perSegment: isUnicode ? 70 : 160 };
  if (isUnicode) {
    if (chars <= 70) return { count: 1, chars, perSegment: 70 };
    return { count: Math.ceil(chars / 67), chars, perSegment: 67 };
  }
  if (chars <= 160) return { count: 1, chars, perSegment: 160 };
  return { count: Math.ceil(chars / 153), chars, perSegment: 153 };
}
