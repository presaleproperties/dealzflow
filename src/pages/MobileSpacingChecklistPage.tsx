import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Circle, ExternalLink, RefreshCw, Smartphone,
  Ruler, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Mobile Spacing Regression Checklist
 * -----------------------------------
 * QA tool for the edge-to-edge mobile redesign. For every primary route,
 * the tester verifies three contracts at iPhone 15 Pro Max width (430px),
 * with safe-area guides drawn so notch / home-indicator overlap is obvious:
 *
 *   1. Header is edge-to-edge (background flush to both screen edges,
 *      respects top safe-area inset).
 *   2. List rows / primary content reach the screen edges (no leftover
 *      mobile horizontal gutter on lists; cards may keep internal padding).
 *   3. Bottom nav is flush to the bottom (no float, no margin) and the
 *      home-indicator safe-area sits inside the bar.
 *
 * State is persisted in localStorage so testers can resume between sessions.
 * Gated under /dev so it never ships in primary navigation.
 */

type RouteEntry = {
  path: string;
  label: string;
  group: 'Workspace' | 'CRM' | 'Settings';
  notes?: string;
};

const ROUTES: RouteEntry[] = [
  // Workspace
  { path: '/dashboard', label: 'Dashboard', group: 'Workspace' },
  { path: '/pipeline', label: 'Pipeline', group: 'Workspace' },
  { path: '/deals', label: 'Deals', group: 'Workspace' },
  { path: '/payouts', label: 'Payouts', group: 'Workspace' },
  { path: '/inventory', label: 'Client Inventory', group: 'Workspace' },
  { path: '/expenses', label: 'Expenses', group: 'Workspace' },
  { path: '/forecast', label: 'Forecast', group: 'Workspace' },
  { path: '/analytics', label: 'Analytics', group: 'Workspace' },
  { path: '/network', label: 'Network', group: 'Workspace' },
  // CRM
  { path: '/crm/leads', label: 'Leads', group: 'CRM' },
  { path: '/crm/pipeline', label: 'CRM Pipeline', group: 'CRM' },
  { path: '/crm/chats', label: 'Chats', group: 'CRM' },
  { path: '/crm/calendar', label: 'Calendar', group: 'CRM' },
  { path: '/crm/email', label: 'Email Center', group: 'CRM' },
  { path: '/crm/sms', label: 'SMS Center', group: 'CRM' },
  { path: '/crm/templates', label: 'Templates', group: 'CRM' },
  { path: '/crm/reports', label: 'Reports', group: 'CRM' },
  { path: '/crm/automations', label: 'Automations', group: 'CRM', notes: 'Owner/admin only' },
  { path: '/crm/integrations', label: 'Integrations', group: 'CRM', notes: 'Owner/admin only' },
  { path: '/crm/behavior', label: 'Behavior Dashboard', group: 'CRM' },
  // Settings
  { path: '/settings', label: 'Settings', group: 'Settings' },
  { path: '/crm/settings', label: 'CRM Settings', group: 'Settings', notes: 'Owner/admin only' },
];

type CheckKey = 'header' | 'list' | 'bottomNav';

const CHECK_DEFS: Array<{ key: CheckKey; label: string; help: string }> = [
  {
    key: 'header',
    label: 'Header edge-to-edge',
    help: 'Page header background reaches both screen edges and sits below the top safe-area inset (no white strip under the notch).',
  },
  {
    key: 'list',
    label: 'List rows edge-to-edge',
    help: 'Primary list rows touch both screen edges. Cards/sections may keep internal padding.',
  },
  {
    key: 'bottomNav',
    label: 'Bottom nav flush + safe-area',
    help: 'Tab bar is flat against the bottom edge (no float, no rounded margin) and home-indicator clearance is inside the bar — no extra gap.',
  },
];

type CheckState = Record<string /* path */, Partial<Record<CheckKey, boolean>>>;

const STORAGE_KEY = 'mobile-spacing-checklist-v1';
// iPhone 15 Pro Max — canonical mobile breakpoint for the audit
const FRAME_W = 430;
const FRAME_H = 720;
const SAFE_TOP = 59;
const SAFE_BOTTOM = 34;

export default function MobileSpacingChecklistPage() {
  const [state, setState] = useState<CheckState>({});
  const [activePath, setActivePath] = useState<string>(ROUTES[0].path);
  const [reloadTick, setReloadTick] = useState(0);
  const [showGuides, setShowGuides] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* noop */ }
  }, [state]);

  function toggle(path: string, key: CheckKey) {
    setState(prev => ({
      ...prev,
      [path]: { ...prev[path], [key]: !prev[path]?.[key] },
    }));
  }

  function resetAll() {
    if (!confirm('Reset every check on every route?')) return;
    setState({});
  }

  const summary = useMemo(() => {
    let total = 0;
    let passed = 0;
    let failing: RouteEntry[] = [];
    for (const r of ROUTES) {
      const checks = state[r.path] ?? {};
      let routePass = 0;
      for (const c of CHECK_DEFS) {
        total += 1;
        if (checks[c.key]) {
          passed += 1;
          routePass += 1;
        }
      }
      if (routePass < CHECK_DEFS.length) failing.push(r);
    }
    return { total, passed, failing };
  }, [state]);

  const grouped = useMemo(() => {
    const out: Record<RouteEntry['group'], RouteEntry[]> = {
      Workspace: [], CRM: [], Settings: [],
    };
    for (const r of ROUTES) out[r.group].push(r);
    return out;
  }, []);

  const activeRoute = ROUTES.find(r => r.path === activePath) ?? ROUTES[0];
  const iframeSrc = `${activeRoute.path}?__mobile_audit=1`;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-card/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 h-14 px-4 sm:px-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="flex items-center gap-2 ml-2">
            <Smartphone className="w-4 h-4 text-primary" />
            <h1 className="text-[15px] font-semibold tracking-tight">
              Mobile Spacing Regression Checklist
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-[12px] tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">{summary.passed}</span>
              {' / '}{summary.total} checks
            </div>
            <button
              onClick={resetAll}
              className="text-[12px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border/60 hover:bg-muted/60"
            >
              <RefreshCw className="w-3 h-3" />
              Reset
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(360px,420px)_1fr] gap-0 min-h-[calc(100dvh-56px)]">
        {/* Left: route list with checks */}
        <aside className="border-r border-border/60 overflow-y-auto max-h-[calc(100dvh-56px)]">
          <div className="px-4 sm:px-5 py-4 border-b border-border/40">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Audit contract
            </p>
            <ul className="mt-2 space-y-1.5">
              {CHECK_DEFS.map(c => (
                <li key={c.key} className="text-[12px] leading-snug text-muted-foreground">
                  <span className="text-foreground font-medium">{c.label}.</span>{' '}
                  {c.help}
                </li>
              ))}
            </ul>
          </div>

          {(['Workspace', 'CRM', 'Settings'] as const).map(group => (
            <section key={group} className="py-3">
              <h2 className="px-5 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {group}
              </h2>
              <ul className="space-y-0.5">
                {grouped[group].map(route => {
                  const checks = state[route.path] ?? {};
                  const passed = CHECK_DEFS.filter(c => checks[c.key]).length;
                  const isActive = route.path === activePath;
                  const allPass = passed === CHECK_DEFS.length;

                  return (
                    <li key={route.path}>
                      <div
                        className={cn(
                          'group flex items-center gap-2 px-5 py-2.5 cursor-pointer transition-colors',
                          isActive ? 'bg-primary/8' : 'hover:bg-muted/40',
                        )}
                        onClick={() => setActivePath(route.path)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'text-[13.5px] font-medium truncate',
                                isActive ? 'text-foreground' : 'text-foreground/85',
                              )}
                            >
                              {route.label}
                            </span>
                            {allPass && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <code className="font-mono">{route.path}</code>
                            {route.notes && (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {route.notes}
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className="text-[10.5px] tabular-nums text-muted-foreground"
                          aria-label={`${passed} of ${CHECK_DEFS.length} checks pass`}
                        >
                          {passed}/{CHECK_DEFS.length}
                        </span>
                      </div>

                      {/* Per-route check toggles */}
                      <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                        {CHECK_DEFS.map(c => {
                          const on = !!checks[c.key];
                          return (
                            <button
                              key={c.key}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggle(route.path, c.key); }}
                              className={cn(
                                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors',
                                on
                                  ? 'bg-success/12 border-success/30 text-success'
                                  : 'bg-muted/40 border-border/50 text-muted-foreground hover:text-foreground',
                              )}
                              aria-pressed={on}
                            >
                              {on
                                ? <CheckCircle2 className="w-3 h-3" />
                                : <Circle className="w-3 h-3" />}
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </aside>

        {/* Right: device preview */}
        <main className="p-4 sm:p-6 lg:p-8 flex flex-col items-center gap-4 overflow-y-auto max-h-[calc(100dvh-56px)]">
          <div className="w-full max-w-[640px] flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Auditing
              </div>
              <div className="text-[16px] font-semibold tracking-tight truncate">
                {activeRoute.label}{' '}
                <span className="text-muted-foreground font-normal text-[13px] font-mono">
                  {activeRoute.path}
                </span>
              </div>
            </div>
            <button
              onClick={() => setReloadTick(t => t + 1)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] rounded-md border border-border/60 hover:bg-muted/60"
              aria-label="Reload preview"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload
            </button>
            <button
              onClick={() => setShowGuides(s => !s)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] rounded-md border transition-colors',
                showGuides
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'border-border/60 hover:bg-muted/60',
              )}
              aria-pressed={showGuides}
            >
              <Ruler className="w-3.5 h-3.5" />
              Guides
            </button>
            <a
              href={activeRoute.path}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] rounded-md border border-border/60 hover:bg-muted/60"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open
            </a>
          </div>

          <div
            className="relative rounded-[36px] bg-black shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]"
            style={{ padding: 10, width: FRAME_W + 20 }}
          >
            <div
              className="relative overflow-hidden rounded-[28px] bg-background"
              style={{ width: FRAME_W, height: FRAME_H }}
            >
              <iframe
                key={`${activePath}-${reloadTick}`}
                src={iframeSrc}
                title={`Preview of ${activeRoute.label}`}
                className="w-full h-full border-0"
              />

              {showGuides && (
                <>
                  {/* Top safe-area guide */}
                  <div
                    aria-hidden
                    className="absolute left-0 right-0 top-0 pointer-events-none"
                    style={{
                      height: SAFE_TOP,
                      background:
                        'repeating-linear-gradient(45deg, hsl(38 92% 50% / 0.18) 0 6px, transparent 6px 12px)',
                      borderBottom: '1px dashed hsl(38 92% 50% / 0.7)',
                    }}
                  >
                    <span className="absolute left-2 top-1 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      Top safe-area · {SAFE_TOP}px
                    </span>
                  </div>
                  {/* Bottom safe-area guide */}
                  <div
                    aria-hidden
                    className="absolute left-0 right-0 bottom-0 pointer-events-none"
                    style={{
                      height: SAFE_BOTTOM,
                      background:
                        'repeating-linear-gradient(-45deg, hsl(38 92% 50% / 0.18) 0 6px, transparent 6px 12px)',
                      borderTop: '1px dashed hsl(38 92% 50% / 0.7)',
                    }}
                  >
                    <span className="absolute left-2 bottom-1 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      Home-indicator · {SAFE_BOTTOM}px
                    </span>
                  </div>
                  {/* Edge gutter rails */}
                  <div
                    aria-hidden
                    className="absolute top-0 bottom-0 left-0 w-px"
                    style={{ background: 'hsl(var(--primary) / 0.5)' }}
                  />
                  <div
                    aria-hidden
                    className="absolute top-0 bottom-0 right-0 w-px"
                    style={{ background: 'hsl(var(--primary) / 0.5)' }}
                  />
                </>
              )}
            </div>
          </div>

          <div className="text-[11.5px] text-muted-foreground text-center max-w-md">
            Frame is iPhone 15 Pro Max ({FRAME_W}×{FRAME_H}). Hashed bands mark
            the simulated top notch and bottom home-indicator zones — verify
            the header background extends beneath the top band and the bottom
            tab bar fully covers the bottom band.
          </div>

          {summary.failing.length > 0 && (
            <div className="w-full max-w-[640px] mt-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2">
                Still to verify · {summary.failing.length}
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {summary.failing.map(r => (
                  <li key={r.path}>
                    <button
                      onClick={() => setActivePath(r.path)}
                      className="text-[12px] px-2 py-1 rounded-md border border-border/50 hover:bg-muted/60"
                    >
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
