import { useState } from 'react';
import { StepShell } from '../StepShell';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ExternalLink, MessageSquare, Mail, Check } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { toast } from 'sonner';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

const STORAGE_KEY = 'ob-sms-requested-at';

export function StepCrmSms({ eyebrow, onBack, onNext, onSkip }: Props) {
  const { data: profile } = useProfile();
  const [requested, setRequested] = useState<boolean>(() => {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
  });

  const handleRequest = () => {
    const subject = encodeURIComponent('SMS number request — please provision a Twilio line');
    const body = encodeURIComponent(
      `Hi admin,\n\nI'm setting up dealzflow and need a Twilio number assigned to my account.\n\nName: ${profile?.full_name ?? '(set in profile step)'}\nPhone on file: ${profile?.phone ?? '(none)'}\n\nThanks!`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setRequested(true);
    toast.success('Email drafted — send it to your team admin');
  };

  return (
    <StepShell
      eyebrow={eyebrow}
      title="SMS / WhatsApp number"
      subtitle="The team uses Twilio to text leads. Your admin provisions a number and links it to your account."
      primaryLabel="Continue"
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

        {requested ? (
          <div className="p-3.5 rounded-xl bg-success/10 border border-success/30 text-xs text-success leading-relaxed flex items-start gap-2.5">
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Request drafted.</strong> Until your number is provisioned, SMS will fall back to the team's main line.
            </span>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            <strong>Action required:</strong> ask your admin to assign you a Twilio number. Until then, SMS will fall back to the team's main line.
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleRequest} variant="outline" className="flex-1 h-11">
            <Mail className="w-3.5 h-3.5 mr-1.5" />
            {requested ? 'Resend request' : 'Email my admin'}
          </Button>
          <Button asChild variant="ghost" className="flex-1 h-11 text-muted-foreground">
            <Link to="/crm/sms">
              Open SMS Center
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      </div>
    </StepShell>
  );
}
