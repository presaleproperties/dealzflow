import * as React from "react";

// `useIsMobile` — true below `lg` (1024). Used by layouts that need real
// desktop room (3-column lead detail, top-nav, side-rail, etc.).
const MOBILE_BREAKPOINT = 1024;

// `useIsCompact` — true below `md` (768). Used by page-level switches
// that just need to choose between phone-tuned UI and the regular CRM UI.
// Tablets (≥768) now get the desktop CRM screens (Leads table, Pipeline
// kanban, two-pane Chats, Contacts) instead of the phone-only views.
const COMPACT_BREAKPOINT = 768;

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
