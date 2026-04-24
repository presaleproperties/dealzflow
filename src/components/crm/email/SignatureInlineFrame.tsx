import { useEffect, useRef, useState } from 'react';

/**
 * Renders a signature HTML snippet inside a sandboxed iframe styled to visually
 * match Tiptap's `prose prose-sm` editor body — same font, size, line-height,
 * and 16px horizontal padding — so it reads as one continuous message.
 *
 * Auto-sizes height to its content so there's no dead space below the signature.
 */
export function SignatureInlineFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(40);

  // Match the editor exactly: font inherited from the app (Plus Jakarta Sans),
  // 14px / 1.7142 (prose-sm), 16px horizontal padding (matches editor `p-4`),
  // no top padding so the first signature line sits right under the editor's
  // last line (paragraph margins handle the natural breathing room).
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
    p{margin:1.1428571em 0}
    p:first-child{margin-top:0}
    p:last-child{margin-bottom:1.1428571em}
    a{color:hsl(217 91% 50%);text-decoration:underline}
    img{max-width:100%;height:auto}
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
      setHeight(next);
    };
    // Initial measurement after layout
    requestAnimationFrame(measure);
    // Re-measure when images load
    const imgs = Array.from(cdoc.images || []);
    imgs.forEach((img) => {
      if (!img.complete) img.addEventListener('load', measure, { once: true });
    });
    // Observe content size changes
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && cdoc.body) {
      ro = new ResizeObserver(measure);
      ro.observe(cdoc.body);
    }
    return () => {
      ro?.disconnect();
    };
  }, [doc]);

  return (
    <iframe
      ref={ref}
      title="signature-inline-preview"
      className="w-full border-0 block bg-transparent"
      style={{ height }}
    />
  );
}
