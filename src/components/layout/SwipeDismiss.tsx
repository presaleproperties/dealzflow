import { useRef, useState, type ReactNode, type CSSProperties } from 'react';

/**
 * iOS-style swipe-down-to-close wrapper for bottom sheets.
 * Drags content vertically with finger, dismisses if pulled > 120px or
 * flicked with velocity, otherwise springs back.
 *
 * Drag is initiated only from the grab handle area to avoid conflicting
 * with inner scrollable content.
 */
interface SwipeDismissProps {
  onClose: () => void;
  children: ReactNode;
  /** Optional extra classes for the outer wrapper */
  className?: string;
  /** Show the iOS-style grab handle (default true) */
  showHandle?: boolean;
}

export function SwipeDismiss({ onClose, children, className, showHandle = true }: SwipeDismissProps) {
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
    // Only allow downward drag, with mild rubber-banding upward
    setDragY(diff > 0 ? diff : diff * 0.15);
  };

  const onTouchEnd = () => {
    const diff = lastY.current - startY.current;
    const dt = Math.max(1, Date.now() - startT.current);
    const velocity = diff / dt; // px / ms
    setDragging(false);
    if (diff > 120 || velocity > 0.6) {
      // animate out then close
      setDragY(window.innerHeight);
      setTimeout(onClose, 180);
    } else {
      setDragY(0);
    }
  };

  const style: CSSProperties = {
    transform: `translateY(${dragY}px)`,
    transition: dragging ? 'none' : 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
    willChange: 'transform',
    touchAction: 'pan-y',
  };

  return (
    <div className={className} style={style}>
      {showHandle && (
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="flex w-full items-center justify-center pt-[8px] pb-[6px] cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
        >
          <span
            aria-hidden
            className="block rounded-full"
            style={{
              width: 38,
              height: 5,
              background: 'hsl(var(--foreground) / 0.22)',
            }}
          />
        </div>
      )}
      {children}
    </div>
  );
}
