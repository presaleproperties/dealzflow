/**
 * useLongPress — touch long-press detector with movement cancellation.
 *
 * Returns event handlers to spread onto a target element. After `delay` ms
 * of contact (default 450ms) without moving more than `threshold` px,
 * fires `onLongPress` with the original touch event. Movement, lift, or
 * scroll cancels the gesture. A short haptic blip is played when supported.
 *
 * Skips when the pointer is a mouse — desktop has hover menus instead.
 */
import { useCallback, useRef } from 'react';
import { triggerHaptic } from '@/lib/haptics';

interface Options {
  delay?: number;
  threshold?: number;
}

export function useLongPress<T extends HTMLElement = HTMLElement>(
  onLongPress: (e: React.TouchEvent<T>) => void,
  { delay = 450, threshold = 8 }: Options = {},
) {
  const timer = useRef<number | null>(null);
  const startPt = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    startPt.current = null;
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent<T>) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    startPt.current = { x: t.clientX, y: t.clientY };
    fired.current = false;
    timer.current = window.setTimeout(() => {
      fired.current = true;
      triggerHaptic('medium');
      onLongPress(e);
    }, delay);
  }, [onLongPress, delay]);

  const onTouchMove = useCallback((e: React.TouchEvent<T>) => {
    if (!startPt.current) return;
    const t = e.touches[0];
    const dx = t.clientX - startPt.current.x;
    const dy = t.clientY - startPt.current.y;
    if (Math.hypot(dx, dy) > threshold) clear();
  }, [threshold, clear]);

  const onTouchEnd = useCallback(() => clear(), [clear]);
  const onTouchCancel = useCallback(() => clear(), [clear]);
  const onContextMenu = useCallback((e: React.MouseEvent<T>) => {
    // Prevent native long-press text-select / context menu when our gesture fired.
    if (fired.current) e.preventDefault();
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onContextMenu };
}
