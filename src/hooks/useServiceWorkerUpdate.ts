import { useEffect, useState } from "react";

export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleRegistration = (registration: ServiceWorkerRegistration) => {
      // Already waiting (page loaded after update was found)
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setUpdateAvailable(true);
        return;
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            setWaitingWorker(newWorker);
            setUpdateAvailable(true);
          }
        });
      });
    };

    navigator.serviceWorker.ready.then(handleRegistration);

    // Poll every 60s to check for updates
    const interval = setInterval(() => {
      navigator.serviceWorker.ready.then((r) => r.update());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const applyUpdate = () => {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
    setTimeout(() => window.location.reload(), 500);
  };

  return { updateAvailable, applyUpdate };
}
