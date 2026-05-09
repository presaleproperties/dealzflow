import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface SchedulerEventType {
  id: string;
  agent_user_id: string;
  slug: string;
  title: string;
  description: string | null;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_min: number;
  max_advance_days: number;
  location_type: 'phone' | 'video' | 'in_person' | 'custom';
  location_value: string | null;
  project_slug: string | null;
  creates_showing: boolean;
  requires_payment: boolean;
  price_cents: number;
  currency: string;
  custom_questions: Array<{ key: string; text: string; required?: boolean; type?: 'text' | 'textarea' }>;
  color: string | null;
  is_active: boolean;
  is_template: boolean;
  sort_order: number;
}

export function useSchedulerEventTypes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['scheduler_event_types', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('crm_scheduler_event_types' as any)
        .select('*')
        .eq('agent_user_id', user.id)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as SchedulerEventType[];
    },
    enabled: !!user,
  });
}

export function useUpdateEventType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SchedulerEventType> }) => {
      const { error } = await supabase
        .from('crm_scheduler_event_types' as any)
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler_event_types'] }),
  });
}

export function useCreateEventType() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<SchedulerEventType>) => {
      if (!user) throw new Error('not_authed');
      const { data, error } = await supabase
        .from('crm_scheduler_event_types' as any)
        .insert({ ...payload, agent_user_id: user.id })
        .select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler_event_types'] }),
  });
}

export function useDeleteEventType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_scheduler_event_types' as any)
        .delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler_event_types'] }),
  });
}

export interface SchedulerBooking {
  id: string;
  agent_user_id: string;
  event_type_id: string;
  contact_id: string | null;
  invitee_first_name: string;
  invitee_last_name: string;
  invitee_email: string | null;
  invitee_phone: string | null;
  invitee_timezone: string;
  start_at: string;
  end_at: string;
  duration_min: number;
  status: 'confirmed' | 'cancelled' | 'rescheduled' | 'completed' | 'no_show';
  cancellation_reason: string | null;
  location_type: string;
  location_value: string | null;
  meeting_link: string | null;
  notes_for_agent: string | null;
  payment_status: string | null;
  payment_amount_cents: number;
  utm: Record<string, any>;
  created_at: string;
}

export function useSchedulerBookings(filter: 'upcoming' | 'past' | 'cancelled' = 'upcoming') {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['scheduler_bookings', user?.id, filter],
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from('crm_scheduler_bookings' as any)
        .select('*')
        .eq('agent_user_id', user.id);
      const nowIso = new Date().toISOString();
      if (filter === 'upcoming') {
        q = q.gte('start_at', nowIso).neq('status', 'cancelled').order('start_at', { ascending: true });
      } else if (filter === 'past') {
        q = q.lt('start_at', nowIso).neq('status', 'cancelled').order('start_at', { ascending: false }).limit(100);
      } else {
        q = q.eq('status', 'cancelled').order('start_at', { ascending: false }).limit(100);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as SchedulerBooking[];
    },
    enabled: !!user,
  });
}

export interface AvailabilityWindow {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export function useAvailability() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['scheduler_availability', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('crm_scheduler_availability' as any)
        .select('*')
        .eq('agent_user_id', user.id)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as AvailabilityWindow[];
    },
    enabled: !!user,
  });
}

export function useReplaceAvailability() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (windows: Array<Omit<AvailabilityWindow, 'id'>>) => {
      if (!user) throw new Error('not_authed');
      // Replace strategy: delete all, insert new
      await supabase.from('crm_scheduler_availability' as any)
        .delete().eq('agent_user_id', user.id);
      if (windows.length) {
        const { error } = await supabase.from('crm_scheduler_availability' as any)
          .insert(windows.map(w => ({ ...w, agent_user_id: user.id })));
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduler_availability'] }),
  });
}

export interface AgentSchedulerProfile {
  user_id: string;
  slug: string | null;
  display_name: string | null;
  email: string | null;
  headshot_url: string | null;
  headshot_focal_y: number | null;
  brokerage: string | null;
  license_no: string | null;
  title: string | null;
  timezone: string | null;
  bio: string | null;
  scheduler_onboarded_at: string | null;
  default_buffer_min: number;
  default_min_notice_min: number;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  quiet_hours_tz: string | null;
}

export function useAgentSchedulerProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['scheduler_agent_profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('crm_team' as any)
        .select('user_id, slug, display_name, email, headshot_url, headshot_focal_y, brokerage, license_no, title, timezone, bio, scheduler_onboarded_at, default_buffer_min, default_min_notice_min, quiet_hours_start, quiet_hours_end, quiet_hours_tz')
        .eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      return (data || null) as unknown as AgentSchedulerProfile | null;
    },
    enabled: !!user,
  });
}

export function useUpdateAgentSchedulerProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AgentSchedulerProfile>) => {
      if (!user) throw new Error('not_authed');
      const { error } = await supabase
        .from('crm_team' as any)
        .update(patch).eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduler_agent_profile'] });
      qc.invalidateQueries({ queryKey: ['scheduler_event_types'] });
    },
  });
}
