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

    let frame = 0;

    const publishKeyboardState = () => {
      const viewport = window.visualViewport;
      const visualHeight = viewport?.height ?? window.innerHeight;
      const visualOffsetTop = viewport?.offsetTop ?? 0;
      const keyboardBottom = Math.max(0, window.innerHeight - visualHeight - visualOffsetTop);
      const keyboardOpen = keyboardBottom > 60;
      const viewportTop = viewport?.offsetTop ?? 0;

      root.style.setProperty('--keyboard-inset-bottom', `${keyboardBottom}px`);
      root.style.setProperty('--composer-viewport-top', `${viewportTop}px`);
      root.style.setProperty('--composer-viewport-height', `${visualHeight}px`);
      root.style.setProperty(
        '--composer-safe-bottom',
        `max(0px, calc(env(safe-area-inset-bottom, 0px) - ${keyboardBottom}px))`,
      );
      if (keyboardOpen) root.setAttribute('data-keyboard-open', 'true');
      else root.removeAttribute('data-keyboard-open');
    };

    const schedulePublishKeyboardState = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(publishKeyboardState);
    };

    publishKeyboardState();
    window.visualViewport?.addEventListener('resize', schedulePublishKeyboardState);
    window.visualViewport?.addEventListener('scroll', schedulePublishKeyboardState);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener('resize', schedulePublishKeyboardState);
      window.visualViewport?.removeEventListener('scroll', schedulePublishKeyboardState);
      root.removeAttribute('data-keyboard-open');
      root.style.removeProperty('--keyboard-inset-bottom');
      root.style.removeProperty('--composer-viewport-top');
      root.style.removeProperty('--composer-viewport-height');
      root.style.removeProperty('--composer-safe-bottom');
    };
  }, [isMobile, isDrawer]);

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
          data-mobile-drawer={isDrawer ? 'true' : undefined}
          className={cn(
            'p-0 inset-x-0 top-0 bottom-auto max-h-none h-[var(--composer-viewport-height,100dvh)] w-screen rounded-none border-0 flex flex-col overflow-hidden',
            className,
          )}
          style={{ top: 0, bottom: 'auto', height: 'var(--composer-viewport-height, 100dvh)', maxHeight: 'none', ...style }}
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
