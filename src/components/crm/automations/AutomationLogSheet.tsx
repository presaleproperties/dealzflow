import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCrmAutomationLogs } from '@/hooks/useCrmAutomations';
import { formatContactName } from '@/lib/format';
import { format } from 'date-fns';
import { CheckCircle, XCircle, MinusCircle } from 'lucide-react';

interface Props {
  automationId: string | null;
  automationName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AutomationLogSheet({ automationId, automationName, open, onOpenChange }: Props) {
  const { data: logs = [], isLoading } = useCrmAutomationLogs(open ? automationId : null);
  const [filter, setFilter] = useState<string>('all');

  const filtered = filter === 'all' ? logs : logs.filter(l => l.action_result === filter);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Automation Log</SheetTitle>
          <p className="text-sm text-muted-foreground">{automationName}</p>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No log entries yet</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card/50">
                  <div className="mt-0.5">
                    {log.action_result === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {log.action_result === 'failed' && <XCircle className="w-4 h-4 text-destructive" />}
                    {log.action_result === 'skipped' && <MinusCircle className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {log.contact ? formatContactName(log.contact.first_name, log.contact.last_name) : 'Unknown contact'}
                      </span>
                      <Badge variant={log.action_result === 'success' ? 'default' : log.action_result === 'failed' ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
                        {log.action_result}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                    </p>
                    {log.error_message && (
                      <p className="text-xs text-destructive mt-1">{log.error_message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
