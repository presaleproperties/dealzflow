import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PushNotificationSetup } from './PushNotificationSetup';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PushNotificationDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Push notifications</DialogTitle>
          <DialogDescription>
            Get instant alerts on this device — even when the app is closed.
          </DialogDescription>
        </DialogHeader>
        <PushNotificationSetup />
      </DialogContent>
    </Dialog>
  );
}
