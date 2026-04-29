import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type WorkspaceStatus = 'pending' | 'approved' | 'suspended';

export type OnboardingStepKey =
  | 'welcome'
  | 'profile'
  | 'province'
  | 'rezen'
  | 'google'
  | 'signature'
  | 'push'
  | 'crm_sources'
  | 'crm_sms'
  | 'crm_tour';

export type OnboardingSteps = Partial<Record<OnboardingStepKey, boolean>>;

export type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_position: string;
  phone: string | null;
  title: string | null;
  workspace_status: WorkspaceStatus;
  approved_at: string | null;
  denial_reason: string | null;
  requested_at: string | null;
  created_at: string;
  updated_at: string;
  // Onboarding-related
  onboarding_steps: OnboardingSteps;
  onboarding_started_at: string | null;
  onboarding_completed_at: string | null;
  license_no: string | null;
  brokerage: string | null;
  province: string | null;
  must_change_password: boolean;
};

const PROFILE_COLUMNS =
  'id, user_id, full_name, avatar_url, avatar_position, phone, title, workspace_status, approved_at, denial_reason, requested_at, created_at, updated_at, onboarding_steps, onboarding_started_at, onboarding_completed_at, license_no, brokerage, province, must_change_password';

export function useProfile() {
  return useQuery({
    queryKey: ['profile-me'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (error) throw error;

      if (!data) {
        const { data: created, error: insertErr } = await supabase
          .from('profiles')
          .insert({ user_id: session.user.id, full_name: session.user.user_metadata?.full_name ?? null })
          .select(PROFILE_COLUMNS)
          .single();
        if (insertErr) throw insertErr;
        return created as unknown as Profile;
      }
      return data as unknown as Profile;
    },
    staleTime: 60_000,
  });
}

type UpdatableProfileFields = Partial<
  Pick<
    Profile,
    | 'full_name'
    | 'avatar_url'
    | 'avatar_position'
    | 'phone'
    | 'title'
    | 'license_no'
    | 'brokerage'
    | 'province'
  >
>;

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: UpdatableProfileFields) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', session.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-me'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
