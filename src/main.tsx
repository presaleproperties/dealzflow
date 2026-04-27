import { createRoot } from "react-dom/client";
// @ts-ignore
import '@fontsource-variable/plus-jakarta-sans';
import App from "./App.tsx";
import "./index.css";
import { checkBuildIdAndMaybeRefresh } from "./lib/hardRefresh";
import { startOutboxEngine } from "./lib/offlineOutbox";

// Boot the offline SMS outbox sync engine. Drains queued messages on
// online/visibility/focus events and at startup.
startOutboxEngine();

// Compare compiled-in BUILD_ID vs. last-seen. On mismatch, purge SW + caches
// and reload once. Guarantees PWA users pick up new CSS / safe-area fixes
// after a deploy (or after re-installing to home screen).
void checkBuildIdAndMaybeRefresh();

// ── Service worker bootstrap ─────────────────────────────────────────────
// We register a MINIMAL asset-only SW (public/sw.js) that caches Vite's
// hashed /assets/* files. It NEVER caches index.html or API responses, so
// the "old version flashing" bug cannot recur.
//
// On boot we also evict any *foreign* SW (different script URL) left over
// from older deploys, then register ours. The new-version prompt is driven
// by useServiceWorkerUpdate (waiting-worker lifecycle) + useBuildVersionCheck
// (index.html hash poll) as a belt-and-braces safety net.

const SW_URL = "/sw.js";
const RELOAD_FLAG = "__sw_evicted_v2";

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  (async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();

      // Unregister any SW that isn't ours (legacy / Workbox / etc.)
      const foreign = regs.filter((r) => {
        const scriptURL =
          r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
        return scriptURL && !scriptURL.endsWith(SW_URL);
      });
      const evicted = foreign.length > 0;
      await Promise.all(foreign.map((r) => r.unregister().catch(() => {})));

      // If we evicted a stale foreign SW, also nuke caches once and reload.
      if (evicted && !sessionStorage.getItem(RELOAD_FLAG)) {
        if (typeof caches !== "undefined") {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
        }
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
        return;
      }

      // Register our asset-only SW once the page is loaded.
      window.addEventListener("load", () => {
        navigator.serviceWorker.register(SW_URL).catch(() => {
          /* registration failures are non-fatal */
        });
      });
    } catch {
      /* ignore */
    }
  })();
}

createRoot(document.getElementById("root")!).render(<App />);
