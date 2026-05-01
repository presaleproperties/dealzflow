// SessionRestoringBanner
// ---------------------------------------------------------------------------
// Inline top-of-viewport banner shown when supabase auth is silently
// recovering a session (transient TOKEN_REFRESHED-without-session — usually
// after sleep/wake or a flaky network). Replaces the old behavior of
// bouncing the user to /auth on every refresh hiccup.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function SessionRestoringBanner() {
  const { restoring } = useAuth();
  // Tiny debounce so a 200ms blip never paints the banner.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!restoring) {
      setShow(false);
      return;
    }
    const t = window.setTimeout(() => setShow(true), 600);
    return () => window.clearTimeout(t);
  }, [restoring]);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[100] flex justify-center pointer-events-none"
      style={{ paddingTop: "max(env(safe-area-inset-top), 0px)" }}
    >
      <div className="pointer-events-auto mt-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur">
        <Loader2 className="h-3 w-3 animate-spin text-primary" />
        Session restoring…
      </div>
    </div>
  );
}
