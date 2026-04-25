import { createRoot } from "react-dom/client";
// @ts-ignore
import '@fontsource-variable/plus-jakarta-sans';
import App from "./App.tsx";
import "./index.css";

// Kill any service workers that previously cached the old CRM build.
// If we find a stale SW, unregister + nuke caches + force ONE hard reload
// so the user lands on the fresh build immediately (no second flash).
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  const RELOAD_FLAG = "__sw_evicted_v1";
  (async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      const hadSW = regs.length > 0;

      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));

      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
      }

      // If we just evicted a stale SW for the first time, reload once so
      // the next paint comes from the network — not the killed cache.
      if (hadSW && !sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
      }
    } catch {
      /* ignore */
    }
  })();
}

createRoot(document.getElementById("root")!).render(<App />);
