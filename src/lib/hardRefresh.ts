/**
 * Hard-refresh utility — nukes every client-side cache layer and reloads.
 *
 * Use cases:
 *  - Automatic: BUILD_ID bump on app boot (see main.tsx) — guarantees PWA
 *    users get the newest CSS/assets after reinstall, even if iOS clings
 *    to a stale module preload or safe-area inline style.
 *  - Manual: window.__hardRefresh() exposed for users (or us) to invoke
 *    from the browser console when something looks stale.
 *
 * What gets purged:
 *  - All Service Worker registrations (ours + foreign legacy ones)
 *  - All Cache Storage buckets
 *  - sessionStorage build-hash baseline
 *  - Optional: localStorage version markers
 */

export const BUILD_ID = "2026-05-01-auth-page-cache-bust-1";
const BUILD_ID_KEY = "__app_build_id";

export async function hardRefresh(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
    try {
      sessionStorage.removeItem("__build_hash_v1");
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore — still attempt the reload */
  }

  // Bypass HTTP cache on the reload itself (Safari respects this).
  const url = new URL(window.location.href);
  url.searchParams.set("_hr", Date.now().toString());
  window.location.replace(url.toString());
}

/**
 * Compare the compiled-in BUILD_ID against what we last persisted. On a
 * mismatch (or first run after install), purge caches and reload once.
 *
 * Guarded by sessionStorage so we never enter a reload loop.
 */
export async function checkBuildIdAndMaybeRefresh(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(BUILD_ID_KEY);
    if (stored === BUILD_ID) return;

    // First run on this build — record it. If we had a previous (different)
    // BUILD_ID, purge caches before we let the app render.
    const isUpgrade = stored !== null && stored !== BUILD_ID;
    localStorage.setItem(BUILD_ID_KEY, BUILD_ID);

    if (!isUpgrade) return;

    // Already reloaded this session? Don't loop.
    const RELOAD_FLAG = "__hard_refresh_done";
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, "1");

    await hardRefresh();
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  // Manual escape hatch — call window.__hardRefresh() from the console.
  (window as unknown as { __hardRefresh: typeof hardRefresh }).__hardRefresh =
    hardRefresh;
  (window as unknown as { __BUILD_ID: string }).__BUILD_ID = BUILD_ID;
}
