import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Returns true when the viewport is below the mobile breakpoint.
 *
 * IMPORTANT: This hook is computed synchronously on the very first render
 * (using `window.matchMedia` when available) so that the *initial* render
 * already commits to either the mobile or desktop tree. If we returned a
 * placeholder (e.g. `false`) on first render and only flipped after the
 * first effect, components like Lead Detail would mount the desktop tree
 * first and then unmount it in favour of the mobile tree. When children of
 * those trees themselves toggle hook counts (loading → loaded), React can
 * misalign hook slots across renders and throw:
 *   "Rendered more hooks than during the previous render."
 *
 * Computing synchronously eliminates that swap entirely on the client.
 */
function getIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(getIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    // Sync once in case the value changed between render and effect commit.
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
