import { useState, useRef, useCallback, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
}

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);

  // Find the nearest scrolling ancestor so PTR works whether the parent
  // <main> is the scroll container (mobile/PWA) or window itself is.
  const getScrollParent = (el: HTMLElement | null): HTMLElement | Window => {
    let node: HTMLElement | null = el?.parentElement ?? null;
    while (node) {
      const style = getComputedStyle(node);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return window;
  };

  const getScrollTop = (sp: HTMLElement | Window): number =>
    sp instanceof Window ? (sp.scrollY || document.documentElement.scrollTop || 0) : sp.scrollTop;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return;
    const sp = getScrollParent(containerRef.current);
    if (getScrollTop(sp) > 0) return;
    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;
    const sp = getScrollParent(containerRef.current);
    if (getScrollTop(sp) > 0) {
      setPullDistance(0);
      return;
    }

    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;

    if (diff > 0) {
      const resistance = Math.min(diff * 0.5, MAX_PULL);
      setPullDistance(resistance);
      if (diff > 10) {
        e.preventDefault();
      }
    }
  }, [isPulling, isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;
    setIsPulling(false);

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(60); // Keep spinner visible
      
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, pullDistance, isRefreshing, onRefresh]);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const rotation = progress * 180;
  const scale = 0.5 + progress * 0.5;

  return (
    <div 
      ref={containerRef}
      className={cn("relative overflow-auto", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div 
        className={cn(
          "absolute left-0 right-0 flex items-center justify-center z-10 pointer-events-none transition-opacity duration-200",
          (pullDistance > 0 || isRefreshing) ? "opacity-100" : "opacity-0"
        )}
        style={{ 
          top: Math.max(pullDistance - 50, -50),
          height: 50,
        }}
      >
        <div 
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-full bg-card/95 backdrop-blur-xl border border-border/50 shadow-ios-lg",
            isRefreshing && "animate-pulse"
          )}
          style={{
            transform: `scale(${scale})`,
            opacity: progress,
          }}
        >
          {isRefreshing ? (
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          ) : (
            <svg 
              className="w-4 h-4 text-primary transition-transform duration-150"
              style={{ transform: `rotate(${rotation}deg)` }}
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5"
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12l7-7 7 7" />
            </svg>
          )}
        </div>
      </div>

      {/* Content with pull transform */}
      <div 
        className="transition-transform duration-200 ease-out"
        style={{ 
          transform: `translateY(${pullDistance}px)`,
          transitionDuration: isPulling ? '0ms' : '300ms',
        }}
      >
        {children}
      </div>
    </div>
  );
}
