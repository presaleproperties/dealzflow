import { StepShell } from '../StepShell';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ExternalLink, MessageSquare } from 'lucide-react';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

export function StepCrmSms({ eyebrow, onBack, onNext, onSkip }: Props) {
  return (
    <StepShell
      eyebrow={eyebrow}
      title="SMS / WhatsApp number"
      subtitle="The team uses Twilio to send and receive text messages from leads. Your admin will provision a number for you and link it to your account."
      primaryLabel="Got it"
      onBack={onBack}
      onSkip={onSkip}
      skipLabel="Skip"
      onPrimary={onNext}
    >
      <div className="space-y-3">
        <div className="p-4 rounded-xl border border-border/60 bg-card/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <p className="text-sm font-semibold">How SMS works on the team</p>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed list-disc list-inside">
            <li>Send single texts from any lead's profile</li>
            <li>Bulk-send from the Leads table (50+ requires admin confirmation)</li>
            <li>STOP / HELP, opt-outs, and quiet hours handled automatically</li>
            <li>MMS attachments supported — drag images into the composer</li>
          </ul>
        </div>
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          <strong>Action required:</strong> ask your admin to assign you a Twilio number. Until then, SMS will fall back to the team's main line.
        </div>
        <Button asChild variant="outline" className="w-full h-11">
          <Link to="/crm/sms">
            Open SMS Center
            <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
          </Link>
        </Button>
      </div>
    </StepShell>
  );
}
