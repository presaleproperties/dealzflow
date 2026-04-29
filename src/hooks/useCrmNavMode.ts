import { useCallback, useEffect, useState } from 'react';

/**
 * Per-device CRM navigation density.
 * - 'simple' (default): Leads · Pipeline · Email · SMS · Calendar · Settings
 * - 'pro': all 12 tabs (Templates · Scheduler · Behavior · Reports · Automations · Integrations)
 *
 * Stored in localStorage so it persists per-device without a DB migration.
 * Same pattern as Hot Leads filter persistence.
 */
export type CrmNavMode = 'simple' | 'pro';

const KEY = 'crm.navMode';

function read(): CrmNavMode {
  if (typeof window === 'undefined') return 'simple';
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'pro' ? 'pro' : 'simple';
  } catch {
    return 'simple';
  }
}

export function useCrmNavMode(): [CrmNavMode, (next: CrmNavMode) => void] {
  const [mode, setMode] = useState<CrmNavMode>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setMode(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const set = useCallback((next: CrmNavMode) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // ignore
    }
    setMode(next);
    // notify same-tab listeners
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: next }));
  }, []);

  return [mode, set];
}
