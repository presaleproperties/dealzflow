import { StepShell } from '../StepShell';
import { Button } from '@/components/ui/button';
import { Bell, Smartphone, Check } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  primaryLabel?: string;
}

export function StepInstallPush({ eyebrow, onBack, onNext, onSkip, primaryLabel = 'Continue' }: Props) {
  const push = usePushNotifications() as any;
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      // @ts-ignore - iOS
      (window.navigator as any)?.standalone === true);
  const isSubscribed = push?.isSubscribed ?? push?.subscribed ?? false;

  const handleEnablePush = async () => {
    try {
      if (typeof push?.subscribe === 'function') await push.subscribe();
      else if (typeof push?.requestPermission === 'function') await push.requestPermission();
      toast.success('Push notifications enabled');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not enable notifications');
    }
  };

  return (
    <StepShell
      eyebrow={eyebrow}
      title="Install + notifications"
      subtitle="Two quick wins — install dealzflow to your home screen and turn on push so new leads and overdue follow-ups never slip."
      primaryLabel={primaryLabel}
      onBack={onBack}
      onSkip={onSkip}
      skipLabel="Maybe later"
      onPrimary={onNext}
    >
      <div className="space-y-3">
        <div className="p-4 rounded-xl border border-border/60 bg-card/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Install to home screen</p>
              {isStandalone ? (
                <p className="text-xs text-success flex items-center gap-1 mt-0.5"><Check className="w-3 h-3" /> Installed</p>
              ) : (
                <p className="text-xs text-muted-foreground">Opens in its own window. Faster, with offline support.</p>
              )}
            </div>
          </div>
          {!isStandalone && (
            <p className="text-xs text-muted-foreground mt-1">
              <strong className="text-foreground">iPhone:</strong> Share → Add to Home Screen.<br />
              <strong className="text-foreground">Android:</strong> Browser menu → Install app.
            </p>
          )}
        </div>

        <div className="p-4 rounded-xl border border-border/60 bg-card/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Push notifications</p>
              {isSubscribed ? (
                <p className="text-xs text-success flex items-center gap-1 mt-0.5"><Check className="w-3 h-3" /> Enabled</p>
              ) : (
                <p className="text-xs text-muted-foreground">Hot leads, overdue tasks, new bookings.</p>
              )}
            </div>
            {!isSubscribed && (
              <Button size="sm" variant="outline" onClick={handleEnablePush}>
                Enable
              </Button>
            )}
          </div>
        </div>
      </div>
    </StepShell>
  );
}
