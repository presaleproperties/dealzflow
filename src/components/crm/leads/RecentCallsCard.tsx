/**
 * Recent calls panel for the lead detail right sidebar.
 * Shows the latest 5 logged calls inline with playable recordings.
 */
import { useCrmContactCallLog } from '@/hooks/useCrmContactCallLog';
import { CallNoteCard } from '@/components/crm/leads/CallNoteCard';
import { Phone } from 'lucide-react';

export function RecentCallsCard({ contactId }: { contactId: string }) {
  const { data: calls = [], isLoading } = useCrmContactCallLog(contactId);
  if (isLoading || calls.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Phone className="w-3.5 h-3.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Recent calls</h3>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{calls.length}</span>
      </div>
      <div className="space-y-1.5">
        {calls.slice(0, 5).map((c) => (
          <CallNoteCard key={c.id} call={c} />
        ))}
      </div>
    </div>
  );
}
