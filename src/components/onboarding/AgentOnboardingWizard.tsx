import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { Sparkles, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { OnboardingStepKey } from '@/hooks/useProfile';

const SNOOZE_KEY = 'ob-wizard-snoozed-at';
const SNOOZE_MS = 1000 * 60 * 60 * 4; // 4 hours

import { StepWelcome } from './steps/StepWelcome';
import { StepProfile } from './steps/StepProfile';
import { StepProvince } from './steps/StepProvince';
import { StepConnectReZen } from './steps/StepConnectReZen';
import { StepConnectGoogle } from './steps/StepConnectGoogle';
import { StepSignature } from './steps/StepSignature';
import { StepInstallPush } from './steps/StepInstallPush';
import { StepCrmSources } from './steps/StepCrmSources';
import { StepCrmSms } from './steps/StepCrmSms';
import { StepCrmTour } from './steps/StepCrmTour';

const STEP_LABELS: Record<OnboardingStepKey, string> = {
  welcome: 'Welcome',
  profile: 'Your profile',
  province: 'Province & tax',
  rezen: 'Connect ReZen',
  google: 'Connect Google',
  signature: 'Email signature',
  push: 'Install + push',
  crm_sources: 'CRM territory',
  crm_sms: 'SMS number',
  crm_tour: 'CRM tour',
};

/**
 * AgentOnboardingWizard — single source of truth for new-agent onboarding.
 * - Auto-shows for any approved user with `onboarding_completed_at = null`
 * - Always-skippable; closing it leaves a persistent banner via the OnboardingBanner
 * - Reveals 3 extra CRM steps when the user is an active crm_team member
 */
export function AgentOnboardingWizard() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { stepKeys, steps, percent, markStepDone, markFullyComplete, isComplete } =
    useOnboardingProgress();

  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  // Open automatically when the user is signed in, approved, and not yet done
  // — but respect a 4-hour snooze when they closed it themselves.
  useEffect(() => {
    if (!user || profileLoading || !profile) return;
    if (profile.workspace_status !== 'approved') return;
    if (isComplete) return;
    try {
      const snoozedAt = Number(sessionStorage.getItem(SNOOZE_KEY) || 0);
      if (snoozedAt && Date.now() - snoozedAt < SNOOZE_MS) return;
    } catch { /* ignore */ }
    setOpen(true);
  }, [user, profile, profileLoading, isComplete]);

  // Jump to first incomplete step on open
  useEffect(() => {
    if (!open) return;
    const firstIncomplete = stepKeys.findIndex((k) => steps[k] !== true);
    setActiveIdx(firstIncomplete === -1 ? stepKeys.length - 1 : firstIncomplete);
  }, [open, stepKeys, steps]);

  const activeKey = stepKeys[activeIdx];
  const total = stepKeys.length;
  const eyebrow = useMemo(() => `Step ${activeIdx + 1} of ${total}`, [activeIdx, total]);

  const goNext = () => {
    if (activeKey) markStepDone(activeKey);
    if (activeIdx < total - 1) setActiveIdx((i) => i + 1);
  };
  const goBack = () => setActiveIdx((i) => Math.max(0, i - 1));
  const skipStep = () => {
    if (activeIdx < total - 1) setActiveIdx((i) => i + 1);
  };

  const finishWizard = async () => {
    if (activeKey) markStepDone(activeKey);
    try {
      await markFullyComplete();
      toast.success('You\'re all set 🎉');
    } catch {
      /* non-fatal */
    }
    setOpen(false);
  };

  const closeForLater = () => {
    try { sessionStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* ignore */ }
    toast.message('Saved your progress', {
      description: 'Resume anytime from the gold banner on your dashboard.',
    });
    setOpen(false);
  };

  if (!open || !activeKey) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeForLater()}>
      <DialogContent className="max-w-3xl p-0 [&>button]:hidden flex flex-col lg:flex-row max-h-[92dvh] overflow-hidden gap-0">
        <DialogTitle className="sr-only">Agent onboarding — {STEP_LABELS[activeKey]}</DialogTitle>
        <DialogDescription className="sr-only">
          Step {activeIdx + 1} of {total}. {percent}% complete. Set up your account in a few quick steps. You can resume later from the dashboard banner.
        </DialogDescription>
        {/* Mobile close affordance — sidebar provides it on desktop */}
        <button
          type="button"
          onClick={closeForLater}
          aria-label="Close and resume later"
          className="lg:hidden absolute top-2.5 right-2.5 z-10 w-9 h-9 rounded-full bg-background/80 backdrop-blur border border-border/60 text-muted-foreground hover:text-foreground flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
        {/* Stepper sidebar (desktop) */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-border/60 bg-muted/30 p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                Onboarding
              </p>
              <p className="text-sm font-bold text-foreground">{percent}% complete</p>
            </div>
          </div>
          <div className="h-1 rounded-full bg-border/60 overflow-hidden mb-4">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <ol className="space-y-1 flex-1">
            {stepKeys.map((k, i) => {
              const done = steps[k] === true;
              const active = i === activeIdx;
              return (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-colors',
                      active
                        ? 'bg-primary/15 text-primary font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
                    )}
                  >
                    <span
                      className={cn(
                        'w-5 h-5 rounded-full border flex items-center justify-center text-[10px] shrink-0',
                        done
                          ? 'bg-primary border-primary text-primary-foreground'
                          : active
                          ? 'border-primary text-primary'
                          : 'border-border text-muted-foreground',
                      )}
                    >
                      {done ? <Check className="w-3 h-3" /> : i + 1}
                    </span>
                    <span className="truncate">{STEP_LABELS[k]}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <Button variant="ghost" size="sm" onClick={closeForLater} className="mt-4 text-xs text-muted-foreground">
            Resume later
          </Button>
        </aside>

        {/* Mobile progress bar + step pill */}
        <div className="lg:hidden shrink-0">
          <div className="h-1 bg-border/60">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="px-5 pt-3 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
              {STEP_LABELS[activeKey]}
            </p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {activeIdx + 1} / {total} · {percent}%
            </p>
          </div>
        </div>

        {/* Active step */}
        <div className="flex-1 min-h-0 p-5 sm:p-7 flex flex-col">
          {activeKey === 'welcome' && <StepWelcome eyebrow={eyebrow} onNext={goNext} />}
          {activeKey === 'profile' && <StepProfile eyebrow={eyebrow} onBack={goBack} onNext={goNext} />}
          {activeKey === 'province' && <StepProvince eyebrow={eyebrow} onBack={goBack} onNext={goNext} />}
          {activeKey === 'rezen' && (
            <StepConnectReZen eyebrow={eyebrow} onBack={goBack} onNext={goNext} onSkip={skipStep} />
          )}
          {activeKey === 'google' && (
            <StepConnectGoogle eyebrow={eyebrow} onBack={goBack} onNext={goNext} onSkip={skipStep} />
          )}
          {activeKey === 'signature' && (
            <StepSignature eyebrow={eyebrow} onBack={goBack} onNext={goNext} onSkip={skipStep} />
          )}
          {activeKey === 'push' && (
            <StepInstallPush
              eyebrow={eyebrow}
              onBack={goBack}
              onNext={activeIdx === total - 1 ? finishWizard : goNext}
              onSkip={activeIdx === total - 1 ? finishWizard : skipStep}
              primaryLabel={activeIdx === total - 1 ? 'Finish' : 'Continue'}
            />
          )}
          {activeKey === 'crm_sources' && (
            <StepCrmSources eyebrow={eyebrow} onBack={goBack} onNext={goNext} onSkip={skipStep} />
          )}
          {activeKey === 'crm_sms' && (
            <StepCrmSms eyebrow={eyebrow} onBack={goBack} onNext={goNext} onSkip={skipStep} />
          )}
          {activeKey === 'crm_tour' && (
            <StepCrmTour eyebrow={eyebrow} onBack={goBack} onFinish={finishWizard} finishLabel="Finish" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
