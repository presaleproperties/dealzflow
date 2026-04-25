import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Which side of the content the handle sits on */
  side: 'left' | 'right';
  collapsed: boolean;
  onToggle: () => void;
  label?: string;
}

const SWIPE_THRESHOLD = 28;

/**
 * iOS-style discreet panel edge.
 * - Hairline rail that virtually disappears at rest
 * - Tiny pill "grabber" centered vertically — fades in only on hover/focus/drag
 * - Click to toggle; drag horizontally to swipe collapse/expand
 * - Smooth, springy transitions; no chevrons, no boxes
 */
export function PanelEdgeHandle({ side, collapsed, onToggle, label }: Props) {
  const startX = useRef<number | null>(null);
  const moved = useRef(false);
  const [active, setActive] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    moved.current = false;
    setActive(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    moved.current = true;
    // Swipe toward the panel side = collapse
    const collapseDir = side === 'left' ? dx < 0 : dx > 0;
    const expandDir = side === 'left' ? dx > 0 : dx < 0;
    if (collapseDir && !collapsed) onToggle();
    else if (expandDir && collapsed) onToggle();
    startX.current = null;
  };
  const onPointerUp = () => {
    if (!moved.current && startX.current != null) {
      onToggle();
    }
    startX.current = null;
    moved.current = false;
    setActive(false);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label || (collapsed ? 'Expand panel' : 'Collapse panel')}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { startX.current = null; setActive(false); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
      }}
      className={cn(
        // Hairline rail — wide hit area (12px), narrow visual (1px)
        'relative flex-shrink-0 w-3 h-full cursor-col-resize select-none touch-none group',
        'flex items-center justify-center',
        'focus-visible:outline-none',
      )}
    >
      {/* Hairline divider line — barely visible at rest, brightens on hover/active */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-1/2 -translate-x-1/2 w-px',
          'bg-border/40 transition-colors duration-200',
          'group-hover:bg-primary/40 group-focus-visible:bg-primary/50',
          active && 'bg-primary/60',
        )}
      />
      {/* iOS-style pill grabber — fades in on hover/focus/drag */}
      <span
        aria-hidden
        className={cn(
          'relative h-10 w-[3px] rounded-full',
          'bg-foreground/30 transition-all duration-200 ease-out',
          'opacity-0 scale-y-75',
          'group-hover:opacity-100 group-hover:scale-y-100',
          'group-focus-visible:opacity-100 group-focus-visible:scale-y-100',
          active && 'opacity-100 scale-y-100 bg-primary/70 h-12',
        )}
      />
    </div>
  );
}
