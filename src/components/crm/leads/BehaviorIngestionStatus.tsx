import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";
import { usePresaleBehavior } from "@/hooks/usePresaleBehavior";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Compact status panel: counts + last-ingested timestamp across the four
 * Presale behavior streams for a given contact.
 */
export function BehaviorIngestionStatus({ contactId }: { contactId?: string }) {
  const { data, isLoading } = usePresaleBehavior(contactId);

  if (isLoading) {
    return <Skeleton className="h-16 w-full rounded-md" />;
  }

  const views = data?.views || [];
  const sessions = data?.sessions || [];
  const forms = data?.forms || [];
  const engagement = data?.engagement || [];

  const total = views.length + sessions.length + forms.length + engagement.length;

  // Pick the freshest timestamp across all four streams
  const candidates: Array<{ at?: string | null; stream: string }> = [
    ...views.map((v: any) => ({ at: v.viewed_at, stream: "view" })),
    ...sessions.map((s: any) => ({ at: s.started_at, stream: "session" })),
    ...forms.map((f: any) => ({ at: f.submitted_at, stream: "form" })),
    ...engagement.map((e: any) => ({ at: e.occurred_at, stream: "engagement" })),
  ];
  const last = candidates
    .filter((c) => c.at)
    .sort((a, b) => new Date(b.at!).getTime() - new Date(a.at!).getTime())[0];

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <div className="flex flex-col items-center justify-center px-1.5 py-1 rounded border border-border/50 bg-card min-w-0">
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 mt-0.5">{label}</span>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Activity className={`w-3 h-3 shrink-0 ${total > 0 ? "text-emerald-500" : "text-muted-foreground/50"}`} />
          <span className="text-[11px] text-muted-foreground truncate">
            {total > 0 ? `${total} event${total === 1 ? "" : "s"} ingested` : "No events ingested yet"}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums" title={last?.at || ""}>
          {last?.at
            ? `last ${formatDistanceToNow(new Date(last.at), { addSuffix: true })}`
            : "—"}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <Stat label="Views" value={views.length} />
        <Stat label="Sessions" value={sessions.length} />
        <Stat label="Forms" value={forms.length} />
        <Stat label="Engage" value={engagement.length} />
      </div>
    </div>
  );
}
