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
    top: '60px',
    bottom: '0px',
    height: 'auto',
    maxHeight: 'none',
  });

  React.useEffect(() => {
    if (!isMobile || !isDrawer || isTrulyFullScreen || typeof window === 'undefined') return;

    const updateViewportVars = () => {
      const viewport = window.visualViewport;
      const visualTop = viewport?.offsetTop ?? 0;
      const visualHeight = viewport?.height ?? window.innerHeight;
      const visualBottom = visualTop + visualHeight;
      const keyboardBottom = Math.max(0, window.innerHeight - visualBottom);
      const topClearance = Math.max(60, visualTop + 8);

      setDrawerViewportStyle({
        top: `${topClearance}px`,
        bottom: `${keyboardBottom}px`,
        height: 'auto',
        maxHeight: 'none',
      });
    };

    updateViewportVars();
    window.visualViewport?.addEventListener('resize', updateViewportVars);
    window.visualViewport?.addEventListener('scroll', updateViewportVars);
    window.addEventListener('resize', updateViewportVars);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewportVars);
      window.visualViewport?.removeEventListener('scroll', updateViewportVars);
      window.removeEventListener('resize', updateViewportVars);
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
