/**
 * useSwipeDownToDismiss
 * ---------------------
 * Tiny touch-only gesture: a downward swipe on the bound element triggers
 * `onDismiss` once it crosses the velocity OR distance threshold. Intended for
 * mobile composer headers where we want native iOS "swipe-to-close" affordance
 * WITHOUT translating the header or the scrollable body underneath it. The
 * gesture is detection-only — the dismissal animation is handled by the
 * dialog/drawer itself.
 */
import { useCallback, useRef } from 'react';

interface Options {
  onDismiss: () => void;
  /** Minimum vertical distance (px) before we trigger. Default 56. */
  distance?: number;
  /** Minimum velocity (px/ms) that also triggers regardless of distance. Default 0.6. */
  velocity?: number;
  /** Disables the gesture entirely. */
  disabled?: boolean;
}

export function useSwipeDownToDismiss({ onDismiss, distance = 56, velocity = 0.6, disabled }: Options) {
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const startT = useRef<number>(0);
  const fired = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    const t = e.touches[0];
    startY.current = t.clientY;
    startX.current = t.clientX;
    startT.current = performance.now();
    fired.current = false;
  }, [disabled]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || fired.current || startY.current == null || startX.current == null) return;
    const t = e.touches[0];
    const dy = t.clientY - startY.current;
    const dx = Math.abs(t.clientX - startX.current);
    if (dy <= 0 || dx > Math.max(40, dy)) return; // ignore upward / mostly-horizontal
    const dt = Math.max(1, performance.now() - startT.current);
    const v = dy / dt;
    if (dy >= distance || v >= velocity) {
      fired.current = true;
      startY.current = null;
      onDismiss();
    }
  }, [disabled, distance, velocity, onDismiss]);

  const onTouchEnd = useCallback(() => {
    startY.current = null;
    startX.current = null;
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
