import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { useAccessRequests, useSetWorkspaceStatus } from '@/hooks/useAccessRequests';
import type { WorkspaceStatus } from '@/hooks/useProfile';
import { cn } from '@/lib/utils';

const TABS: { key: WorkspaceStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'suspended', label: 'Suspended' },
];

export function AccessRequestsCard() {
  const [tab, setTab] = useState<WorkspaceStatus>('pending');
  const { data: rows = [], isLoading } = useAccessRequests(tab);
  const setStatus = useSetWorkspaceStatus();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Workspace Access Requests</CardTitle>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  tab === t.key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No {tab} requests.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div
                key={r.user_id}
                className="flex items-center justify-between gap-3 py-3 flex-wrap"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {r.full_name || '(unnamed)'}
                    </span>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {r.workspace_status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Requested {r.requested_at ? formatDistanceToNow(new Date(r.requested_at), { addSuffix: true }) : '—'}
                    {r.denial_reason ? ` · Reason: ${r.denial_reason}` : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  {tab !== 'approved' && (
                    <Button
                      size="sm"
                      onClick={() => setStatus.mutate({ userId: r.user_id, status: 'approved' })}
                      disabled={setStatus.isPending}
                    >
                      Approve
                    </Button>
                  )}
                  {tab !== 'suspended' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const reason = window.prompt('Reason for suspending (optional)') ?? undefined;
                        setStatus.mutate({ userId: r.user_id, status: 'suspended', reason });
                      }}
                      disabled={setStatus.isPending}
                    >
                      Suspend
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
