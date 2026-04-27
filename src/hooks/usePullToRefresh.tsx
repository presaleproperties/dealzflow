import { useEffect, useRef, useState, useCallback } from 'react';

interface Options {
  /** Async work to perform when threshold pull is released. */
  onRefresh: () => Promise<unknown> | unknown;
  /** Pixels of pull required to trigger a refresh. Default 64. */
  threshold?: number;
  /** Max pixels the indicator can travel (rubber-band cap). Default 96. */
  maxPull?: number;
  /** Disable the gesture (e.g. on desktop). Default false. */
  disabled?: boolean;
}

/**
 * Mobile pull-to-refresh for any vertically scrollable container.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   const { pullDistance, isRefreshing, ready } = usePullToRefresh({
 *     scrollRef: ref,
 *     onRefresh: async () => qc.invalidateQueries(...),
 *   });
 *   <div ref={ref} className="overflow-y-auto" />
 *
 * Only activates while the container is scrolled to the very top. Touch only —
 * skipped on devices without coarse pointer (i.e. desktop).
 */
export function usePullToRefresh<T extends HTMLElement>({
  scrollRef,
  onRefresh,
  threshold = 64,
  maxPull = 96,
  disabled = false,
}: Options & { scrollRef: React.RefObject<T> }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  const onPointerCancel = useCallback(() => {
    startYRef.current = null;
    activeRef.current = false;
    setPullDistance(0);
  }, []);

  useEffect(() => {
    if (disabled) return;
    const el = scrollRef.current;
    if (!el) return;

    // Touch-only: don't hijack desktop wheel/trackpad scroll.
    const isCoarse =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(pointer: coarse)').matches;
    if (!isCoarse) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshing) return;
      if (el.scrollTop > 0) return;
      if (e.touches.length !== 1) return;
      startYRef.current = e.touches[0].clientY;
      activeRef.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!activeRef.current || startYRef.current == null) return;
      // If the user has scrolled the list down again mid-gesture, abandon.
      if (el.scrollTop > 0) {
        startYRef.current = null;
        activeRef.current = false;
        setPullDistance(0);
        return;
      }
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        // Upward swipe — let normal scroll happen.
        setPullDistance(0);
        return;
      }
      // Rubber-band: the further you pull, the slower it grows.
      const eased = Math.min(maxPull, delta * 0.55);
      setPullDistance(eased);
      // Prevent the page bounce from competing with our gesture.
      if (e.cancelable) e.preventDefault();
    };

    const handleTouchEnd = async () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      startYRef.current = null;

      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        // Snap indicator to the threshold position while spinning.
        setPullDistance(threshold);
        try {
          await onRefresh();
        } catch {
          /* swallow — UI just resets */
        } finally {
          // Tiny dwell so the spinner is visibly acknowledged.
          setTimeout(() => {
            setIsRefreshing(false);
            setPullDistance(0);
          }, 250);
        }
      } else {
        setPullDistance(0);
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    // Move must be non-passive so we can preventDefault during the pull.
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onPointerCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', onPointerCancel);
    };
  }, [scrollRef, onRefresh, threshold, maxPull, disabled, isRefreshing, pullDistance, onPointerCancel]);

  return {
    pullDistance,
    isRefreshing,
    /** True once the pull has crossed the trigger threshold. */
    ready: pullDistance >= threshold,
  };
}
