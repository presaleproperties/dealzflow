import { StepShell } from '../StepShell';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { Building2, Calculator, BarChart3, Users } from 'lucide-react';

interface Props {
  eyebrow: string;
  onNext: () => void;
}

export function StepWelcome({ eyebrow, onNext }: Props) {
  const { isMember: isCrmMember } = useCrmAccess();

  const benefits = [
    { icon: Calculator, text: 'Auto-calculated take-home, taxes, and Safe-to-Spend' },
    { icon: BarChart3, text: '12-month cashflow forecast from your real deals' },
    { icon: Building2, text: 'ReZen sync — deals, payouts, and revenue share in one place' },
    ...(isCrmMember
      ? [{ icon: Users, text: 'Full CRM access — leads, pipeline, calendar, SMS' }]
      : []),
  ];

  return (
    <StepShell
      eyebrow={eyebrow}
      title="Welcome to dealzflow."
      subtitle={
        isCrmMember
          ? "You've been added to the team CRM. We'll get your workspace and CRM access set up in about 10 minutes."
          : 'Built for Real Broker agents. We\'ll get your workspace ready in under 10 minutes — you can skip any step and come back later.'
      }
      primaryLabel="Let's go"
      onPrimary={onNext}
    >
      <div className="space-y-2.5">
        {benefits.map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="flex items-start gap-3 p-3.5 rounded-xl bg-muted/40 border border-border/40"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            <span className="text-sm leading-relaxed text-foreground/90 pt-1">{text}</span>
          </div>
        ))}
      </div>
    </StepShell>
  );
}
