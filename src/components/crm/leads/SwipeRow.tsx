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
  const decided = useRef<'h' | 'v' | null>(null);

  const visibleActions = [
    hasPhone && onCall ? { key: 'call', icon: Phone, label: 'Call', bg: 'bg-emerald-500', onClick: onCall } : null,
    hasPhone && onText ? { key: 'text', icon: MessageSquare, label: 'Text', bg: 'bg-sky-500', onClick: onText } : null,
    hasEmail && onEmail ? { key: 'email', icon: Mail, label: 'Email', bg: 'bg-blue-700', onClick: onEmail } : null,
  ].filter(Boolean) as { key: string; icon: any; label: string; bg: string; onClick: () => void }[];

  const totalWidth = visibleActions.length * ACTION_WIDTH;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startOffset.current = offset;
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
    let next = startOffset.current + dx;
    if (next > 0) next = 0;
    if (next < -totalWidth) next = -totalWidth;
    setOffset(next);
  };

  const onTouchEnd = () => {
    if (decided.current === 'h') {
      // Snap to either fully open or closed
      setOffset(offset < -totalWidth / 2 ? -totalWidth : 0);
    }
    startX.current = null;
    startY.current = null;
    decided.current = null;
  };

  if (totalWidth === 0) return <>{children}</>;

  return (
    <div className="relative overflow-hidden">
      {/* Action layer */}
      <div className="absolute inset-y-0 right-0 flex">
        {visibleActions.map(a => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              onClick={(e) => { e.stopPropagation(); a.onClick(); setOffset(0); }}
              className={`${a.bg} text-white flex flex-col items-center justify-center gap-0.5`}
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
        className="relative bg-background"
        style={{ transform: `translateX(${offset}px)`, transition: startX.current == null ? 'transform 0.2s ease' : 'none' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (offset !== 0) { setOffset(0); } }}
      >
        {children}
      </div>
    </div>
  );
}
