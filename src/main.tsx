import { createRoot } from "react-dom/client";
// @ts-ignore
import '@fontsource-variable/plus-jakarta-sans';
import App from "./App.tsx";
import "./index.css";

// Kill any service workers that previously cached the old CRM build.
// One-time evict — every existing tab/install will unregister its SW on
// next load and force a clean fetch. Push notifications via sw-push.js are
// temporarily disabled; they'll be re-wired through a clean registration flow.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) {
      reg.unregister().catch(() => {});
    }
  }).catch(() => {});

  if (typeof caches !== "undefined") {
    caches.keys().then((keys) => {
      for (const k of keys) caches.delete(k).catch(() => {});
    }).catch(() => {});
  }
}

createRoot(document.getElementById("root")!).render(<App />);
