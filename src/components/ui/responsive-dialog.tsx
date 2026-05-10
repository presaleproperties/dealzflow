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
  React.useEffect(() => {
    if (!isMobile || !isDrawer || typeof window === 'undefined') return;

    const root = document.documentElement;

    // Composer surface is permanently locked to the layout viewport — set
    // these once so neither the dialog nor its header ever moves.
    root.style.setProperty('--composer-viewport-top', '0px');
    root.style.setProperty('--composer-viewport-height', '100dvh');

    // Header padding uses env(safe-area-inset-top) directly — same pattern
    // as MobileAppHeader and every other top-of-page header in the app.
    // The visible header chrome stays a fixed height (h-11), so even if
    // iOS collapses the safe-area inset while the keyboard is open, only
    // the empty status-bar spacer changes — the row itself never shrinks.

    let frame = 0;
    let lastKeyboardBottom = -1;

    const publishKeyboardState = () => {
      frame = 0;
      const viewport = window.visualViewport;
      const visualHeight = viewport?.height ?? window.innerHeight;
      const visualOffsetTop = viewport?.offsetTop ?? 0;
      // Round to integer so sub-pixel viewport jitter during the iOS
      // keyboard animation doesn't trigger redundant style writes (which
      // were causing the visible "chase" flicker on the composer).
      const keyboardBottom = Math.max(
        0,
        Math.round(window.innerHeight - visualHeight - visualOffsetTop),
      );
      if (keyboardBottom === lastKeyboardBottom) return;
      lastKeyboardBottom = keyboardBottom;

      root.style.setProperty('--keyboard-inset-bottom', `${keyboardBottom}px`);
      root.style.setProperty(
        '--composer-safe-bottom',
        `max(0px, calc(env(safe-area-inset-bottom, 0px) - ${keyboardBottom}px))`,
      );
      if (keyboardBottom > 60) root.setAttribute('data-keyboard-open', 'true');
      else root.removeAttribute('data-keyboard-open');
    };

    const schedulePublishKeyboardState = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(publishKeyboardState);
    };

    publishKeyboardState();
    // NOTE: only listen to `resize`. `scroll` fires constantly while iOS
    // settles the keyboard and added no useful information — it just
    // produced extra style writes that translated into composer jitter.
    window.visualViewport?.addEventListener('resize', schedulePublishKeyboardState);

    // ── iOS keyboard pan-lock ────────────────────────────────────────────
    // With `interactive-widget=overlays-content` iOS does NOT resize the
    // layout viewport, but Safari STILL pans `window` to keep the focused
    // input in the visualViewport. That pan is what visually "pushes" the
    // composer header upward when the user taps to type. We pin the window
    // to (0,0) for as long as the drawer is open so the page itself never
    // scrolls — only the dock translate (below) and the inner chat scroller
    // are allowed to move.
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscroll = (document.body.style as any).overscrollBehavior;
    document.body.style.overflow = 'hidden';
    (document.body.style as any).overscrollBehavior = 'none';
    const pinWindow = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    };
    pinWindow();
    window.addEventListener('scroll', pinWindow, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener('resize', schedulePublishKeyboardState);
      window.removeEventListener('scroll', pinWindow);
      document.body.style.overflow = previousBodyOverflow;
      (document.body.style as any).overscrollBehavior = previousBodyOverscroll;
      root.removeAttribute('data-keyboard-open');
      root.style.removeProperty('--keyboard-inset-bottom');
      root.style.removeProperty('--composer-viewport-top');
      root.style.removeProperty('--composer-viewport-height');
      root.style.removeProperty('--composer-safe-bottom');
    };
  }, [isMobile, isDrawer]);

  if (isMobile) {
    // `mobile-fullbleed` (legacy flag) and `mobile-drawer` (new) both render
    // a premium mobile surface. Fullscreen composer surfaces must track the
    // visual viewport top/height so iOS keyboard focus never pans the header
    // under the status island; only the internal body is allowed to scroll.
    if (isTrulyFullScreen) {
      return (
        <SheetContent
          ref={ref}
          side="bottom"
          data-mobile-drawer={isDrawer ? 'true' : undefined}
          className={cn(
            'p-0 inset-x-0 bottom-auto max-h-none w-screen rounded-none border-0 flex flex-col overflow-hidden',
            className,
          )}
          style={{
            top: 'var(--composer-viewport-top, 0px)',
            bottom: 'auto',
            // Shrink with the keyboard so the composer body + footer stay
            // visible above the soft keyboard (chat-composer parity).
            height: 'calc(var(--composer-viewport-height, 100dvh) - var(--keyboard-inset-bottom, 0px))',
            maxHeight: 'none',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            ...style,
          }}
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
        data-mobile-drawer={isDrawer ? 'true' : undefined}
        className={cn(
          isDrawer
            ? 'p-0 w-screen rounded-t-3xl border-0 border-t border-border/60 shadow-2xl flex flex-col'
            : 'rounded-t-2xl max-h-[94vh] flex flex-col',
          className,
        )}
        style={isDrawer ? { top: 'var(--composer-viewport-top, 0px)', bottom: 'auto', height: 'calc(var(--composer-viewport-height, 100dvh) - var(--keyboard-inset-bottom, 0px))', maxHeight: 'none', paddingBottom: 'env(safe-area-inset-bottom, 0px)', ...style } : { paddingTop: 'var(--composer-top-pad)', ...style }}
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
