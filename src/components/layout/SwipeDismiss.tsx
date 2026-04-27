import { useRef, useState, type CSSProperties } from 'react';

/**
 * iOS-style swipe-down-to-close for bottom sheets.
 *
 * Returns:
 *  - containerStyle: apply to the outer sheet content wrapper (handles transform)
 *  - handleProps: spread onto the visible grab-handle element (initiates drag)
 *
 * The drag is intentionally only initiated from the handle so that inner
 * scrollable content keeps native momentum scrolling.
 */
export function useSwipeToClose(onClose: () => void, threshold = 120) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startT = useRef(0);
  const lastY = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    lastY.current = startY.current;
    startT.current = Date.now();
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const y = e.touches[0].clientY;
    lastY.current = y;
    const diff = y - startY.current;
    setDragY(diff > 0 ? diff : diff * 0.15);
  };

  const onTouchEnd = () => {
    const diff = lastY.current - startY.current;
    const dt = Math.max(1, Date.now() - startT.current);
    const velocity = diff / dt;
    setDragging(false);
    if (diff > threshold || velocity > 0.6) {
      setDragY(window.innerHeight);
      window.setTimeout(onClose, 180);
    } else {
      setDragY(0);
    }
  };

  const containerStyle: CSSProperties = {
    transform: `translateY(${dragY}px)`,
    transition: dragging ? 'none' : 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
    willChange: 'transform',
  };

  const handleProps = {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    style: { touchAction: 'none' as const },
  };

  return { containerStyle, handleProps };
}
