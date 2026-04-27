import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Visual indicator for usePullToRefresh — a circular spinner that grows in
 * opacity/scale as the user pulls and rotates while refreshing.
 *
 * Position absolute/fixed by parent. Caller passes `pullDistance` (px) and
 * `isRefreshing`.
 */
export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 64,
  className,
}: {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
  className?: string;
}) {
  const visible = pullDistance > 4 || isRefreshing;
  const progress = Math.min(1, pullDistance / threshold);
  // Indicator follows the finger but caps near the threshold for stability.
  const translateY = Math.min(pullDistance, threshold + 8);
  const rotate = isRefreshing ? 0 : progress * 270;

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 select-none',
        'transition-opacity duration-150',
        className,
      )}
      style={{
        opacity: visible ? Math.max(0.35, progress) : 0,
        transform: `translate(-50%, ${translateY - 36}px)`,
      }}
    >
      <div
        className={cn(
          'flex items-center justify-center w-9 h-9 rounded-full',
          'bg-card/95 backdrop-blur border border-border/70 shadow-sm',
        )}
        style={{
          transform: isRefreshing ? undefined : `rotate(${rotate}deg)`,
          transition: isRefreshing ? 'none' : 'transform 60ms linear',
        }}
      >
        <Loader2
          className={cn(
            'w-4 h-4 text-primary',
            isRefreshing && 'animate-spin',
          )}
          strokeWidth={2.4}
        />
      </div>
    </div>
  );
}
