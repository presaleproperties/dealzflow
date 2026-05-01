// useDashboardEmptyState
// ---------------------------------------------------------------------------
// Shared empty-state gate used by DashboardPage, ForecastPage, PayoutsPage,
// and any other surface that decides between "show onboarding / Connect
// ReZen" vs. "show real data".
//
// The rule: never claim a workspace is empty until BOTH the platform
// connections query AND the synced-transactions query have actually
// resolved. Otherwise a hard refresh briefly flashes the Connect-ReZen
// onboarding while react-query is still hydrating from IndexedDB.

import { usePlatformConnections, useSyncedTransactions } from '@/hooks/usePlatformConnections';

export interface DashboardEmptyState {
  /** True while the underlying queries are still loading or have not
   *  resolved at least once. Pages should render a PageLoader (or skeleton)
   *  while this is true and NEVER render onboarding/empty UI. */
  isLoading: boolean;
  /** True only after both queries have resolved AND there is nothing
   *  connected and no synced transactions. Safe to gate empty/onboarding
   *  UI on this. */
  isEmpty: boolean;
  /** True once the user has at least one platform connection. */
  hasConnection: boolean;
  /** Convenience pass-through for callers that need the data. */
  syncedTransactionsCount: number;
}

export function useDashboardEmptyState(): DashboardEmptyState {
  const {
    data: connections = [],
    isLoading: connLoading,
    isFetched: connFetched,
  } = usePlatformConnections();

  const {
    data: syncedTransactions = [],
    isLoading: txLoading,
    isFetched: txFetched,
  } = useSyncedTransactions();

  const isLoading = connLoading || txLoading || !connFetched || !txFetched;
  const hasConnection = connections.length > 0;
  const isEmpty = !isLoading && !hasConnection && syncedTransactions.length === 0;

  return {
    isLoading,
    isEmpty,
    hasConnection,
    syncedTransactionsCount: syncedTransactions.length,
  };
}
