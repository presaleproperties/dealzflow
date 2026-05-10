import { useRef, useState, type ReactNode } from 'react';
import { Pin, PinOff, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface SwipeRowProps {
  children: ReactNode;
  isPinned: boolean;
  onPin: () => void;
  onDelete: () => void;
  /** Disable swipe (e.g. desktop, select mode). */
  disabled?: boolean;
}

const COMMIT_PX = 84;
const MAX_PX = 140;

/**
 * Touch swipe wrapper for the chats inbox row.
 *  - Swipe RIGHT  → reveal Pin / Unpin pane (commit triggers `onPin`)
 *  - Swipe LEFT   → reveal Delete pane     (commit triggers `onDelete`)
 * Snaps back if the gesture doesn't pass the commit threshold.
 * No-op on non-touch devices (desktop hover actions stay).
 */
export function SwipeRow({ children, isPinned, onPin, onDelete, disabled }: SwipeRowProps) {
  const startX = useRef<number | null>(null);
  const armed = useRef<'left' | 'right' | null>(null);
  const startY = useRef<number | null>(null);
  const locked = useRef<'h' | 'v' | null>(null);
  const [dx, setDx] = useState(0);

  const reset = () => {
    startX.current = null;
    startY.current = null;
    locked.current = null;
    armed.current = null;
    setDx(0);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    locked.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (disabled || startX.current == null || startY.current == null) return;
    const t = e.touches[0];
    const rawDx = t.clientX - startX.current;
    const rawDy = t.clientY - startY.current;

    if (locked.current == null) {
      if (Math.abs(rawDx) < 8 && Math.abs(rawDy) < 8) return;
      locked.current = Math.abs(rawDx) > Math.abs(rawDy) ? 'h' : 'v';
    }
    if (locked.current === 'v') return;

    // clamp + light resistance past max
    const clamped = Math.max(-MAX_PX, Math.min(MAX_PX, rawDx));
    setDx(clamped);
  };

  const onTouchEnd = () => {
    if (disabled) return;
    if (dx >= COMMIT_PX) {
      onPin();
    } else if (dx <= -COMMIT_PX) {
      onDelete();
    }
    reset();
  };

  const onTouchCancel = () => reset();

  const showLeft = dx > 0;
  const showRight = dx < 0;
  const leftActive = dx >= COMMIT_PX;
  const rightActive = dx <= -COMMIT_PX;

  return (
    <div className="relative overflow-hidden">
      {/* Left action — Pin (revealed on right swipe) */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 flex items-center justify-start pl-5 pointer-events-none transition-colors',
          leftActive ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary',
        )}
        style={{ width: Math.max(0, dx), opacity: showLeft ? 1 : 0 }}
      >
        <div className="flex items-center gap-2 text-[12px] font-semibold whitespace-nowrap">
          {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4 -rotate-45" />}
          {isPinned ? 'Unpin' : 'Pin'}
        </div>
      </div>

      {/* Right action — Delete (revealed on left swipe) */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-y-0 right-0 flex items-center justify-end pr-5 pointer-events-none transition-colors',
          rightActive ? 'bg-destructive text-destructive-foreground' : 'bg-destructive/15 text-destructive',
        )}
        style={{ width: Math.max(0, -dx), opacity: showRight ? 1 : 0 }}
      >
        <div className="flex items-center gap-2 text-[12px] font-semibold whitespace-nowrap">
          <Trash2 className="w-4 h-4" />
          Delete
        </div>
      </div>

      {/* Sliding content */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        style={{
          transform: `translate3d(${dx}px, 0, 0)`,
          transition: dx === 0 ? 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}
