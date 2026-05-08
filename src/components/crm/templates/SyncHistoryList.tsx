import { CheckCircle2, AlertCircle, Send, ArrowDownToLine, ArrowUpFromLine, Loader2 } from 'lucide-react';
import { useTemplateSyncLog } from '@/hooks/useTemplateSyncLog';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  templateId: string | null;
}

const DIR_META: Record<string, { Icon: typeof Send; label: string }> = {
  pull: { Icon: ArrowDownToLine, label: 'Pulled from Presale' },
  push: { Icon: ArrowUpFromLine, label: 'Pushed to Presale' },
  test: { Icon: Send, label: 'Test sent' },
};

/**
 * Renders the last 10 sync events for a template. Surfaces both successful
 * pushes and bridge errors so agents can spot stuck syncs without leaving
 * the editor.
 */
export function SyncHistoryList({ templateId }: Props) {
  const { data, isLoading, isError } = useTemplateSyncLog(templateId);

  if (!templateId) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Save the template first to start tracking sync history.
      </p>
    );
  }
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading…
      </div>
    );
  }
  if (isError) {
    return <p className="text-[11px] text-destructive">Couldn’t load sync history.</p>;
  }
  if (!data || data.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No sync events yet.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {data.map((ev) => {
        const meta = DIR_META[ev.direction] ?? DIR_META.test;
        const Icon = meta.Icon;
        const ok = ev.status === 'success';
        return (
          <li
            key={ev.id}
            className="flex items-start gap-2 rounded border border-border/40 bg-muted/20 px-2 py-1.5 text-[11px]"
          >
            <Icon className={cn('w-3 h-3 mt-0.5 shrink-0', ok ? 'text-emerald-600' : 'text-destructive')} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">{meta.label}</span>
                {ok ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-destructive" />
                )}
                <span className="ml-auto text-muted-foreground/70 text-[10px]">
                  {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                </span>
              </div>
              {ev.payload_summary && (ev.payload_summary as any).to && (
                <div className="text-muted-foreground truncate">
                  → {(ev.payload_summary as any).to}
                </div>
              )}
              {ev.error && (
                <div className="text-destructive/90 truncate" title={ev.error}>
                  {ev.error}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
