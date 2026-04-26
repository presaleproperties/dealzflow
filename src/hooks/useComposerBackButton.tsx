import { useEffect } from 'react';

/**
 * Mobile back-button trap for composer modals (email, SMS, WhatsApp).
 *
 * When `open` becomes true we push a synthetic history entry tagged with
 * `__composeOpen`. Pressing the OS back button fires `popstate`, which we
 * intercept to close the dialog instead of navigating away from the lead
 * detail page. When the dialog is closed via Cancel/Send (not Back), we
 * pop our synthetic entry so we don't leak history.
 */
export function useComposerBackButton(
  open: boolean,
  onClose: (open: false) => void,
) {
  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;
    window.history.pushState({ __composeOpen: true }, '');
    const handler = () => onClose(false);
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
      const state = window.history.state as { __composeOpen?: boolean } | null;
      if (state && state.__composeOpen) {
        window.history.back();
      }
    };
  }, [open, onClose]);
}
