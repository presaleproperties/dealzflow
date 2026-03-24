import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { addDays, startOfDay, isBefore, isAfter } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface NeedsAttentionProps {
  syncedTransactions: any[];
}

export function NeedsAttention({ syncedTransactions }: NeedsAttentionProps) {
  const navigate = useNavigate();
  const now = startOfDay(new Date());

  const alerts = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      subtitle: string;
      amount: number;
      link: string;
      severity: 'error' | 'warning' | 'info';
    }> = [];

    // Synced active deals with past close dates (flagged)
    const flaggedSynced = syncedTransactions.filter((tx: any) => {
      if (tx.status !== 'active') return false;
      return tx.close_date && isBefore(new Date(tx.close_date), now);
    });
    if (flaggedSynced.length > 0) {
      const flaggedValue = flaggedSynced.reduce((s: number, tx: any) => s + Number(tx.raw_data?.myNetPayout?.amount || tx.commission_amount || 0), 0);
      items.push({
        id: 'flagged-synced',
        title: `${flaggedSynced.length} active deal${flaggedSynced.length > 1 ? 's' : ''} past close date`,
        subtitle: 'These deals are still active but their close date has passed',
        amount: flaggedValue,
        link: '/deals?filter=overdue',
        severity: 'error',
      });
    }

    // Closing this week from synced
    const weekOut = addDays(now, 7);
    const closingThisWeek = syncedTransactions.filter((tx: any) => {
      if (tx.status === 'closed') return false;
      return tx.close_date && isAfter(new Date(tx.close_date), now) && isBefore(new Date(tx.close_date), weekOut);
    });
    if (closingThisWeek.length > 0) {
      const weekValue = closingThisWeek.reduce((s: number, tx: any) => s + Number(tx.raw_data?.myNetPayout?.amount || tx.commission_amount || 0), 0);
      items.push({
        id: 'this-week',
        title: `${closingThisWeek.length} deal${closingThisWeek.length > 1 ? 's' : ''} closing this week`,
        subtitle: `${closingThisWeek.length} deal${closingThisWeek.length > 1 ? 's' : ''} closing within 7 days`,
        amount: weekValue,
        link: '/deals?filter=this-week',
        severity: 'warning',
      });
    }

    return items;
  }, [syncedTransactions, now]);

  const totalItems = alerts.length;

  const severityColors = {
    error: 'text-destructive',
    warning: 'text-amber-500',
    info: 'text-primary',
  };

  return (
    <div className="liquid-glass rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <AlertTriangle className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">Needs Attention</h3>
        {totalItems > 0 && (
          <span className="ml-auto inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-border/50 bg-background text-foreground">
            {totalItems} item{totalItems > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">All clear! Nothing needs attention.</p>
        ) : alerts.map(alert => (
          <div
            key={alert.id}
            className="p-3 rounded-lg border border-border/30 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
            onClick={() => navigate(alert.link)}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${severityColors[alert.severity]}`}>
                  {alert.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{alert.subtitle}</p>
                <button className="text-xs text-primary flex items-center gap-0.5 mt-1 hover:underline">
                  See details <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              <p className="text-sm font-bold text-foreground ml-3">
                {formatCurrency(alert.amount)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
