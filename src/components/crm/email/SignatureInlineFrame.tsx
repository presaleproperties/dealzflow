import { useEffect, useRef, useState, useCallback } from 'react';
import { Maximize2 } from 'lucide-react';

const STORAGE_KEY = 'crm:compose:signature-frame-height';
const MIN_HEIGHT = 40;
const MAX_HEIGHT = 800;

/**
 * Renders a signature HTML snippet inside a sandboxed iframe styled to visually
 * match Tiptap's `prose prose-sm` editor body — same font, size, line-height,
 * and 16px horizontal padding — so it reads as one continuous message.
 *
 * Behavior:
 * - Auto-fits to content height by default.
 * - User can drag the bottom-right handle to set a custom height (persisted).
 * - "Fit" button restores auto-sizing.
 */
export function SignatureInlineFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState(40);
  const [customHeight, setCustomHeight] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const n = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) && n >= MIN_HEIGHT ? n : null;
    } catch {
      return null;
    }
  });

  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{
      margin:0;
      padding:0 16px;
      font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      font-size:14px;
      line-height:1.7142857;
      color:hsl(0 0% 4%);
      background:transparent;
    }
    /* Flush with editor text — collapse vertical whitespace at the seam.
       The composer keeps a one-line gap via the editor's last paragraph;
       the signature itself adds zero leading/trailing space. */
    body{padding-top:0 !important;padding-bottom:0 !important}
    body > *:first-child{margin-top:0 !important;padding-top:0 !important}
    body > *:last-child{margin-bottom:0 !important;padding-bottom:0 !important}
    /* Hide empty leading/trailing paragraphs that some signatures ship with */
    body > p:first-child:empty,
    body > p:last-child:empty,
    body > br:first-child,
    body > br:last-child{display:none !important}
    p{margin:1.1428571em 0}
    a{color:hsl(217 91% 50%);text-decoration:underline}
    img{max-width:100%;height:auto;display:block}
    table{border-collapse:collapse}
    td,th{vertical-align:top}
  </style></head><body>${html}</body></html>`;


  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const cdoc = iframe.contentDocument;
    if (!cdoc) return;
    cdoc.open();
    cdoc.write(doc);
    cdoc.close();

    const measure = () => {
      const body = cdoc.body;
      if (!body) return;
      const next = Math.max(body.scrollHeight, body.offsetHeight);
      setContentHeight(next);
    };
    requestAnimationFrame(measure);
    const imgs = Array.from(cdoc.images || []);
    imgs.forEach((img) => {
      if (!img.complete) img.addEventListener('load', measure, { once: true });
    });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && cdoc.body) {
      ro = new ResizeObserver(measure);
      ro.observe(cdoc.body);
    }
    return () => {
      ro?.disconnect();
    };
  }, [doc]);

  const effectiveHeight = customHeight ?? contentHeight;

  /* Drag-to-resize: mousedown on handle → track pointer Y delta. */
  const dragStateRef = useRef<{ startY: number; startH: number } | null>(null);
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      dragStateRef.current = { startY: e.clientY, startH: effectiveHeight };
    },
    [effectiveHeight],
  );
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStateRef.current;
    if (!s) return;
    const next = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, s.startH + (e.clientY - s.startY)));
    setCustomHeight(next);
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    try {
      if (customHeight != null) localStorage.setItem(STORAGE_KEY, String(customHeight));
    } catch {
      /* ignore */
    }
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
  }, [customHeight]);

  const fitToContent = () => {
    setCustomHeight(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const isCustom = customHeight != null;

  return (
    <div ref={wrapperRef} className="relative group">
      <iframe
        ref={ref}
        title="signature-inline-preview"
        className="w-full border-0 block bg-transparent"
        style={{ height: effectiveHeight }}
      />
      {/* Tiny floating control bar — only visible on hover */}
      <div className="absolute top-1 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {isCustom && (
          <button
            type="button"
            onClick={fitToContent}
            className="pointer-events-auto h-6 px-2 rounded-md text-[10px] font-medium bg-background/90 border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 backdrop-blur flex items-center gap-1 shadow-sm"
            title="Fit to content"
          >
            <Maximize2 className="h-3 w-3" />
            Fit
          </button>
        )}
        <span className="pointer-events-none h-6 px-1.5 rounded-md text-[10px] font-medium bg-background/80 border border-border text-muted-foreground backdrop-blur flex items-center">
          {Math.round(effectiveHeight)}px{isCustom ? '' : ' · auto'}
        </span>
      </div>
      {/* Drag handle — bottom edge, full width, with a centered grip */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize signature preview"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={fitToContent}
        className="absolute left-0 right-0 -bottom-1 h-2 cursor-ns-resize flex items-center justify-center group/handle"
        title="Drag to resize · double-click to fit"
      >
        <div className="h-1 w-10 rounded-full bg-border group-hover:bg-primary/40 group-hover/handle:bg-primary transition-colors" />
      </div>
    </div>
  );
}
