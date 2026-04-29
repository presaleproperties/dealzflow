import { useEffect, useState } from 'react';
import { StepShell } from '../StepShell';
import { Link } from 'react-router-dom';
import { ExternalLink, MapPin, Tag, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

const STORAGE_KEY = 'ob-coverage-cities';

export function StepCrmSources({ eyebrow, onBack, onNext, onSkip }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSelected(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);

  const toggle = (city: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(city) ? next.delete(city) : next.add(city);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const handleContinue = () => {
    if (selected.size > 0) {
      toast.success(`Saved ${selected.size} ${selected.size === 1 ? 'city' : 'cities'} — admin will confirm your routing`);
    }
    onNext();
  };

  return (
    <StepShell
      eyebrow={eyebrow}
      title="Your CRM territory"
      subtitle="Tap the cities you cover. Your admin uses this to route incoming leads to you. You can always change this later."
      primaryLabel={selected.size > 0 ? `Save ${selected.size} ${selected.size === 1 ? 'city' : 'cities'}` : 'Continue'}
      onBack={onBack}
      onSkip={onSkip}
      skipLabel="Skip — admin will assign"
      onPrimary={handleContinue}
    >
      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-border/60 bg-card/50">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Cities you cover</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FRASER_VALLEY_CITIES.map((c) => {
              const active = selected.has(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggle(c)}
                  className={cn(
                    'inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-md border transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border/60 bg-background/50 text-foreground/80 hover:border-foreground/30'
                  )}
                >
                  {active && <Check className="w-3 h-3" />}
                  {c}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Fraser Valley only. Other regions are routed manually.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/60 bg-card/50">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Where leads come from</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Presale Properties forms, Lofty inbound, TikTok DMs, referrals, and SMS opt-ins.
            Your admin can reroute any source from <strong className="text-foreground">CRM → Settings → Lead Sources</strong>.
          </p>
        </div>

        <Link
          to="/crm/settings"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        >
          Open CRM Settings
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </StepShell>
  );
}
