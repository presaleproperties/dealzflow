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

    // Snapshot the safe-area-inset-top ONCE while the keyboard is closed.
    // iOS collapses env(safe-area-inset-top) to ~0 once the soft keyboard
    // opens, which was visibly pulling the composer header up under the
    // status bar. Pinning the value to a stable CSS var keeps the header
    // padding constant across keyboard open/close.
    try {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;';
      document.body.appendChild(probe);
      const measured = Math.round(probe.getBoundingClientRect().height);
      document.body.removeChild(probe);
      root.style.setProperty('--composer-header-top-pad-locked', `${measured}px`);
    } catch {
      root.style.setProperty('--composer-header-top-pad-locked', '0px');
    }

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
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener('resize', schedulePublishKeyboardState);
      root.removeAttribute('data-keyboard-open');
      root.style.removeProperty('--keyboard-inset-bottom');
      root.style.removeProperty('--composer-viewport-top');
      root.style.removeProperty('--composer-viewport-height');
      root.style.removeProperty('--composer-safe-bottom');
      root.style.removeProperty('--composer-header-top-pad-locked');
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
            'p-0 inset-x-0 bottom-auto max-h-none h-[var(--composer-viewport-height,100dvh)] w-screen rounded-none border-0 flex flex-col overflow-hidden',
            className,
          )}
          style={{ top: 'var(--composer-viewport-top, 0px)', bottom: 'auto', height: 'var(--composer-viewport-height, 100dvh)', maxHeight: 'none', ...style }}
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
        style={isDrawer ? { top: 'var(--composer-viewport-top, 0px)', bottom: 'auto', height: 'var(--composer-viewport-height, 100dvh)', maxHeight: 'none', ...style } : { paddingTop: 'var(--composer-top-pad)', ...style }}
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
