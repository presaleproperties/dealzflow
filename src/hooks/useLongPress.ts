import { useCallback, useRef } from 'react';

/**
 * S13 — Long-press hook for mobile action sheets.
 * Fires `onLongPress` after `delay` ms of sustained press, with light haptic.
 * Cancels on movement >8px or pointer leave/up before threshold.
 */
export function useLongPress<T extends HTMLElement = HTMLElement>(
  onLongPress: (e: React.PointerEvent<T>) => void,
  { delay = 500, moveTolerance = 8 }: { delay?: number; moveTolerance?: number } = {},
) {
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    start.current = null;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<T>) => {
    fired.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    timer.current = window.setTimeout(() => {
      fired.current = true;
      try { (navigator as any).vibrate?.(10); } catch {}
      onLongPress(e);
    }, delay);
  }, [onLongPress, delay]);

  const onPointerMove = useCallback((e: React.PointerEvent<T>) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.hypot(dx, dy) > moveTolerance) clear();
  }, [clear, moveTolerance]);

  const onPointerUp = useCallback(() => clear(), [clear]);
  const onPointerCancel = useCallback(() => clear(), [clear]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, didLongPress: () => fired.current };
}
