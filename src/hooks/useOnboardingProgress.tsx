import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useProfile, type OnboardingStepKey, type OnboardingSteps } from './useProfile';
import { useCrmAccess } from '@/contexts/CrmAccessContext';

const CORE_STEPS: OnboardingStepKey[] = [
  'welcome', 'profile', 'province', 'rezen', 'google', 'signature', 'push',
];
const CRM_STEPS: OnboardingStepKey[] = ['crm_sources', 'crm_sms', 'crm_tour'];

/**
 * Single source of truth for onboarding progress.
 * - Reads `profiles.onboarding_steps` jsonb
 * - Includes 3 extra steps when the user is an active CRM team member
 *   (CRM is invite-only — never surfaced to public/workspace agents)
 * - Exposes `markStepDone()` and `skipStep()` (skip = mark true, same effect)
 * - Exposes `markFullyComplete()` to stamp `onboarding_completed_at` and
 *   close the wizard.
 */
export function useOnboardingProgress() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { isMember: isCrmMember } = useCrmAccess();
  const qc = useQueryClient();

  const stepKeys = useMemo<OnboardingStepKey[]>(
    () => (isCrmMember ? [...CORE_STEPS, ...CRM_STEPS] : CORE_STEPS),
    [isCrmMember],
  );

  const steps: OnboardingSteps = useMemo(
    () => (profile?.onboarding_steps ?? {}) as OnboardingSteps,
    [profile?.onboarding_steps],
  );

  const completedCount = useMemo(
    () => stepKeys.filter((k) => steps[k] === true).length,
    [stepKeys, steps],
  );

  const totalCount = stepKeys.length;
  const percent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const isComplete = !!profile?.onboarding_completed_at || completedCount === totalCount;

  const writeSteps = useMutation({
    mutationFn: async (next: OnboardingSteps) => {
      if (!user) throw new Error('Not signed in');
      const patch: Record<string, unknown> = { onboarding_steps: next };
      // Stamp started_at on first write
      if (!profile?.onboarding_started_at) patch.onboarding_started_at = new Date().toISOString();
      const { error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-me'] }),
  });

  const markStepDone = useCallback(
    (key: OnboardingStepKey) => {
      const next: OnboardingSteps = { ...steps, [key]: true };
      writeSteps.mutate(next);
    },
    [steps, writeSteps],
  );

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-me'] }),
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed_at: null })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-me'] }),
  });

  return {
    isLoading,
    steps,
    stepKeys,
    completedCount,
    totalCount,
    percent,
    isComplete,
    isCrmMember,
    markStepDone,
    markFullyComplete: () => completeMutation.mutateAsync(),
    reopenWizard: () => reopenMutation.mutateAsync(),
  };
}
