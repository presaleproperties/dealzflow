import { StepShell } from '../StepShell';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ExternalLink, MapPin, Tag } from 'lucide-react';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

const FRASER_VALLEY_CITIES = [
  'Surrey', 'Langley', 'Abbotsford', 'Chilliwack', 'Mission',
  'Maple Ridge', 'Pitt Meadows', 'Delta', 'White Rock', 'Cloverdale',
];

export function StepCrmSources({ eyebrow, onBack, onNext, onSkip }: Props) {
  return (
    <StepShell
      eyebrow={eyebrow}
      title="Your CRM territory"
      subtitle="Tells the team CRM which leads belong to you when new ones come in from Presale, Lofty, or referrals."
      primaryLabel="Got it"
      onBack={onBack}
      onSkip={onSkip}
      skipLabel="Skip — admin will assign"
      onPrimary={onNext}
    >
      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-border/60 bg-card/50">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Coverage area</p>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            We currently route Fraser Valley cities only. Your admin assigns which of these you cover.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FRASER_VALLEY_CITIES.map((c) => (
              <span
                key={c}
                className="text-[11px] px-2 py-1 rounded-md border border-border/60 bg-background/50 text-foreground/80"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border/60 bg-card/50">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Lead sources you'll receive</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Presale Properties forms, Lofty inbound, TikTok DMs, referrals, and SMS opt-ins. Admin can reroute any
            source from <strong className="text-foreground">CRM → Settings → Lead Sources</strong>.
          </p>
        </div>

        <Button asChild variant="outline" className="w-full h-11">
          <Link to="/crm/settings">
            Open CRM Settings
            <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
          </Link>
        </Button>
      </div>
    </StepShell>
  );
}
