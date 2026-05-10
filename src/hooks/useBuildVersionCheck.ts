import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Polls the deployed index.html and detects when a new build is live.
 * Works for PWA-installed users AND regular browser users — no service
 * worker required (SWs are intentionally evicted in main.tsx).
 *
 * Strategy: hash the <script type="module"> src tags in /index.html
 * (Vite emits content-hashed filenames per build). If the hash changes
 * vs. what we recorded on first load, a new version is live.
 *
 * NEW (auto-apply on PWA): when the app becomes visible after being in
 * the background — the common case where an installed iOS PWA shows a
 * stale page from memory — we silently reload to the new build, as long
 * as it's safe (no focused input, no open dialog/sheet, no media playing).
 */

const POLL_INTERVAL_MS = 60_000; // 1 min
const STORAGE_KEY = "__build_hash_v1";
const HIDDEN_AUTO_RELOAD_MS = 5 * 60_000; // 5 min in background → safe to auto-reload

async function fetchBuildHash(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?_v=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Collect every hashed asset reference (script + link rel=modulepreload + stylesheet).
    const matches = html.match(/(?:src|href)="\/assets\/[^"]+"/g);
    if (!matches || matches.length === 0) return null;
    return matches.sort().join("|");
  } catch {
    return null;
  }
}

function isSafeToAutoReload(): boolean {
  if (typeof document === "undefined") return false;
  // Don't yank the page out from under a typing user.
  const ae = document.activeElement as HTMLElement | null;
  if (ae) {
    const tag = ae.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
    if (ae.isContentEditable) return false;
  }
  // Don't reload while a dialog/sheet/popover is open.
  if (
    document.querySelector(
      '[role="dialog"], [data-state="open"][role="menu"], [data-radix-popper-content-wrapper]'
    )
  ) {
    return false;
  }
  // Don't reload while audio/video is playing.
  const media = Array.from(
    document.querySelectorAll("audio, video")
  ) as HTMLMediaElement[];
  if (media.some((m) => !m.paused && !m.ended)) return false;
  return true;
}

async function silentReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
  } catch {
    /* ignore */
  }
  sessionStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

export function useBuildVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const hiddenSinceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function check(opts: { fromVisibility?: boolean } = {}) {
      const current = await fetchBuildHash();
      if (cancelled || !current) return;

      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (!stored) {
        sessionStorage.setItem(STORAGE_KEY, current);
        return;
      }
      if (stored !== current) {
        // Auto-apply silently when the user just brought the PWA back to
        // the foreground after a meaningful gap — that's exactly the
        // "stale page on relaunch" complaint. Only do this if the page
        // is in a safe state (no typing, no open modal).
        const hiddenFor =
          hiddenSinceRef.current != null
            ? Date.now() - hiddenSinceRef.current
            : 0;
        const shouldAutoReload =
          opts.fromVisibility &&
          hiddenFor >= HIDDEN_AUTO_RELOAD_MS &&
          isSafeToAutoReload();
        if (shouldAutoReload) {
          silentReload();
          return;
        }
        setUpdateAvailable(true);
      }
    }

    // Initial baseline + on-focus + interval polling.
    check();
    intervalId = setInterval(() => check(), POLL_INTERVAL_MS);

    const onFocus = () => check();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
      } else {
        check({ fromVisibility: true });
        // Reset after the check fires so subsequent foreground events
        // don't keep re-triggering an auto-reload off a stale timestamp.
        hiddenSinceRef.current = null;
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    await silentReload();
  }, []);

  return { updateAvailable, applyUpdate };
}
