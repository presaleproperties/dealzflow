import { createRoot } from "react-dom/client";
import '@fontsource-variable/plus-jakarta-sans';
import App from "./App.tsx";
import "./index.css";

// Prevent stale service workers in Lovable preview / iframe contexts
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
  caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
}

createRoot(document.getElementById("root")!).render(<App />);
