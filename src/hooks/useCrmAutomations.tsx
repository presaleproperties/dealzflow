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
  { value: 'send_email', label: 'Send Email', icon: 'Mail' },
  { value: 'send_whatsapp', label: 'Send WhatsApp', icon: 'MessageCircle' },
  { value: 'wait', label: 'Wait', icon: 'Clock' },
  { value: 'assign_agent', label: 'Assign Agent', icon: 'UserPlus' },
  { value: 'update_status', label: 'Update Status', icon: 'RefreshCw' },
  { value: 'add_tag', label: 'Add Tag', icon: 'Tag' },
  { value: 'create_task', label: 'Create Task', icon: 'CheckSquare' },
  { value: 'send_notification', label: 'Send Notification', icon: 'Bell' },
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
        const stepsWithId = payload.steps.map(s => ({ ...s, automation_id: auto.id, action_config: s.action_config as unknown as Json }));
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
          const stepsWithId = payload.steps.map(s => ({ ...s, automation_id: payload.id, action_config: s.action_config as unknown as Json }));
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
