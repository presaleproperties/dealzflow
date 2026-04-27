import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Eye, EyeOff, Ruler, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Responsive Checklist
 * --------------------
 * Loads the live app inside iframes scaled to common phone & tablet sizes,
 * then audits each frame for "gap" issues:
 *   - non-zero <body> margin
 *   - <html>/<body> background that doesn't fill the safe areas
 *   - first/last in-flow children not touching the viewport edges
 *   - presence of `env(safe-area-inset-*)` usage
 *
 * The page is intentionally self-contained — it does not require routes
 * inside the previewed app to be modified. It is gated behind /dev so it
 * doesn't ship in production navigation.
 */

type DevicePreset = {
  id: string;
  label: string;
  os: 'iOS' | 'Android';
  width: number;
  height: number;
  /** Approximate safe-area insets used to draw guide lines in the overlay. */
  safe: { top: number; bottom: number };
  notes?: string;
};

const DEVICES: DevicePreset[] = [
  { id: 'se',          label: 'iPhone SE (3rd)',     os: 'iOS',     width: 375, height: 667, safe: { top: 20, bottom: 0  }, notes: 'No notch · home button' },
  { id: 'mini',        label: 'iPhone 13 mini',      os: 'iOS',     width: 375, height: 812, safe: { top: 50, bottom: 34 } },
  { id: '15',          label: 'iPhone 15',           os: 'iOS',     width: 393, height: 852, safe: { top: 59, bottom: 34 }, notes: 'Dynamic Island' },
  { id: '15pm',        label: 'iPhone 15 Pro Max',   os: 'iOS',     width: 430, height: 932, safe: { top: 59, bottom: 34 }, notes: 'Dynamic Island' },
  { id: 'pixel8',      label: 'Pixel 8',             os: 'Android', width: 412, height: 915, safe: { top: 24, bottom: 16 } },
  { id: 'galaxys24',   label: 'Galaxy S24',          os: 'Android', width: 360, height: 800, safe: { top: 24, bottom: 24 } },
  { id: 'fold',        label: 'Galaxy Z Fold (cover)', os: 'Android', width: 344, height: 882, safe: { top: 24, bottom: 24 }, notes: 'Narrowest modern phone' },
];

const ROUTES = [
  { id: 'dashboard',     label: 'Dashboard',     path: '/dashboard' },
  { id: 'crm-leads',     label: 'CRM · Leads',   path: '/crm/leads' },
  { id: 'crm-chats',     label: 'CRM · Chats',   path: '/crm/chats' },
  { id: 'crm-pipeline',  label: 'CRM · Pipeline',path: '/crm/pipeline' },
  { id: 'crm-calendar',  label: 'CRM · Calendar',path: '/crm/calendar' },
  { id: 'crm-email',     label: 'CRM · Email',   path: '/crm/email' },
];

type Finding = {
  level: 'ok' | 'warn' | 'error';
  title: string;
  detail: string;
};

const ZERO_FINDINGS: Finding[] = [];

export default function ResponsiveChecklistPage() {
  const [routePath, setRoutePath] = useState(ROUTES[1].path);
  const [showOverlay, setShowOverlay] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:opacity-80">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-primary" />
            <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Responsive Checklist</h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <select
              value={routePath}
              onChange={(e) => setRoutePath(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Route to preview"
            >
              {ROUTES.map((r) => (
                <option key={r.id} value={r.path}>{r.label} — {r.path}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowOverlay((v) => !v)}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background text-[12.5px] hover:bg-muted/40"
            >
              {showOverlay ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showOverlay ? 'Hide overlay' : 'Show overlay'}
            </button>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background text-[12.5px] hover:bg-muted/40"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Re-audit
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 sm:px-6 py-6">
        <p className="text-[13px] text-muted-foreground mb-5 max-w-3xl">
          Each frame loads the selected route at the device's viewport size and runs an in-page audit
          for side / top / bottom gaps. Findings refresh when you change route or click <strong>Re-audit</strong>.
          Red guide lines mark the device safe-area insets; ideally your app's content fills the frame
          and the bottom navigation sits flush above the bottom safe-area line.
        </p>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
          {DEVICES.map((d) => (
            <DeviceFrame
              key={d.id + ':' + reloadKey}
              device={d}
              routePath={routePath}
              showOverlay={showOverlay}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function DeviceFrame({
  device,
  routePath,
  showOverlay,
}: {
  device: DevicePreset;
  routePath: string;
  showOverlay: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [findings, setFindings] = useState<Finding[]>(ZERO_FINDINGS);
  const [loaded, setLoaded] = useState(false);

  // Scale frame so the device fits the card (max 300px wide preview).
  const PREVIEW_W = 300;
  const scale = PREVIEW_W / device.width;
  const scaledH = device.height * scale;

  useEffect(() => {
    setLoaded(false);
    setFindings(ZERO_FINDINGS);
  }, [routePath]);

  function audit() {
    const f = iframeRef.current;
    if (!f) return;
    let doc: Document | null = null;
    try {
      doc = f.contentDocument;
    } catch {
      setFindings([{ level: 'warn', title: 'Cross-origin', detail: 'Cannot inspect frame contents (different origin).' }]);
      return;
    }
    if (!doc || !doc.body) {
      setFindings([{ level: 'warn', title: 'No document', detail: 'Frame did not expose a document yet.' }]);
      return;
    }

    const out: Finding[] = [];
    const win = f.contentWindow!;
    const html = doc.documentElement;
    const body = doc.body;
    const htmlStyle = win.getComputedStyle(html);
    const bodyStyle = win.getComputedStyle(body);

    // 1. body margin
    const bm = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].map((k) => parseFloat((bodyStyle as any)[k] || '0'));
    if (bm.some((n) => n > 0.5)) {
      out.push({ level: 'error', title: 'Body has margin', detail: `body margin = ${bm.map((n) => Math.round(n)).join(' / ')}px — should be 0 for edge-to-edge.` });
    }

    // 2. html / body background
    const htmlBg = htmlStyle.backgroundColor;
    if (!htmlBg || htmlBg === 'rgba(0, 0, 0, 0)' || htmlBg === 'transparent') {
      out.push({ level: 'warn', title: '<html> background is transparent', detail: 'Safe-areas (notch/home indicator) may show a white strip on iOS. Set background-color on html.' });
    }

    // 3. first/last meaningful child positioning vs viewport edges
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    const root = doc.querySelector('#root') ?? body;
    const rect = (root as HTMLElement).getBoundingClientRect();
    if (rect.left > 1) {
      out.push({ level: 'error', title: 'Left gap', detail: `#root left = ${rect.left.toFixed(1)}px (should be 0).` });
    }
    if (vw - rect.right > 1) {
      out.push({ level: 'error', title: 'Right gap', detail: `#root right gap = ${(vw - rect.right).toFixed(1)}px (should be 0).` });
    }

    // 4. fixed bottom nav height & flush check
    const fixedBottom = Array.from(doc.querySelectorAll<HTMLElement>('nav, [data-bottom-nav], .bottom-nav'))
      .map((el) => ({ el, r: el.getBoundingClientRect(), s: win.getComputedStyle(el) }))
      .filter(({ s }) => s.position === 'fixed' || s.position === 'sticky');
    if (fixedBottom.length === 0) {
      out.push({ level: 'warn', title: 'No fixed bottom nav detected', detail: 'No <nav> with fixed/sticky position found — confirm the screen is supposed to render one.' });
    } else {
      const closestToBottom = fixedBottom.reduce((a, b) => (b.r.bottom > a.r.bottom ? b : a));
      const dist = vh - closestToBottom.r.bottom;
      if (dist > 2) {
        out.push({ level: 'warn', title: 'Bottom nav not flush', detail: `Distance from bottom = ${dist.toFixed(1)}px. Expected 0 (safe-area handled inside the pill).` });
      }
    }

    // 5. safe-area usage — quick string scan of inline + computed paddings
    const usesSafeArea = /env\s*\(\s*safe-area-inset/.test(doc.documentElement.outerHTML);
    if (!usesSafeArea) {
      out.push({ level: 'warn', title: 'No safe-area-inset detected', detail: 'Inline HTML does not reference env(safe-area-inset-*). On iOS Pro Max, content may sit under the notch or home indicator.' });
    }

    // 6. horizontal overflow
    if (doc.documentElement.scrollWidth > vw + 1) {
      out.push({ level: 'error', title: 'Horizontal overflow', detail: `scrollWidth (${doc.documentElement.scrollWidth}px) > viewport (${vw}px). Something is bleeding past the right edge.` });
    }

    setFindings(out);
  }

  const summary = useMemo(() => {
    const errors = findings.filter((f) => f.level === 'error').length;
    const warns = findings.filter((f) => f.level === 'warn').length;
    return { errors, warns };
  }, [findings]);

  return (
    <article className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold tracking-[-0.01em] truncate">{device.label}</h3>
          <p className="text-[10.5px] text-muted-foreground tracking-wide uppercase">
            {device.os} · {device.width}×{device.height}{device.notes ? ` · ${device.notes}` : ''}
          </p>
        </div>
        <SummaryBadge errors={summary.errors} warns={summary.warns} loaded={loaded} />
      </div>

      <div className="p-4 flex justify-center bg-[hsl(var(--muted)/0.25)]">
        <div
          className="relative rounded-[28px] bg-black p-1.5 shadow-lg"
          style={{ width: PREVIEW_W + 12, height: scaledH + 12 }}
        >
          <div
            className="relative rounded-[22px] overflow-hidden bg-background"
            style={{ width: PREVIEW_W, height: scaledH }}
          >
            <iframe
              ref={iframeRef}
              key={routePath}
              title={`${device.label} preview`}
              src={routePath}
              onLoad={() => { setLoaded(true); setTimeout(audit, 600); }}
              style={{
                width: device.width,
                height: device.height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                border: '0',
              }}
            />
            {showOverlay && (
              <SafeAreaOverlay
                width={PREVIEW_W}
                height={scaledH}
                top={device.safe.top * scale}
                bottom={device.safe.bottom * scale}
              />
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border">
        {!loaded ? (
          <p className="text-[12px] text-muted-foreground">Loading…</p>
        ) : findings.length === 0 ? (
          <div className="flex items-center gap-2 text-[12.5px] text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
            No layout issues detected.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px]">
                <span
                  className={
                    f.level === 'error'
                      ? 'mt-0.5 inline-flex items-center justify-center rounded-full bg-destructive/10 text-destructive p-0.5'
                      : f.level === 'warn'
                        ? 'mt-0.5 inline-flex items-center justify-center rounded-full bg-amber-500/10 text-amber-600 p-0.5'
                        : 'mt-0.5 inline-flex items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 p-0.5'
                  }
                >
                  {f.level === 'error' ? <AlertTriangle className="w-3 h-3" /> : f.level === 'warn' ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{f.title}</p>
                  <p className="text-muted-foreground leading-snug">{f.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function SafeAreaOverlay({
  width, height, top, bottom,
}: { width: number; height: number; top: number; bottom: number }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Top safe-area band */}
      {top > 0 && (
        <div
          className="absolute left-0 right-0 top-0"
          style={{ height: top, background: 'hsl(0 80% 60% / 0.12)', borderBottom: '1px dashed hsl(0 80% 60% / 0.7)' }}
        >
          <span className="absolute top-1 left-1 text-[8px] font-semibold text-red-600 uppercase tracking-wider">safe top</span>
        </div>
      )}
      {/* Bottom safe-area band */}
      {bottom > 0 && (
        <div
          className="absolute left-0 right-0 bottom-0"
          style={{ height: bottom, background: 'hsl(0 80% 60% / 0.12)', borderTop: '1px dashed hsl(0 80% 60% / 0.7)' }}
        >
          <span className="absolute bottom-1 right-1 text-[8px] font-semibold text-red-600 uppercase tracking-wider">safe bottom</span>
        </div>
      )}
      {/* Side rulers — 1px guides at left/right edges */}
      <div className="absolute top-0 bottom-0 left-0 w-px bg-red-500/40" />
      <div className="absolute top-0 bottom-0 right-0 w-px bg-red-500/40" />
    </div>
  );
}

function SummaryBadge({ errors, warns, loaded }: { errors: number; warns: number; loaded: boolean }) {
  if (!loaded) {
    return <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Loading</span>;
  }
  if (errors === 0 && warns === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
        <CheckCircle2 className="w-3 h-3" /> Clean
      </span>
    );
  }
  return (
    <span
      className={
        'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ' +
        (errors > 0 ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600')
      }
    >
      <AlertTriangle className="w-3 h-3" /> {errors > 0 ? `${errors} issue${errors === 1 ? '' : 's'}` : `${warns} warning${warns === 1 ? '' : 's'}`}
    </span>
  );
}
