import { useEffect, useState } from 'react';
import { StepShell } from '../StepShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { usePresaleAgent } from '@/stores/usePresaleAgent';
import { toast } from 'sonner';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onNext: () => void;
}

/**
 * Identity step. Pre-fills from Presale identity sync (headshot, license, brokerage)
 * so most agents only have to confirm.
 */
export function StepProfile({ eyebrow, onBack, onNext }: Props) {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const presale = usePresaleAgent();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [brokerage, setBrokerage] = useState('Real Broker');

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? presale?.displayName ?? '');
    setPhone(profile.phone ?? '');
    setLicenseNo(profile.license_no ?? presale?.licenseNo ?? '');
    setBrokerage(profile.brokerage ?? presale?.brokerage ?? 'Real Broker');
  }, [profile, presale]);

  const handleSave = async () => {
    if (!fullName.trim()) {
      toast.error('Please enter your full name');
      return;
    }
    try {
      await update.mutateAsync({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        license_no: licenseNo.trim() || null,
        brokerage: brokerage.trim() || null,
      });
      onNext();
    } catch {
      /* useUpdateProfile already toasts */
    }
  };

  return (
    <StepShell
      eyebrow={eyebrow}
      title="Tell us about you"
      subtitle="We've pre-filled what we can from your Presale Properties profile. Confirm or edit."
      primaryLabel="Continue"
      primaryLoading={update.isPending}
      onBack={onBack}
      onPrimary={handleSave}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ob-name">Full name</Label>
          <Input id="ob-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11" placeholder="Jane Doe" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-phone">Mobile phone</Label>
          <Input id="ob-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" placeholder="+1 604 555 0123" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ob-license">License #</Label>
            <Input id="ob-license" value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} className="h-11" placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-brokerage">Brokerage</Label>
            <Input id="ob-brokerage" value={brokerage} onChange={(e) => setBrokerage(e.target.value)} className="h-11" />
          </div>
        </div>
      </div>
    </StepShell>
  );
}
