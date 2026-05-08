import * as React from "react";

// `useIsMobile` — true below `lg` (1024). Used by layouts that need real
// desktop room (3-column lead detail, top-nav, side-rail, etc.).
const MOBILE_BREAKPOINT = 1024;

// `useIsCompact` — true below `lg` (1024). As of the tablet redesign,
// tablets render the mobile UI (scaled up via device-tier tokens) instead
// of squeezed desktop layouts. Phones and tablets now share one UI tree;
// real desktop kicks in at ≥1024.
const COMPACT_BREAKPOINT = 1024;

// `useIsTablet` — true 768–1023 (inclusive). Use ONLY for tablet-specific
// affordances (centered max-width, side-sheets, list-rail splits). For
// "is this not a desktop?" use useIsCompact / useIsMobile.
const TABLET_MIN = 768;
const TABLET_MAX = 1023;

const getIsMobile = () => {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
};

const getIsCompact = () => {
  if (typeof window === "undefined") return false;
  return window.innerWidth < COMPACT_BREAKPOINT;
};

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(getIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

export function useIsCompact() {
  const [isCompact, setIsCompact] = React.useState<boolean>(getIsCompact);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT - 1}px)`);
    const onChange = () => setIsCompact(window.innerWidth < COMPACT_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isCompact;
}

const getIsTablet = () => {
  if (typeof window === "undefined") return false;
  const w = window.innerWidth;
  return w >= TABLET_MIN && w <= TABLET_MAX;
};

export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean>(getIsTablet);

  React.useEffect(() => {
    const mql = window.matchMedia(
      `(min-width: ${TABLET_MIN}px) and (max-width: ${TABLET_MAX}px)`
    );
    const onChange = () => setIsTablet(getIsTablet());
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isTablet;
}
