/**
 * ResponsiveDialog — renders shadcn Dialog on desktop, bottom Sheet on mobile.
 * Drop-in alternative for centered modals that should be thumb-friendly on phones.
 *
 * Usage mirrors Dialog:
 *   <ResponsiveDialog open={open} onOpenChange={setOpen}>
 *     <ResponsiveDialogContent>
 *       <ResponsiveDialogHeader><ResponsiveDialogTitle>…</ResponsiveDialogTitle></ResponsiveDialogHeader>
 *       …
 *     </ResponsiveDialogContent>
 *   </ResponsiveDialog>
 */
import * as React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export function ResponsiveDialog(props: React.ComponentProps<typeof Dialog>) {
  const isMobile = useIsMobile();
  return isMobile ? <Sheet {...props} /> : <Dialog {...props} />;
}

type ResponsiveDialogContentProps = React.ComponentPropsWithoutRef<typeof DialogContent> & {
  /** Hide the swipe-to-dismiss drag handle on mobile (use for full-screen composers). */
  hideMobileHandle?: boolean;
};

export const ResponsiveDialogContent = React.forwardRef<
  HTMLDivElement,
  ResponsiveDialogContentProps
>(({ className, children, hideMobileHandle, style, ...rest }, ref) => {
  const isMobile = useIsMobile();
  const classNameString = typeof className === 'string' ? className : '';
  const isDrawer = classNameString.includes('mobile-fullbleed') || classNameString.includes('mobile-drawer');
  const isTrulyFullScreen = classNameString.includes('mobile-truly-fullscreen');
  const [drawerViewportStyle, setDrawerViewportStyle] = React.useState<React.CSSProperties>({
    top: 'max(env(safe-area-inset-top, 0px), 8px)',
    bottom: '0px',
    height: 'auto',
    maxHeight: 'none',
  });

  React.useEffect(() => {
    if (!isMobile || !isDrawer || isTrulyFullScreen || typeof window === 'undefined') return;

    let raf = 0;
    const root = document.documentElement;

    const updateViewportVars = () => {
      const viewport = window.visualViewport;
      const visualHeight = viewport?.height ?? window.innerHeight;
      const visualOffsetTop = viewport?.offsetTop ?? 0;
      // Height of on-screen keyboard / soft input panel.
      const keyboardBottom = Math.max(0, window.innerHeight - visualHeight - visualOffsetTop);
      const keyboardOpen = keyboardBottom > 60;

      // Track the *visual* viewport, not the layout viewport. When iOS opens
      // the keyboard it scrolls the layout viewport up to keep the focused
      // input visible — that drags any `position: fixed` element up with it,
      // which is exactly what made the composer header tuck behind the notch
      // and "slowly slide down" once iOS settled. By offsetting `top` by
      // `visualOffsetTop` we cancel that scroll and the drawer stays glued
      // to the visible region for the entire keyboard animation.
      setDrawerViewportStyle({
        top: `calc(max(env(safe-area-inset-top, 0px), 8px) + ${visualOffsetTop}px)`,
        bottom: `${keyboardBottom}px`,
        height: 'auto',
        maxHeight: 'none',
        // No transition on `top` — it must follow the keyboard frame-perfect.
        // iOS animates the visualViewport itself, so this already feels smooth.
        willChange: 'top, bottom',
      });

      // Continuous composer-safe-bottom: drawer's bottom edge already sits
      // `keyboardBottom`px above the device bottom, so the safe-area inset
      // below the keyboard line is *already covered*. Subtract it so the
      // composer's inner padding eases from full safe-area (idle) down to
      // 0 (keyboard fully open) instead of snapping at a threshold.
      root.style.setProperty('--keyboard-inset-bottom', `${keyboardBottom}px`);
      root.style.setProperty(
        '--composer-safe-bottom',
        `max(0px, calc(env(safe-area-inset-bottom, 0px) - ${keyboardBottom}px))`,
      );

      if (keyboardOpen) {
        root.setAttribute('data-keyboard-open', 'true');
      } else {
        root.removeAttribute('data-keyboard-open');
      }

      // Belt-and-suspenders: also pin the layout viewport scroll to 0 so
      // anything outside the drawer (toasts, dialer widget) doesn't drift.
      // Combined with the visualOffsetTop math above, the drawer header is
      // now pinned regardless of which viewport iOS chooses to move.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateViewportVars);
    };

    updateViewportVars();
    window.visualViewport?.addEventListener('resize', onChange);
    window.visualViewport?.addEventListener('scroll', onChange);
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.visualViewport?.removeEventListener('resize', onChange);
      window.visualViewport?.removeEventListener('scroll', onChange);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange);
      root.removeAttribute('data-keyboard-open');
      root.style.removeProperty('--keyboard-inset-bottom');
      root.style.removeProperty('--composer-safe-bottom');
    };
  }, [isMobile, isDrawer, isTrulyFullScreen]);

  if (isMobile) {
    // `mobile-fullbleed` (legacy flag) and `mobile-drawer` (new) both render
    // a premium bottom-drawer: rounded top, capped at 96dvh so the iOS
    // status bar stays visible above the sheet, sticky safe-area-aware
    // padding so footer actions never tuck under the floating bottom-nav.
    // Use `mobile-truly-fullscreen` for the rare case where you really
    // want to paint behind the status bar.
    if (isTrulyFullScreen) {
      return (
        <SheetContent
          ref={ref}
          side="bottom"
          className={cn(
            'p-0 inset-0 max-h-none h-[100dvh] w-screen rounded-none border-0 flex flex-col',
            className,
          )}
          style={style}
          {...(rest as any)}
        >
          {children}
        </SheetContent>
      );
    }

    return (
      <SheetContent
        ref={ref}
        side="bottom"
        className={cn(
          isDrawer
            ? 'p-0 w-screen rounded-t-3xl border-0 border-t border-border/60 shadow-2xl flex flex-col'
            : 'rounded-t-2xl max-h-[94vh] flex flex-col',
          className,
        )}
        style={isDrawer ? { ...drawerViewportStyle, ...style } : { paddingTop: 'var(--composer-top-pad)', ...style }}
        {...(rest as any)}
      >
        {!hideMobileHandle && (
          <div className="flex justify-center pt-2 pb-1 shrink-0 pointer-events-none">
            <div className="h-1 w-9 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        {children}
      </SheetContent>
    );
  }
  return (
    <DialogContent ref={ref} className={className} style={style} {...(rest as any)}>
      {children}
    </DialogContent>
  );
});
ResponsiveDialogContent.displayName = 'ResponsiveDialogContent';

export function ResponsiveDialogHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = useIsMobile();
  return isMobile ? <SheetHeader {...props} /> : <DialogHeader {...props} />;
}

export function ResponsiveDialogTitle(props: React.ComponentProps<typeof DialogTitle>) {
  const isMobile = useIsMobile();
  return isMobile ? <SheetTitle {...(props as any)} /> : <DialogTitle {...props} />;
}

export function ResponsiveDialogDescription(props: React.ComponentProps<typeof DialogDescription>) {
  const isMobile = useIsMobile();
  return isMobile ? <SheetDescription {...(props as any)} /> : <DialogDescription {...props} />;
}

export function ResponsiveDialogFooter(props: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = useIsMobile();
  return isMobile ? <SheetFooter {...props} /> : <DialogFooter {...props} />;
}
