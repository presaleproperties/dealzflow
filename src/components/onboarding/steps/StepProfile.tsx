import { useEffect, useState } from 'react';
import { StepShell } from '../StepShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { usePresaleAgent } from '@/stores/usePresaleAgent';
import { toast } from 'sonner';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onNext: () => void;
}

/** Normalise to a loose E.164-ish format. Keeps + and digits only,
 * adds a leading + when 10–15 digits and missing one. */
function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits;
  // Default North American 10-digit numbers to +1
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^\d{11,15}$/.test(digits)) return `+${digits}`;
  return digits; // let server validate edge cases
}

/**
 * Identity step. Pre-fills from Presale identity sync (headshot, license, brokerage)
 * and Google sign-in metadata so most agents only have to confirm.
 */
export function StepProfile({ eyebrow, onBack, onNext }: Props) {
  const { data: profile } = useProfile();
  const { user } = useAuth();
  const update = useUpdateProfile();
  const { agent } = usePresaleAgent();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [brokerage, setBrokerage] = useState('Real Broker');

  useEffect(() => {
    if (!profile) return;
    const metaName = (user?.user_metadata as any)?.full_name as string | undefined;
    setFullName(profile.full_name ?? agent?.name ?? metaName ?? '');
    setPhone(profile.phone ?? agent?.phone ?? '');
    setLicenseNo(profile.license_no ?? agent?.licenseNumber ?? '');
    setBrokerage(profile.brokerage ?? agent?.brokerage ?? 'Real Broker');
  }, [profile, agent, user]);

  const handleSave = async () => {
    if (!fullName.trim()) {
      toast.error('Please enter your full name');
      return;
    }
    const normalisedPhone = normalisePhone(phone);
    try {
      await update.mutateAsync({
        full_name: fullName.trim().slice(0, 100),
        phone: normalisedPhone,
        license_no: licenseNo.trim().slice(0, 50) || null,
        brokerage: brokerage.trim().slice(0, 100) || null,
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
