import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Which side of the content the handle sits on */
  side: 'left' | 'right';
  collapsed: boolean;
  onToggle: () => void;
  label?: string;
}

const SWIPE_THRESHOLD = 40;

/**
 * Vertical swipe-aware divider sitting between the panel and the center column.
 * Swipe horizontally toward the panel to collapse, away to expand.
 * Click toggles. Always renders a visible chevron button.
 */
export function PanelEdgeHandle({ side, collapsed, onToggle, label }: Props) {
  const startX = useRef<number | null>(null);
  const moved = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    moved.current = false;
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
  const onPointerUp = (e: React.PointerEvent) => {
    if (!moved.current && startX.current != null) {
      onToggle();
    }
    startX.current = null;
    moved.current = false;
  };

  const Icon =
    (side === 'left' && !collapsed) || (side === 'right' && collapsed)
      ? ChevronLeft
      : ChevronRight;

  return (
    <div
      role="separator"
      aria-label={label || (collapsed ? 'Expand panel' : 'Collapse panel')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { startX.current = null; }}
      className={cn(
        'relative flex-shrink-0 w-2 h-full cursor-col-resize select-none group',
        'bg-border/40 hover:bg-primary/40 transition-colors touch-none',
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 z-10',
          side === 'left' ? '-right-3' : '-left-3',
          'w-6 h-12 rounded-md border border-border bg-background shadow-sm',
          'flex items-center justify-center text-muted-foreground',
          'hover:text-foreground hover:border-primary/60 transition-colors',
        )}
        aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
      >
        <Icon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
