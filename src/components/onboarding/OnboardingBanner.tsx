import { Link } from 'react-router-dom';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';
import { useProfile } from '@/hooks/useProfile';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

/**
 * Persistent gold banner shown at top of the dashboard until onboarding
 * is fully complete. Dismissable per-session (sessionStorage), but it
 * comes back next visit until the wizard is finished.
 */
export function OnboardingBanner() {
  const { data: profile } = useProfile();
  const { percent, isComplete, reopenWizard } = useOnboardingProgress();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('ob-banner-dismissed') === '1') setHidden(true);
  }, []);

  if (!profile || profile.workspace_status !== 'approved') return null;
  if (isComplete) return null;
  if (hidden) return null;

  const handleResume = async () => {
    try {
      await reopenWizard();
    } catch {
      /* no-op */
    }
  };

  return (
    <div className={cn(
      'mx-3 sm:mx-4 lg:mx-6 mt-3 mb-1 rounded-xl border border-primary/30 bg-primary/10',
      'flex items-center gap-3 px-3.5 py-2.5'
    )}>
      <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          Finish setting up your workspace
          <span className="ml-2 text-xs font-normal text-muted-foreground">{percent}% complete</span>
        </p>
        <p className="text-xs text-muted-foreground hidden sm:block">
          Pick up where you left off or read the full guide.
        </p>
      </div>
      <button
        onClick={handleResume}
        className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 shrink-0"
      >
        Resume <ArrowRight className="w-3 h-3" />
      </button>
      <Link
        to="/help/onboarding"
        className="text-xs text-muted-foreground hover:text-foreground hidden sm:inline shrink-0"
      >
        Read guide
      </Link>
      <button
        onClick={() => { setHidden(true); sessionStorage.setItem('ob-banner-dismissed', '1'); }}
        className="text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
