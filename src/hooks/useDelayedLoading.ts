import { useEffect, useState } from 'react';

/**
 * Returns `true` only if `loading` has been true for >= `delay` ms.
 * Prevents skeleton/spinner flash on fast queries (cached / <150ms).
 *
 * Pair with: const showSkeleton = useDelayedLoading(isLoading, 150);
 */
export function useDelayedLoading(loading: boolean, delay = 150): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShow(false);
      return;
    }
    const t = window.setTimeout(() => setShow(true), delay);
    return () => window.clearTimeout(t);
  }, [loading, delay]);

  return show;
}
