import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";
import { useBuildVersionCheck } from "@/hooks/useBuildVersionCheck";

const DISMISS_KEY = "__update_banner_dismissed_v1";

export function UpdateBanner() {
  const sw = useServiceWorkerUpdate();
  const build = useBuildVersionCheck();
  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);

  const updateAvailable = sw.updateAvailable || build.updateAvailable;

  // Reset dismissal automatically when a *new* update is detected after one
  // has been dismissed in this session.
  useEffect(() => {
    if (!updateAvailable) {
      sessionStorage.removeItem(DISMISS_KEY);
      setDismissed(false);
    }
  }, [updateAvailable]);

  const handleRefresh = async () => {
    setReloading(true);
    if (sw.updateAvailable) {
      sw.applyUpdate();
    } else {
      await build.applyUpdate();
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const visible =
    updateAvailable && !dismissed && !sessionStorage.getItem(DISMISS_KEY);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed top-0 left-0 right-0 z-[100] px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
          role="status"
          aria-live="polite"
        >
          <div
            className="mx-auto max-w-2xl flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl backdrop-blur-2xl border shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)]"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--primary) / 0.96), hsl(var(--primary) / 0.88))",
              color: "hsl(var(--primary-foreground))",
              borderColor: "hsl(var(--primary-foreground) / 0.18)",
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
                style={{ background: "hsl(var(--primary-foreground) / 0.18)" }}
              >
                <Sparkles className="w-4 h-4" strokeWidth={2.4} />
              </span>
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="text-[13.5px] font-semibold truncate">
                  New version available
                </span>
                <span className="text-[11.5px] opacity-80 truncate">
                  Refresh to load the latest UI &amp; data
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleRefresh}
                disabled={reloading}
                className="flex items-center gap-1.5 px-3 h-8 rounded-full text-[12.5px] font-semibold transition-all active:scale-95 disabled:opacity-60"
                style={{
                  background: "hsl(var(--primary-foreground))",
                  color: "hsl(var(--primary))",
                }}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${reloading ? "animate-spin" : ""}`}
                  strokeWidth={2.6}
                />
                {reloading ? "Refreshing" : "Refresh"}
              </button>
              <button
                onClick={handleDismiss}
                className="p-1.5 rounded-full opacity-75 hover:opacity-100 active:scale-90 transition-all"
                style={{ background: "hsl(var(--primary-foreground) / 0.12)" }}
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.4} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
