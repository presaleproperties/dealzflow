import { useEffect, useRef, Component, type ReactNode } from 'react';

/**
 * Safe sidebar thumbnail for an email template.
 *
 * Renders the template HTML inside a sandboxed iframe at 32% scale.
 * Wrapped in an internal error boundary so a malformed template can never
 * crash the surrounding compose dialog.
 */
export interface TemplateThumbProps {
  html?: string | null;
  className?: string;
}

function TemplateThumbInner({ html, className }: TemplateThumbProps) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    try {
      const doc = f.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(
        `<div style="transform:scale(0.32);transform-origin:top left;width:312%;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">${
          html || '<p style="color:#999;padding:12px">No preview</p>'
        }</div>`,
      );
      doc.close();
    } catch {
      /* iframe sandboxing or transient render errors — fall through to placeholder */
    }
  }, [html]);

  return (
    <iframe
      ref={ref}
      title="template-thumb"
      className={className ?? 'w-full h-[88px] border-0 bg-white pointer-events-none'}
      sandbox="allow-same-origin"
    />
  );
}

class ThumbBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    /* swallow — thumbnails are non-critical */
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function ThumbFallback({ className }: { className?: string }) {
  return (
    <div
      className={
        className ??
        'w-full h-[88px] bg-muted/40 flex items-center justify-center text-[10px] text-muted-foreground'
      }
    >
      Preview unavailable
    </div>
  );
}

export function TemplateThumb(props: TemplateThumbProps) {
  return (
    <ThumbBoundary fallback={<ThumbFallback className={props.className} />}>
      <TemplateThumbInner {...props} />
    </ThumbBoundary>
  );
}

export default TemplateThumb;
