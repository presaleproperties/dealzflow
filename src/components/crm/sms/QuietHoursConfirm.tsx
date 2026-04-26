import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoonStar } from 'lucide-react';

/**
 * Promise-based quiet-hours confirmation.
 * Replaces window.confirm() with a compact, branded dialog.
 *
 * Default focus is on **Cancel** — sending after-hours requires an
 * explicit click on "Send anyway" so we never opt the user in by accident
 * (e.g. an absent-minded Enter press).
 */
type Resolver = (ok: boolean) => void;

let externalOpen: ((message: string) => Promise<boolean>) | null = null;

export function confirmQuietHours(message: string): Promise<boolean> {
  if (!externalOpen) {
    // Fallback if the host isn't mounted (very edge case — SSR/tests).
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${message}\n\nSend it now anyway?`) : false);
  }
  return externalOpen(message);
}

export function QuietHoursConfirmHost() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [resolver, setResolver] = useState<Resolver | null>(null);

  useEffect(() => {
    externalOpen = (msg: string) =>
      new Promise<boolean>((resolve) => {
        setMessage(msg);
        setResolver(() => resolve);
        setOpen(true);
      });
    return () => {
      externalOpen = null;
    };
  }, []);

  const close = (ok: boolean) => {
    setOpen(false);
    resolver?.(ok);
    setResolver(null);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close(false);
      }}
    >
      <AlertDialogContent className="max-w-[360px] p-5 gap-3 rounded-2xl">
        <AlertDialogHeader className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <MoonStar className="h-3.5 w-3.5" strokeWidth={2.4} />
            </span>
            <AlertDialogTitle className="text-[15px] font-semibold">Quiet hours</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
            {message || 'Quiet hours are in effect.'} Send it anyway?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-end gap-2 mt-1 sm:gap-2">
          <AlertDialogCancel
            autoFocus
            onClick={() => close(false)}
            className="mt-0 h-9 px-4 text-[13px]"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className="h-9 px-4 text-[13px] bg-amber-500 hover:bg-amber-500/90 text-white"
          >
            Send anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
