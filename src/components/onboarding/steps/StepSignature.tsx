import { StepShell } from '../StepShell';
import { Button } from '@/components/ui/button';
import { ExternalLink, PenLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AgentSignatureBlock } from '@/components/agent/AgentSignatureBlock';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

export function StepSignature({ eyebrow, onBack, onNext, onSkip }: Props) {
  return (
    <StepShell
      eyebrow={eyebrow}
      title="Your email signature"
      subtitle="Used on every email you send through dealzflow and on Presale Properties project sends."
      primaryLabel="Continue"
      onBack={onBack}
      onSkip={onSkip}
      skipLabel="Use Presale default"
      onPrimary={onNext}
    >
      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-border/60 bg-background/40">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Live preview</p>
          <AgentSignatureBlock />
        </div>
        <div className="p-3.5 rounded-xl bg-muted/40 border border-border/40 text-sm text-muted-foreground leading-relaxed flex items-start gap-3">
          <PenLine className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <span>
            Edit your headshot, title, license number, and contact links in <strong className="text-foreground">Settings → Profile</strong>. Changes appear here instantly.
          </span>
        </div>
        <Button asChild variant="outline" className="w-full h-11">
          <Link to="/settings?tab=profile">
            Open Settings → Profile
            <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
          </Link>
        </Button>
      </div>
    </StepShell>
  );
}
