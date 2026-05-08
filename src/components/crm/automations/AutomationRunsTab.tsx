import { useAutomationRunLog } from '@/hooks/useCrmAutomations';
import { Pill } from '@/components/crm/shared/Pill';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';

interface Props { automationId: string }

export function AutomationRunsTab({ automationId }: Props) {
  const { data, isLoading } = useAutomationRunLog(automationId);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data || data.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-muted-foreground">No runs yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Each step the engine executes will appear here with its result.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {data.map(r => {
        const ok = r.action_result === 'success';
        return (
          <div key={r.id} className="px-5 py-3 flex items-start gap-3">
            {ok
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              : <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Pill tone="muted">step {r.step_order}</Pill>
                <span className="text-sm font-medium">{r.action_type}</span>
                {r.contact && (
                  <>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{r.contact.first_name} {r.contact.last_name}</span>
                  </>
                )}
              </div>
              {r.error_message && (
                <p className="text-[11px] text-destructive mt-0.5">{r.error_message}</p>
              )}
              {r.payload && Object.keys(r.payload).length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                  {Object.entries(r.payload).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
                </p>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
