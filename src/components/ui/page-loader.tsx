import logoMark from '@/assets/logo-mark.png';

/**
 * Premium full-page loader. Pure CSS animations (no framer-motion) for
 * lower JS cost on cold loads and route transitions.
 *
 * Variants:
 *   - default: full-screen overlay (auth/route hydration gates)
 *   - inline:  centered within parent (page-level loading states)
 */
export function PageLoader({ variant = 'default' as 'default' | 'inline' }) {
  const isInline = variant === 'inline';
  return (
    <div
      className={
        isInline
          ? 'flex items-center justify-center py-16'
          : 'fixed inset-0 z-50 flex items-center justify-center bg-background'
      }
      role="status"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-5 page-loader-enter">
        {/* Logo with breathing glow */}
        <div className="relative flex items-center justify-center">
          <span className="absolute w-24 h-24 rounded-3xl bg-primary/15 page-loader-glow" />
          <span
            className="absolute w-20 h-20 rounded-2xl bg-primary/10 page-loader-glow"
            style={{ animationDelay: '0.4s' }}
          />
          <div
            className="relative w-[68px] h-[68px] rounded-2xl bg-card border border-border/50 flex items-center justify-center page-loader-float"
            style={{
              boxShadow:
                '0 0 0 1px hsl(var(--border) / 0.1), 0 8px 30px -8px hsl(var(--primary) / 0.2), 0 2px 8px -2px hsl(var(--primary) / 0.1)',
            }}
          >
            <img
              src={logoMark}
              alt=""
              className="w-9 h-9 object-contain"
              draggable={false}
            />
          </div>
        </div>

        <p className="text-[12px] font-semibold tracking-[0.14em] uppercase text-muted-foreground/60">
          dealzflow
        </p>

        <div className="w-28 h-[2px] rounded-full bg-muted/50 overflow-hidden">
          <span className="block h-full w-[40%] rounded-full bg-primary/55 page-loader-bar" />
        </div>
      </div>
    </div>
  );
}
