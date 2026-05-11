import { useEffect, useState } from 'react';
import { StepShell } from '../StepShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'react-router-dom';
import { ExternalLink, MessageSquare, Mail, Check, PhoneCall, PhoneOutgoing } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

type Mode = 'unset' | 'have' | 'need';

const REQUEST_KEY = 'ob-sms-requested-at';
const HAVE_KEY = 'ob-sms-have-number';
const AREA_KEY = 'ob-sms-area-code';

function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^\d{11,15}$/.test(digits)) return `+${digits}`;
  return digits;
}

export function StepCrmSms({ eyebrow, onBack, onNext, onSkip }: Props) {
  const { data: profile } = useProfile();

  const [mode, setMode] = useState<Mode>('unset');
  const [haveNumber, setHaveNumber] = useState('');
  const [areaCode, setAreaCode] = useState('');
  const [requestedAt, setRequestedAt] = useState<string | null>(null);

  // Hydrate from local persistence
  useEffect(() => {
    try {
      const have = localStorage.getItem(HAVE_KEY);
      const requested = localStorage.getItem(REQUEST_KEY);
      const area = localStorage.getItem(AREA_KEY);
      if (have) {
        setHaveNumber(have);
        setMode('have');
      } else if (requested) {
        setRequestedAt(requested);
        setMode('need');
      }
      if (area) setAreaCode(area);
    } catch { /* ignore */ }
  }, []);

  const confirmHaveNumber = () => {
    const normalised = normalisePhone(haveNumber);
    if (!normalised || normalised.replace(/\D/g, '').length < 10) {
      toast.error('Enter a full phone number with area code');
      return;
    }
    try { localStorage.setItem(HAVE_KEY, normalised); } catch { /* ignore */ }
    setHaveNumber(normalised);
    toast.success(`Confirmed ${normalised} — admin will link it to your account`);
  };

  const sendRequest = () => {
    const subject = encodeURIComponent('SMS number request — please provision a Twilio line');
    const areaLine = areaCode.trim() ? `Preferred area code: ${areaCode.trim()}` : 'Preferred area code: (no preference)';
    const body = encodeURIComponent(
      `Hi admin,\n\nI'm setting up dealzflow and need a Twilio number assigned to my account.\n\n` +
      `Name: ${profile?.full_name ?? '(set in profile step)'}\n` +
      `Phone on file: ${profile?.phone ?? '(none)'}\n` +
      `${areaLine}\n\nThanks!`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    const now = new Date().toISOString();
    try {
      localStorage.setItem(REQUEST_KEY, now);
      if (areaCode.trim()) localStorage.setItem(AREA_KEY, areaCode.trim());
    } catch { /* ignore */ }
    setRequestedAt(now);
    toast.success('Email drafted — send it to your team admin');
  };

  return (
    <StepShell
      eyebrow={eyebrow}
      title="SMS / WhatsApp number"
      subtitle="The team uses Twilio to text leads. Tell us whether you've already got a number or need one provisioned."
      primaryLabel="Continue"
      onBack={onBack}
      onSkip={onSkip}
      skipLabel="Skip"
      onPrimary={onNext}
    >
      <div className="space-y-3">
        {/* Mode chooser */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('have')}
            className={cn(
              'p-3.5 rounded-xl border text-left transition-all',
              mode === 'have'
                ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]'
                : 'border-border/60 bg-card/50 hover:border-foreground/30',
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <PhoneCall className={cn('w-3.5 h-3.5', mode === 'have' ? 'text-primary' : 'text-muted-foreground')} />
              <p className={cn('text-xs font-semibold', mode === 'have' ? 'text-primary' : 'text-foreground')}>
                I have a number
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Confirm an existing Twilio line you already use.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMode('need')}
            className={cn(
              'p-3.5 rounded-xl border text-left transition-all',
              mode === 'need'
                ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]'
                : 'border-border/60 bg-card/50 hover:border-foreground/30',
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <PhoneOutgoing className={cn('w-3.5 h-3.5', mode === 'need' ? 'text-primary' : 'text-muted-foreground')} />
              <p className={cn('text-xs font-semibold', mode === 'need' ? 'text-primary' : 'text-foreground')}>
                I need one provisioned
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Ask your admin to assign a Twilio number.
            </p>
          </button>
        </div>

        {/* Mode: confirm existing number */}
        {mode === 'have' && (
          <div className="p-4 rounded-xl border border-border/60 bg-card/50 space-y-3">
            <div>
              <Label htmlFor="ob-sms-num" className="text-xs">Your SMS number</Label>
              <Input
                id="ob-sms-num"
                inputMode="tel"
                placeholder="+1 604 555 0123"
                value={haveNumber}
                onChange={(e) => setHaveNumber(e.target.value)}
                className="mt-1.5 h-11 font-mono text-sm"
                maxLength={20}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                We'll save it locally and your admin will link it to your account in the SMS Center.
              </p>
            </div>
            <Button onClick={confirmHaveNumber} variant="outline" className="w-full h-11">
              <Check className="w-3.5 h-3.5 mr-1.5" />
              Confirm number
            </Button>
          </div>
        )}

        {/* Mode: request a new one */}
        {mode === 'need' && (
          <div className="p-4 rounded-xl border border-border/60 bg-card/50 space-y-3">
            <div>
              <Label htmlFor="ob-area" className="text-xs">Preferred area code (optional)</Label>
              <Input
                id="ob-area"
                inputMode="numeric"
                placeholder="e.g. 604, 778"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                className="mt-1.5 h-11 w-32 font-mono text-sm"
                maxLength={4}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Local area codes feel more familiar to leads. Admin will match if available.
              </p>
            </div>
            {requestedAt && (
              <div className="text-[11px] text-success flex items-center gap-1.5">
                <Check className="w-3 h-3" />
                Request drafted {new Date(requestedAt).toLocaleDateString()}
              </div>
            )}
            <Button onClick={sendRequest} variant="outline" className="w-full h-11">
              <Mail className="w-3.5 h-3.5 mr-1.5" />
              {requestedAt ? 'Resend request to admin' : 'Email my admin'}
            </Button>
          </div>
        )}

        {/* How SMS works — collapsed when a mode is picked */}
        <details className="group">
          <summary className="cursor-pointer list-none p-3 rounded-xl border border-border/60 bg-card/30 text-xs font-semibold text-foreground flex items-center justify-between">
            <span className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
              How SMS works on the team
            </span>
            <span className="text-muted-foreground text-[10px] uppercase tracking-wider group-open:hidden">Show</span>
            <span className="text-muted-foreground text-[10px] uppercase tracking-wider hidden group-open:inline">Hide</span>
          </summary>
          <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed list-disc list-inside p-4 pt-3">
            <li>Send single texts from any lead's profile</li>
            <li>Bulk-send from the Leads table (50+ requires admin confirmation)</li>
            <li>STOP / HELP, opt-outs, and quiet hours handled automatically</li>
            <li>MMS attachments supported — drag images into the composer</li>
          </ul>
        </details>

        <Link
          to="/crm/chats"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        >
          Open Chats
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </StepShell>
  );
}
