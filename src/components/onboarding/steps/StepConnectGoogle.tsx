import { StepShell } from '../StepShell';
import { Button } from '@/components/ui/button';
import { Calendar, Mail, ExternalLink, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePlatformConnections } from '@/hooks/usePlatformConnections';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

export function StepConnectGoogle({ eyebrow, onBack, onNext, onSkip }: Props) {
  const { data: connections = [] } = usePlatformConnections();
  const hasGoogle = connections.some((c) =>
    ['google_calendar', 'gmail', 'google'].includes(c.platform),
  );

  return (
    <StepShell
      eyebrow={eyebrow}
      title="Connect Google"
      subtitle="Sync your calendar so showings and deal milestones land in one place. Connect Gmail to send branded emails from your address."
      primaryLabel={hasGoogle ? 'Continue' : "I'll connect now"}
      onBack={onBack}
      onSkip={onSkip}
      skipLabel="Skip for now"
      onPrimary={onNext}
    >
      {hasGoogle ? (
        <div className="p-4 rounded-xl bg-success/10 border border-success/20 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-success/20 flex items-center justify-center">
            <Check className="w-4 h-4 text-success" />
          </div>
          <div>
            <p className="text-sm font-semibold text-success">Google is connected</p>
            <p className="text-xs text-muted-foreground">Calendar events appear on your dashboard automatically.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-border/60 bg-card/50">
              <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center mb-2.5">
                <Calendar className="w-4 h-4" />
              </div>
              <p className="text-sm font-semibold mb-1">Google Calendar</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Two-way sync of showings & meetings.</p>
            </div>
            <div className="p-4 rounded-xl border border-border/60 bg-card/50">
              <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center mb-2.5">
                <Mail className="w-4 h-4" />
              </div>
              <p className="text-sm font-semibold mb-1">Gmail</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Send from your own address with brand templates.</p>
            </div>
          </div>
          <Button
            asChild
            variant="outline"
            className="w-full h-11"
          >
            <Link to="/settings?tab=integrations">
              Open Settings → Integrations
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      )}
    </StepShell>
  );
}
