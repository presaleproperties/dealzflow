import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";

/**
 * Dev-only floating control that simulates iPhone safe-area insets so you
 * can preview the bottom nav (icon row, FAB, home-indicator gutter) at
 * different iPhone sizes — without re-installing the PWA.
 *
 * What it does
 *  - Overrides --safe-area-inset-bottom (and -top) at :root
 *  - Adds a fake "home indicator" line so spacing is visible
 *  - Swaps width/height-equivalent paddings via CSS vars only — no layout
 *    breaking, no resize of the browser itself
 *
 * Visibility: only rendered on viewports < 1024px AND when ?safearea=1
 *   is in the URL OR localStorage.__safearea_preview = '1'.
 *   This keeps it out of normal use unless explicitly opted in.
 */

type Device = {
  id: string;
  label: string;
  /** Bottom safe-area inset (home-indicator gutter) in px. */
  bottom: number;
  /** Top safe-area inset (notch / Dynamic Island) in px. */
  top: number;
};

const DEVICES: Device[] = [
  { id: "se", label: "iPhone SE", bottom: 0, top: 20 },
  { id: "13mini", label: "iPhone 13 mini", bottom: 34, top: 50 },
  { id: "14", label: "iPhone 14 / 15", bottom: 34, top: 47 },
  { id: "14plus", label: "iPhone 14 Plus", bottom: 34, top: 47 },
  { id: "15pro", label: "iPhone 15 Pro", bottom: 34, top: 59 },
  { id: "15promax", label: "iPhone 15 Pro Max", bottom: 34, top: 59 },
];

const STORAGE_KEY = "__safearea_preview_device";
const ENABLED_KEY = "__safearea_preview";

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("safearea") === "1") return true;
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function SafeAreaPreview() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>("14");

  // Mount-time enablement check + persisted device.
  useEffect(() => {
    setEnabled(isEnabled());
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && DEVICES.some((d) => d.id === saved)) setActiveId(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Apply / clear the simulated insets.
  useEffect(() => {
    if (!enabled) return;
    const device = DEVICES.find((d) => d.id === activeId);
    if (!device) return;

    const root = document.documentElement;
    // We can't override env() directly — instead, override the CSS vars
    // that the bottom-nav uses. Because BottomNav reads
    // --bottom-nav-safe-pad and --m-top-pad, we re-assign them inline at
    // :root (highest specificity wins for inline styles).
    root.style.setProperty(
      "--bottom-nav-safe-pad",
      `${device.bottom}px`,
      "important"
    );
    root.style.setProperty(
      "--m-top-pad",
      `calc(${device.top}px + 8px)`,
      "important"
    );
    root.style.setProperty(
      "--composer-top-pad",
      `max(${device.top}px, 50px)`,
      "important"
    );
    // Recompute the derived nav height/pad so existing rules pick it up.
    root.style.setProperty(
      "--bottom-nav-height",
      `calc(var(--bottom-nav-icon-row) + var(--bottom-nav-icon-lift, 0px) + ${device.bottom}px)`,
      "important"
    );
    root.style.setProperty(
      "--bottom-nav-pad",
      `calc(var(--bottom-nav-icon-row) + var(--bottom-nav-icon-lift, 0px) + ${device.bottom}px)`,
      "important"
    );

    try {
      localStorage.setItem(STORAGE_KEY, device.id);
    } catch {
      /* ignore */
    }

    return () => {
      root.style.removeProperty("--bottom-nav-safe-pad");
      root.style.removeProperty("--m-top-pad");
      root.style.removeProperty("--composer-top-pad");
      root.style.removeProperty("--bottom-nav-height");
      root.style.removeProperty("--bottom-nav-pad");
    };
  }, [enabled, activeId]);

  if (!enabled) return null;

  const active = DEVICES.find((d) => d.id === activeId) ?? DEVICES[2];

  return (
    <>
      {/* Fake iOS home-indicator line so the simulated gutter is visible. */}
      {active.bottom > 0 && (
        <div
          aria-hidden
          className="lg:hidden fixed left-1/2 -translate-x-1/2 z-[60] pointer-events-none"
          style={{
            bottom: `${Math.max(active.bottom / 2 - 2, 6)}px`,
            width: "134px",
            height: "5px",
            borderRadius: "999px",
            background: "hsl(var(--foreground) / 0.55)",
          }}
        />
      )}

      {/* Floating toggle bubble — bottom-left so it doesn't fight the "+". */}
      <div className="lg:hidden fixed left-3 z-[70] flex flex-col items-start gap-2"
        style={{ bottom: "calc(var(--bottom-nav-height) + 10px)" }}
      >
        {open && (
          <div
            className="rounded-2xl p-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] border backdrop-blur-2xl"
            style={{
              background: "hsl(var(--card) / 0.96)",
              borderColor: "hsl(var(--border) / 0.6)",
              minWidth: "180px",
            }}
          >
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-70">
                Safe-area
              </span>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-full opacity-60 active:scale-90"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {DEVICES.map((d) => {
                const isActive = d.id === activeId;
                return (
                  <button
                    key={d.id}
                    onClick={() => setActiveId(d.id)}
                    className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-[12.5px] active:scale-[0.97] transition-transform"
                    style={{
                      background: isActive
                        ? "hsl(var(--primary) / 0.18)"
                        : "transparent",
                      color: isActive
                        ? "hsl(var(--primary))"
                        : "hsl(var(--foreground))",
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <span>{d.label}</span>
                    <span className="text-[10.5px] opacity-60 tabular-nums">
                      {d.top}/{d.bottom}
                    </span>
                  </button>
                );
              })}
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem(ENABLED_KEY);
                  } catch {
                    /* ignore */
                  }
                  setEnabled(false);
                }}
                className="mt-1 px-2.5 py-1.5 rounded-lg text-[11.5px] opacity-70 active:scale-[0.97]"
                style={{ background: "hsl(var(--muted))" }}
              >
                Disable preview
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Safe-area preview"
          className="h-10 px-3 rounded-full flex items-center gap-2 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.4)] active:scale-95"
          style={{
            background: "hsl(var(--card) / 0.96)",
            border: "1px solid hsl(var(--border) / 0.6)",
            color: "hsl(var(--foreground))",
            backdropFilter: "blur(20px)",
          }}
        >
          <Smartphone className="w-4 h-4" />
          <span className="text-[12px] font-semibold">{active.label}</span>
        </button>
      </div>
    </>
  );
}
