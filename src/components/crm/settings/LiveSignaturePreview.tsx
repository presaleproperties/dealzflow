import { useEffect, useMemo, useRef, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { sanitizeSignatureHtml } from '@/lib/sanitizeSignature';

type Props = {
  /** Raw HTML to render. Will be sanitized before display. */
  html: string;
  /** Optional context block above the signature (e.g. faux email body). */
  withEmailContext?: boolean;
  /** Force initial device. Defaults to 'desktop'. */
  defaultDevice?: 'desktop' | 'mobile';
};

/**
 * Live, isolated, sanitized preview of an HTML email signature.
 *
 * - Renders inside a sandboxed iframe so styles can't leak in/out of the app.
 * - Debounces updates (~120ms) for smooth typing.
 * - Sanitizes via DOMPurify before injecting.
 * - Includes desktop/mobile width toggle.
 * - When `withEmailContext` is true, shows a faux email body so the user sees
 *   how the signature looks at the bottom of a real message.
 */
export default function LiveSignaturePreview({
  html,
  withEmailContext = true,
  defaultDevice = 'desktop',
}: Props) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>(defaultDevice);
  const [debounced, setDebounced] = useState(html);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Debounce updates so typing doesn't thrash the iframe
  useEffect(() => {
    const t = setTimeout(() => setDebounced(html), 120);
    return () => clearTimeout(t);
  }, [html]);

  const safeHtml = useMemo(() => sanitizeSignatureHtml(debounced || '').html, [debounced]);

  const doc = useMemo(() => {
    const body = safeHtml.trim()
      ? safeHtml
      : `<div style="color:#9ca3af;font-style:italic;padding:24px 0;text-align:center;">
           Your signature preview will appear here as you type.
         </div>`;

    const context = withEmailContext
      ? `<div style="color:#374151;margin-bottom:24px;">
           <p style="margin:0 0 12px 0;">Hi {{first_name}},</p>
           <p style="margin:0 0 12px 0;">Thanks for reaching out — happy to help.</p>
           <p style="margin:0 0 24px 0;">Best,</p>
         </div>
         <hr style="border:0;border-top:1px solid #e5e7eb;margin:0 0 16px 0;" />`
      : '';

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html,body { margin:0; padding:20px; background:#ffffff;
    font:14px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color:#111827; }
  img { max-width:100%; height:auto; }
  a { color:#2563eb; }
  table { border-collapse:collapse; }
</style>
</head>
<body>${context}${body}</body>
</html>`;
  }, [safeHtml, withEmailContext]);

  // Write the doc whenever it changes
  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    const cdoc = frame.contentDocument;
    if (!cdoc) return;
    cdoc.open();
    cdoc.write(doc);
    cdoc.close();
  }, [doc]);

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border/40 bg-card/60 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Live preview
        </span>
        <div className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-background p-0.5">
          <button
            type="button"
            onClick={() => setDevice('desktop')}
            className={`h-6 px-2 inline-flex items-center gap-1 rounded text-[11px] font-medium transition-colors ${
              device === 'desktop'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Desktop width"
          >
            <Monitor className="h-3 w-3" />
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setDevice('mobile')}
            className={`h-6 px-2 inline-flex items-center gap-1 rounded text-[11px] font-medium transition-colors ${
              device === 'mobile'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Mobile width"
          >
            <Smartphone className="h-3 w-3" />
            Mobile
          </button>
        </div>
      </div>

      {/* Frame */}
      <div className="p-3 flex justify-center bg-muted/10">
        <iframe
          ref={iframeRef}
          title="Signature live preview"
          sandbox="allow-same-origin"
          className="bg-white border border-border/40 rounded-md shadow-sm transition-all"
          style={{
            width: device === 'desktop' ? '100%' : '375px',
            maxWidth: '100%',
            height: 360,
          }}
        />
      </div>
    </div>
  );
}
