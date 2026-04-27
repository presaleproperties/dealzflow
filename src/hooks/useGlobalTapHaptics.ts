import { useEffect } from 'react';

/**
 * Global tap-haptic: fires a tiny 10ms vibration on every <button> click.
 * - Mobile only (skips devices without vibration API)
 * - Respects prefers-reduced-motion
 * - Skips disabled buttons
 * - Coalesces with per-component haptics (10ms is short enough to layer)
 */
export function useGlobalTapHaptics() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const onPointer = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest('button, [role="button"]') as HTMLButtonElement | null;
      if (!btn) return;
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
      try {
        navigator.vibrate(10);
      } catch {
        /* noop */
      }
    };

    // pointerup fires earlier than click and feels more native
    document.addEventListener('pointerup', onPointer, { passive: true });
    return () => document.removeEventListener('pointerup', onPointer);
  }, []);
}
