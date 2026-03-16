import { useMemo } from 'react';

interface SyncedTransaction {
  id: string;
  close_date: string | null;
  commission_amount: number | null;
  my_net_payout: number | null;
  status: string | null;
  raw_data?: any;
  property_address: string | null;
  sale_price: number | null;
  transaction_type?: string | null;
  agent_name?: string | null;
  [key: string]: any;
}

export interface SyncedPayout {
  id: string;
  close_date: string;
  grossAmount: number;
  netAmount: number; // User's actual take-home (my_net_payout from ReZen)
  status: 'closed' | 'active'; // closed = received, active = upcoming
  property_address: string | null;
  sale_price: number | null;
}

/**
 * Hook that provides income projections from synced transactions.
 * Always uses my_net_payout (user's actual take-home after brokerage/cap deductions).
 * Falls back to commission_amount if my_net_payout is null.
 */
export function useSyncedIncome(syncedTransactions: SyncedTransaction[]) {
  // Convert synced transactions to payout-like objects
  const syncedPayouts = useMemo(() => {
    return syncedTransactions
      .filter(tx => tx.close_date)
      .map(tx => {
        const gross = Number(tx.commission_amount) || 0;
        // Use my_net_payout (ReZen's actual user take-home) — fall back to gross only if null
        const net = tx.my_net_payout != null ? Number(tx.my_net_payout) : gross;
        return {
          id: tx.id,
          close_date: tx.close_date!,
          grossAmount: gross,
          netAmount: net,
          status: (tx.status === 'closed' ? 'closed' : 'active') as 'closed' | 'active',
          property_address: tx.property_address,
          sale_price: Number(tx.sale_price) || 0,
        };
      });
  }, [syncedTransactions]);

  // Get income for a specific month (format: 'YYYY-MM')
  const getMonthIncome = useMemo(() => {
    const monthMap: Record<string, { received: number; projected: number; payouts: SyncedPayout[] }> = {};
    
    for (const p of syncedPayouts) {
      const monthStr = p.close_date.substring(0, 7); // 'YYYY-MM'
      if (!monthMap[monthStr]) {
        monthMap[monthStr] = { received: 0, projected: 0, payouts: [] };
      }
      if (p.status === 'closed') {
        monthMap[monthStr].received += p.netAmount;
      } else {
        monthMap[monthStr].projected += p.netAmount;
      }
      monthMap[monthStr].payouts.push(p);
    }
    
    return monthMap;
  }, [syncedPayouts]);

  // YTD received (closed transactions this year)
  const receivedYTD = useMemo(() => {
    const thisYear = new Date().getFullYear();
    return syncedPayouts
      .filter(p => p.status === 'closed' && p.close_date.startsWith(thisYear.toString()))
      .reduce((sum, p) => sum + p.netAmount, 0);
  }, [syncedPayouts]);

  // Total coming in (active/future transactions)
  const comingIn = useMemo(() => {
    return syncedPayouts
      .filter(p => p.status === 'active')
      .reduce((sum, p) => sum + p.netAmount, 0);
  }, [syncedPayouts]);

  // Total projected income this year (both closed + active)
  const totalThisYear = useMemo(() => {
    const thisYear = new Date().getFullYear();
    return syncedPayouts
      .filter(p => p.close_date.startsWith(thisYear.toString()))
      .reduce((sum, p) => sum + p.netAmount, 0);
  }, [syncedPayouts]);

  // 2026 projected revenue (all deals closing in 2026)
  const projectedRevenue2026 = useMemo(() => {
    return syncedPayouts
      .filter(p => p.close_date.startsWith('2026'))
      .reduce((sum, p) => sum + p.netAmount, 0);
  }, [syncedPayouts]);

  // Gross totals for comparison
  const grossComingIn = useMemo(() => {
    return syncedPayouts
      .filter(p => p.status === 'active')
      .reduce((sum, p) => sum + p.grossAmount, 0);
  }, [syncedPayouts]);

  return {
    syncedPayouts,
    getMonthIncome,
    receivedYTD,
    comingIn,
    totalThisYear,
    projectedRevenue2026,
    grossComingIn,
  };
}
