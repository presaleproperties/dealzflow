/**
 * useEdgeSwipeBack — iOS-style edge swipe gesture.
 *
 * When the user starts a horizontal swipe from within the first ~24px of the
 * viewport's left edge and drags right past a threshold (≥80px), invokes
 * `onBack`. Touch-only; ignored when disabled or on non-touch input.
 *
 * Visual feedback is driven by writing `--edge-swipe-progress` (0–1) on the
 * provided `targetRef`, so the chat container can translate/fade as the user
 * drags. We avoid heavy state updates in onTouchMove for jank-free pulls.
 */
import { useEffect, useRef } from 'react';

interface Options {
  enabled?: boolean;
  /** Pixel range from left edge that captures the gesture. Default 24. */
  edgeWidth?: number;
  /** Drag distance (px) needed to commit the swipe. Default 80. */
  commitDistance?: number;
  /** Optional element to receive the `--edge-swipe-progress` CSS var. */
  targetRef?: React.RefObject<HTMLElement>;
}

export function useEdgeSwipeBack(onBack: () => void, opts: Options = {}) {
  const { enabled = true, edgeWidth = 24, commitDistance = 80, targetRef } = opts;
  const startX = useRef<number | null>(null);
  const startY = useRef<number>(0);
  const tracking = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const setProgress = (p: number) => {
      const el = targetRef?.current;
      if (el) el.style.setProperty('--edge-swipe-progress', String(p));
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX > edgeWidth) return;
      startX.current = t.clientX;
      startY.current = t.clientY;
      tracking.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking.current || startX.current == null) return;
      const t = e.touches[0];
      const dx = t.clientX - startX.current;
      const dy = Math.abs(t.clientY - startY.current);
      if (dy > Math.abs(dx)) {
        // vertical-dominant — abort
        tracking.current = false;
        setProgress(0);
        return;
      }
      const p = Math.max(0, Math.min(1, dx / commitDistance));
      setProgress(p);
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking.current || startX.current == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX.current;
      tracking.current = false;
      startX.current = null;
      setProgress(0);
      if (dx >= commitDistance) onBack();
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      setProgress(0);
    };
  }, [enabled, edgeWidth, commitDistance, onBack, targetRef]);
}
