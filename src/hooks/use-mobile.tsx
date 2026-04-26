import * as React from "react";

// Aligned with Tailwind's `lg` breakpoint so tablets (iPad portrait ~810px,
// iPad landscape 1024px) get the mobile-optimized layout — TopNav and
// RightRail are also gated on `lg`, so this keeps everything consistent.
const MOBILE_BREAKPOINT = 1024;

// Synchronous initializer prevents the first-render flash where mobile pages
// briefly mount the desktop layout before swapping to mobile.
const getIsMobile = () => {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
};

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(getIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    mql.addEventListener("change", onChange);
    // Re-sync in case viewport changed between SSR-style init and hydration.
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
