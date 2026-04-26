import { useRef, useState } from 'react';
import { Phone, MessageSquare, Mail } from 'lucide-react';

interface SwipeRowProps {
  children: React.ReactNode;
  onCall?: () => void;
  onText?: () => void;
  onEmail?: () => void;
  hasPhone?: boolean;
  hasEmail?: boolean;
}

const ACTION_WIDTH = 72; // px per action
const MAX_SWIPE = ACTION_WIDTH * 3;
const TRIGGER = 30; // px to consider swipe (vs scroll)
const SNAP_RATIO = 0.42;

/**
 * Mobile swipe-to-action wrapper.
 * Swipe LEFT to reveal Call · Text · Email actions.
 * Tapping the row when open closes it. Vertical scroll passes through.
 */
export function SwipeRow({ children, onCall, onText, onEmail, hasPhone, hasEmail }: SwipeRowProps) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const startOffset = useRef(0);
  const currentOffset = useRef(0);
  const decided = useRef<'h' | 'v' | null>(null);
  const suppressClick = useRef(false);

  const setSwipeOffset = (next: number) => {
    currentOffset.current = next;
    setOffset(next);
  };

  const visibleActions = [
    hasPhone && onCall ? { key: 'call', icon: Phone, label: 'Call', className: 'bg-success text-success-foreground', onClick: onCall } : null,
    hasPhone && onText ? { key: 'text', icon: MessageSquare, label: 'Text', className: 'bg-info text-info-foreground', onClick: onText } : null,
    hasEmail && onEmail ? { key: 'email', icon: Mail, label: 'Email', className: 'bg-primary text-primary-foreground', onClick: onEmail } : null,
  ].filter(Boolean) as { key: string; icon: any; label: string; className: string; onClick: () => void }[];

  const totalWidth = visibleActions.length * ACTION_WIDTH;

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startOffset.current = currentOffset.current;
    decided.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null || startY.current == null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (decided.current == null) {
      if (Math.abs(dx) < TRIGGER && Math.abs(dy) < TRIGGER) return;
      decided.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (decided.current !== 'h') return;
    e.preventDefault();
    let next = startOffset.current + dx;
    if (next > 0) next = 0;
    if (next < -totalWidth) next = -totalWidth;
    setSwipeOffset(next);
  };

  const onTouchEnd = () => {
    if (decided.current === 'h') {
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
      // Snap to either fully open or closed
      setSwipeOffset(currentOffset.current < -totalWidth * SNAP_RATIO ? -totalWidth : 0);
    }
    startX.current = null;
    startY.current = null;
    decided.current = null;
  };

  const onTouchCancel = () => {
    setSwipeOffset(0);
    startX.current = null;
    startY.current = null;
    decided.current = null;
  };

  const onContentClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current || currentOffset.current !== 0) {
      e.preventDefault();
      e.stopPropagation();
      setSwipeOffset(0);
    }
  };

  if (totalWidth === 0) return <>{children}</>;

  return (
    <div className="relative w-full max-w-full overflow-hidden isolate [touch-action:pan-y] [overscroll-behavior-x:contain]">
      {/* Action layer */}
      <div className="absolute inset-y-0 right-0 flex pointer-events-auto">
        {visibleActions.map(a => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              onClick={(e) => { e.stopPropagation(); a.onClick(); setSwipeOffset(0); }}
              className={`${a.className} flex flex-col items-center justify-center gap-0.5 shrink-0 touch-manipulation`}
              style={{ width: ACTION_WIDTH }}
              aria-label={a.label}
            >
              <Icon className="w-4 h-4" strokeWidth={2.2} />
              <span className="text-[10px] font-semibold uppercase tracking-wider">{a.label}</span>
            </button>
          );
        })}
      </div>

      {/* Swipeable content */}
      <div
        className="relative w-full max-w-full bg-background will-change-transform [touch-action:pan-y]"
        style={{ transform: `translateX(${offset}px)`, transition: startX.current == null ? 'transform 0.2s ease' : 'none' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        onClickCapture={onContentClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
