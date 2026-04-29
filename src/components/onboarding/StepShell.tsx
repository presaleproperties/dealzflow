import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';

interface StepShellProps {
  eyebrow: string;       // e.g. "Step 3 of 7"
  title: string;
  subtitle?: string;
  children: ReactNode;
  primaryLabel: string;
  onPrimary: () => void | Promise<void>;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
}

/**
 * Shared shell for every onboarding step. Keeps spacing, buttons,
 * and the editorial gold/dark theme consistent without each step
 * re-implementing layout.
 */
export function StepShell({
  eyebrow,
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  onBack,
  onSkip,
  skipLabel = 'Skip for now',
}: StepShellProps) {
  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80 font-semibold mb-2">
          {eyebrow}
        </p>
        <h2 className="text-2xl font-bold leading-tight text-foreground">{title}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{subtitle}</p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">{children}</div>

      <div className="pt-5 mt-4 border-t border-border/60 flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" onClick={onBack} className="h-11">
            Back
          </Button>
        )}
        <div className="flex-1" />
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} className="h-11 text-muted-foreground">
            {skipLabel}
          </Button>
        )}
        <Button
          onClick={onPrimary}
          disabled={primaryDisabled || primaryLoading}
          className="h-11 bg-primary text-primary-foreground hover:bg-primary/90 border border-primary/40 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.55)]"
        >
          {primaryLoading ? 'Saving…' : primaryLabel}
          {!primaryLoading && <ChevronRight className="w-4 h-4 ml-1.5" />}
        </Button>
      </div>
    </div>
  );
}
