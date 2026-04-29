import { useEffect, useState } from 'react';
import { StepShell } from '../StepShell';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useSettings, useUpdateSettings } from '@/hooks/useSettings';
import { PROVINCES, PROVINCE_NAMES, Province } from '@/lib/taxCalculator';
import { cn } from '@/lib/utils';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onNext: () => void;
}

export function StepProvince({ eyebrow, onBack, onNext }: Props) {
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();
  const updateProfile = useUpdateProfile();
  const updateSettings = useUpdateSettings();

  const [province, setProvince] = useState<Province>('BC');

  useEffect(() => {
    const fromProfile = profile?.province as Province | undefined;
    const fromSettings = (settings as any)?.province as Province | undefined;
    if (fromProfile && PROVINCES.includes(fromProfile)) setProvince(fromProfile);
    else if (fromSettings && PROVINCES.includes(fromSettings)) setProvince(fromSettings);
  }, [profile, settings]);

  const handleSave = async () => {
    try {
      await Promise.all([
        updateProfile.mutateAsync({ province }),
        updateSettings.mutateAsync({ province, country: 'CA' } as any),
      ]);
    } catch {
      /* non-fatal */
    }
    onNext();
  };

  return (
    <StepShell
      eyebrow={eyebrow}
      title="Where do you work?"
      subtitle="Sets your tax brackets, GST handling, and Safe-to-Spend math."
      primaryLabel="Continue"
      primaryLoading={updateProfile.isPending || updateSettings.isPending}
      onBack={onBack}
      onPrimary={handleSave}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PROVINCES.map((p) => {
          const active = province === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setProvince(p)}
              className={cn(
                'p-3 rounded-xl border text-left transition-all',
                active
                  ? 'border-primary bg-primary/10 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]'
                  : 'border-border hover:border-foreground/30 text-foreground/80 hover:text-foreground',
              )}
            >
              <span className="text-xs font-bold tracking-wider">{p}</span>
              <span className="block text-[11px] mt-0.5 opacity-80">{PROVINCE_NAMES[p]}</span>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}
