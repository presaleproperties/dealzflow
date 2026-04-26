import * as React from "react";

const MOBILE_BREAKPOINT = 768;

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
