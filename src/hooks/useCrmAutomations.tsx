import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export type CrmAutomation = {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  is_active: boolean | null;
  total_enrolled: number | null;
  total_converted: number | null;
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

export const TRIGGER_TYPES = [
  { value: 'new_lead', label: 'New lead added' },
  { value: 'status_change', label: 'Lead status changes' },
  { value: 'no_response', label: 'No response for X days' },
  { value: 'tag_added', label: 'Tag added' },
  { value: 'manual', label: 'Manual enrollment' },
] as const;

export const ACTION_TYPES = [
  { value: 'send_email', label: 'Send Email', icon: 'Mail' },
  { value: 'send_whatsapp', label: 'Send WhatsApp', icon: 'MessageCircle' },
  { value: 'wait', label: 'Wait', icon: 'Clock' },
  { value: 'assign_agent', label: 'Assign Agent', icon: 'UserPlus' },
  { value: 'update_status', label: 'Update Status', icon: 'RefreshCw' },
  { value: 'add_tag', label: 'Add Tag', icon: 'Tag' },
  { value: 'create_task', label: 'Create Task', icon: 'CheckSquare' },
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

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      automation: { name: string; trigger_type: string; trigger_config: Record<string, unknown>; is_active: boolean };
      steps: { step_order: number; action_type: string; action_config: Record<string, unknown> }[];
    }) => {
      const { data: auto, error: autoErr } = await supabase
        .from('crm_automations')
        .insert(payload.automation)
        .select()
        .single();
      if (autoErr) throw autoErr;

      if (payload.steps.length > 0) {
        const stepsWithId = payload.steps.map(s => ({ ...s, automation_id: auto.id }));
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
      automation: Partial<{ name: string; trigger_type: string; trigger_config: Record<string, unknown>; is_active: boolean }>;
      steps?: { step_order: number; action_type: string; action_config: Record<string, unknown> }[];
    }) => {
      const { error: autoErr } = await supabase
        .from('crm_automations')
        .update(payload.automation)
        .eq('id', payload.id);
      if (autoErr) throw autoErr;

      if (payload.steps) {
        await supabase.from('crm_automation_steps').delete().eq('automation_id', payload.id);
        if (payload.steps.length > 0) {
          const stepsWithId = payload.steps.map(s => ({ ...s, automation_id: payload.id }));
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
