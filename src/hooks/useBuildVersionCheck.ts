import { useEffect, useState, useCallback } from "react";

/**
 * Polls the deployed index.html and detects when a new build is live.
 * Works for PWA-installed users AND regular browser users — no service
 * worker required (SWs are intentionally evicted in main.tsx).
 *
 * Strategy: hash the <script type="module"> src tags in /index.html
 * (Vite emits content-hashed filenames per build). If the hash changes
 * vs. what we recorded on first load, a new version is live.
 */

const POLL_INTERVAL_MS = 60_000; // 1 min
const STORAGE_KEY = "__build_hash_v1";

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

export function useBuildVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function check() {
      const current = await fetchBuildHash();
      if (cancelled || !current) return;

      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (!stored) {
        sessionStorage.setItem(STORAGE_KEY, current);
        return;
      }
      if (stored !== current) {
        setUpdateAvailable(true);
      }
    }

    // Initial baseline + on-focus + interval polling.
    check();
    intervalId = setInterval(check, POLL_INTERVAL_MS);

    const onFocus = () => check();
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
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
    // Best-effort: clear caches and any stray SW before reload so the
    // next paint comes from the network.
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
  }, []);

  return { updateAvailable, applyUpdate };
}
