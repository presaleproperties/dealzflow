// RouteHydrationGate
// ---------------------------------------------------------------------------
// Global route-level loader. Shows the branded PageLoader on every page
// refresh until BOTH:
//   1) supabase auth has resolved (loading === false)
//   2) the React Query IndexedDB persister has had a tick to hydrate cached
//      entries (one rAF after auth resolves)
//
// This replaces the previous behaviour where individual pages would briefly
// flash empty-states / "connect ReZen" / login redirects during the gap
// between F5 and queries hydrating.

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { PageLoader } from "@/components/ui/page-loader";

interface Props {
  children: ReactNode;
}

export function RouteHydrationGate({ children }: Props) {
  const { loading } = useAuth();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (loading) return;
    // Yield one frame so React Query observers can pull persisted entries
    // out of IndexedDB before we paint the route.
    const id = window.requestAnimationFrame(() => setHydrated(true));
    return () => window.cancelAnimationFrame(id);
  }, [loading]);

  if (loading || !hydrated) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <PageLoader />
      </div>
    );
  }

  return <>{children}</>;
}
