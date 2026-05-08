import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export type CrmAutomation = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  is_active: boolean | null;
  total_enrolled: number | null;
  total_converted: number | null;
  runs_count: number;
  last_run_at: string | null;
  created_at: string | null;
};

export type CrmAutomationStep = {
  id: string;
  automation_id: string;
  step_order: number;
  action_type: string;
  action_config: Record<string, unknown> | null;
  created_at: string | null;
};

export type CrmAutomationLog = {
  id: string;
  automation_id: string;
  contact_id: string | null;
  trigger_data: Record<string, unknown> | null;
  action_result: string;
  error_message: string | null;
  created_at: string;
  contact?: { first_name: string; last_name: string } | null;
};

export const TRIGGER_TYPES = [
  { value: 'new_lead', label: 'New lead added', icon: 'Zap', description: 'Fires when a new lead is created in the CRM' },
  { value: 'status_change', label: 'Lead status changes', icon: 'RefreshCw', description: 'Fires when a lead moves to a specific stage' },
  { value: 'no_response', label: 'No activity for X days', icon: 'Clock', description: 'Fires when a lead has no activity for a set period' },
  { value: 'tag_added', label: 'Tag added', icon: 'Tag', description: 'Fires when a specific tag is added to a lead' },
  { value: 'manual', label: 'Manual enrollment', icon: 'UserPlus', description: 'Manually enroll leads into this automation' },
] as const;

export const ACTION_TYPES = [
  { value: 'send_email', label: 'Send Email', icon: 'Mail', group: 'Communication' },
  { value: 'send_sms', label: 'Send SMS', icon: 'MessageSquare', group: 'Communication' },
  { value: 'wait', label: 'Wait / Delay', icon: 'Clock', group: 'Flow' },
  { value: 'branch_if', label: 'If / Then Branch', icon: 'GitBranch', group: 'Flow' },
  { value: 'assign_agent', label: 'Assign Agent', icon: 'UserPlus', group: 'CRM' },
  { value: 'update_status', label: 'Update Status', icon: 'RefreshCw', group: 'CRM' },
  { value: 'add_tag', label: 'Add Tag', icon: 'Tag', group: 'CRM' },
  { value: 'create_task', label: 'Create Task', icon: 'CheckSquare', group: 'CRM' },
  { value: 'send_notification', label: 'Notify Agent', icon: 'Bell', group: 'CRM' },
  { value: 'ai_draft_email', label: 'AI: Draft Email', icon: 'Sparkles', group: 'AI' },
  { value: 'webhook', label: 'Webhook (POST)', icon: 'Webhook', group: 'Integrations' },
] as const;

export const AUTOMATION_TEMPLATES = [
  {
    id: 'auto-assign',
    name: 'Auto-Assign New Leads',
    description: 'When a new lead is created → Automatically assign to a team member',
    trigger_type: 'new_lead',
    trigger_config: {},
    steps: [{ action_type: 'assign_agent', action_config: {} }],
    icon: 'UserPlus',
  },
  {
    id: 'cold-followup',
    name: 'Follow-Up Reminder for Cold Leads',
    description: 'When a lead has no activity for X days → Create a follow-up task',
    trigger_type: 'no_response',
    trigger_config: { days: 14 },
    steps: [{ action_type: 'create_task', action_config: { title: 'Follow up with lead' } }],
    icon: 'Clock',
  },
  {
    id: 'welcome-email',
    name: 'Welcome Email for New Leads',
    description: 'When a new lead is created → Send a welcome email template',
    trigger_type: 'new_lead',
    trigger_config: {},
    steps: [{ action_type: 'send_email', action_config: {} }],
    icon: 'Mail',
  },
  {
    id: 'stage-notify',
    name: 'Notify Agent on Stage Change',
    description: 'When a lead moves to a specific stage → Notify the assigned agent',
    trigger_type: 'status_change',
    trigger_config: {},
    steps: [{ action_type: 'send_notification', action_config: {} }],
    icon: 'Bell',
  },
  {
    id: 'auto-tag',
    name: 'Auto-Tag by Source',
    description: 'When a new lead comes in from a specific source → Add a tag',
    trigger_type: 'new_lead',
    trigger_config: {},
    steps: [{ action_type: 'add_tag', action_config: {} }],
    icon: 'Tag',
  },
  {
    id: 'stale-nurture',
    name: 'Move Stale Leads to Nurturing',
    description: 'When a lead has no activity for X days → Change their status',
    trigger_type: 'no_response',
    trigger_config: { days: 30 },
    steps: [{ action_type: 'update_status', action_config: { status: 'Nurturing' } }],
    icon: 'RefreshCw',
  },
] as const;

function deriveDelayHours(action_type: string, cfg: Record<string, unknown>): number {
  if (action_type !== 'wait') return 0;
  const amount = Number(cfg.amount ?? 0);
  const unit = String(cfg.unit ?? 'hours');
  if (unit === 'minutes') return Math.max(0, Math.round(amount / 60));
  if (unit === 'days') return Math.max(0, amount * 24);
  return Math.max(0, amount);
}

export function useCrmAutomations() {
  return useQuery({
    queryKey: ['crm-automations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_automations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmAutomation[];
    },
    staleTime: 30_000,
  });
}

export function useCrmAutomationSteps(automationId: string | null) {
  return useQuery({
    queryKey: ['crm-automation-steps', automationId],
    queryFn: async () => {
      if (!automationId) return [];
      const { data, error } = await supabase
        .from('crm_automation_steps')
        .select('*')
        .eq('automation_id', automationId)
        .order('step_order');
      if (error) throw error;
      return (data ?? []) as CrmAutomationStep[];
    },
    enabled: !!automationId,
    staleTime: 30_000,
  });
}

export function useCrmAutomationLogs(automationId: string | null) {
  return useQuery({
    queryKey: ['crm-automation-logs', automationId],
    queryFn: async () => {
      if (!automationId) return [];
      const { data, error } = await supabase
        .from('crm_automation_logs')
        .select('*')
        .eq('automation_id', automationId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      // Fetch contact names
      const contactIds = [...new Set((data ?? []).map(l => l.contact_id).filter(Boolean))] as string[];
      let contactMap: Record<string, { first_name: string; last_name: string }> = {};
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('crm_contacts')
          .select('id, first_name, last_name')
          .in('id', contactIds);
        (contacts ?? []).forEach(c => { contactMap[c.id] = c; });
      }

      return (data ?? []).map(l => ({
        ...l,
        contact: l.contact_id ? contactMap[l.contact_id] ?? null : null,
      })) as CrmAutomationLog[];
    },
    enabled: !!automationId,
  });
}

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      automation: { name: string; description?: string; trigger_type: string; trigger_config: Record<string, unknown>; is_active: boolean };
      steps: { step_order: number; action_type: string; action_config: Record<string, unknown> }[];
    }) => {
      const { data: auto, error: autoErr } = await supabase
        .from('crm_automations')
        .insert({
          ...payload.automation,
          trigger_config: payload.automation.trigger_config as unknown as Json,
        })
        .select()
        .single();
      if (autoErr) throw autoErr;

      if (payload.steps.length > 0) {
        const stepsWithId = payload.steps.map(s => ({
          ...s, automation_id: auto.id,
          action_config: s.action_config as unknown as Json,
          delay_hours: deriveDelayHours(s.action_type, s.action_config),
        }));
        const { error: stepsErr } = await supabase.from('crm_automation_steps').insert(stepsWithId);
        if (stepsErr) throw stepsErr;
      }
      return auto;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-automations'] });
      toast.success('Automation created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      automation: Partial<{ name: string; description: string; trigger_type: string; trigger_config: Record<string, unknown>; is_active: boolean }>;
      steps?: { step_order: number; action_type: string; action_config: Record<string, unknown> }[];
    }) => {
      const updateData = { ...payload.automation } as Record<string, unknown>;
      if (updateData.trigger_config) updateData.trigger_config = updateData.trigger_config as unknown as Json;
      const { error: autoErr } = await supabase
        .from('crm_automations')
        .update(updateData as { name?: string; description?: string; trigger_type?: string; trigger_config?: Json; is_active?: boolean })
        .eq('id', payload.id);
      if (autoErr) throw autoErr;

      if (payload.steps) {
        await supabase.from('crm_automation_steps').delete().eq('automation_id', payload.id);
        if (payload.steps.length > 0) {
          const stepsWithId = payload.steps.map(s => ({ ...s, automation_id: payload.id, action_config: s.action_config as unknown as Json, delay_hours: deriveDelayHours(s.action_type, s.action_config) }));
          const { error: stepsErr } = await supabase.from('crm_automation_steps').insert(stepsWithId);
          if (stepsErr) throw stepsErr;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-automations'] });
      qc.invalidateQueries({ queryKey: ['crm-automation-steps'] });
      toast.success('Automation updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useToggleAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('crm_automations').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-automations'] });
      toast.success('Automation updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('crm_automation_steps').delete().eq('automation_id', id);
      const { error } = await supabase.from('crm_automations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-automations'] });
      toast.success('Automation deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ==================== Enrollments + Run Log ====================

export type CrmAutomationEnrollment = {
  id: string;
  automation_id: string;
  contact_id: string;
  status: string;
  current_step_order: number;
  next_step_due_at: string | null;
  enrolled_at: string;
  exited_at: string | null;
  exit_reason: string | null;
  contact?: { first_name: string; last_name: string; email: string | null } | null;
};

export type CrmAutomationRunLog = {
  id: string;
  enrollment_id: string | null;
  automation_id: string;
  contact_id: string | null;
  step_order: number;
  action_type: string;
  action_result: string;
  error_message: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  contact?: { first_name: string; last_name: string } | null;
};

export function useAutomationEnrollments(automationId: string | null, status: 'active' | 'all' = 'active') {
  return useQuery({
    queryKey: ['crm-automation-enrollments', automationId, status],
    queryFn: async () => {
      if (!automationId) return [];
      let q = supabase.from('crm_automation_enrollments').select('*').eq('automation_id', automationId);
      if (status === 'active') q = q.eq('status', 'active');
      const { data, error } = await q.order('enrolled_at', { ascending: false }).limit(200);
      if (error) throw error;
      const ids = [...new Set((data ?? []).map(d => d.contact_id).filter(Boolean))] as string[];
      let map: Record<string, { first_name: string; last_name: string; email: string | null }> = {};
      if (ids.length) {
        const { data: cs } = await supabase
          .from('crm_contacts').select('id, first_name, last_name, email').in('id', ids);
        (cs ?? []).forEach(c => { map[c.id] = c; });
      }
      return (data ?? []).map(d => ({ ...d, contact: d.contact_id ? map[d.contact_id] ?? null : null })) as CrmAutomationEnrollment[];
    },
    enabled: !!automationId,
  });
}

export function useAutomationRunLog(automationId: string | null) {
  return useQuery({
    queryKey: ['crm-automation-run-log', automationId],
    queryFn: async () => {
      if (!automationId) return [];
      const { data, error } = await supabase
        .from('crm_automation_run_log')
        .select('*')
        .eq('automation_id', automationId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const ids = [...new Set((data ?? []).map(d => d.contact_id).filter(Boolean))] as string[];
      let map: Record<string, { first_name: string; last_name: string }> = {};
      if (ids.length) {
        const { data: cs } = await supabase.from('crm_contacts').select('id, first_name, last_name').in('id', ids);
        (cs ?? []).forEach(c => { map[c.id] = c; });
      }
      return (data ?? []).map(d => ({ ...d, contact: d.contact_id ? map[d.contact_id] ?? null : null })) as CrmAutomationRunLog[];
    },
    enabled: !!automationId,
  });
}

export function useEnrollContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ automationId, contactIds }: { automationId: string; contactIds: string[] }) => {
      const { data, error } = await supabase.functions.invoke('enroll-in-automation', {
        body: { automation_id: automationId, contact_ids: contactIds },
      });
      if (error) throw error;
      return data as { ok: boolean; enrolled: number; skipped: number; failed: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['crm-automation-enrollments'] });
      qc.invalidateQueries({ queryKey: ['crm-automations'] });
      const parts: string[] = [];
      if (data.enrolled) parts.push(`${data.enrolled} enrolled`);
      if (data.skipped) parts.push(`${data.skipped} already active`);
      if (data.failed) parts.push(`${data.failed} failed`);
      toast.success(parts.join(' · ') || 'Done');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUnenrollContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enrollmentIds: string[]) => {
      const { data, error } = await supabase.functions.invoke('unenroll-from-automation', {
        body: { enrollment_ids: enrollmentIds },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-automation-enrollments'] });
      toast.success('Unenrolled');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRunAutomationNow() {
  return useMutation({
    mutationFn: async (enrollmentId?: string) => {
      const { data, error } = await supabase.functions.invoke('process-automations', {
        body: enrollmentId ? { enrollment_id: enrollmentId } : { limit: 20 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: { processed?: number }) => toast.success(`Tick ran · processed ${d?.processed ?? 0}`),
    onError: (e: Error) => toast.error(e.message),
  });
}
