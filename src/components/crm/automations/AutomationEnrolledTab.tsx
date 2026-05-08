import { useAutomationEnrollments, useUnenrollContacts, useRunAutomationNow } from '@/hooks/useCrmAutomations';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/crm/shared/Pill';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { UserMinus, PlayCircle, ExternalLink } from 'lucide-react';

interface Props { automationId: string }

export function AutomationEnrolledTab({ automationId }: Props) {
  const { data, isLoading } = useAutomationEnrollments(automationId, 'all');
  const unenroll = useUnenrollContacts();
  const runNow = useRunAutomationNow();

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data || data.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-muted-foreground">No leads enrolled yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Trigger this automation by adding a matching lead, or enroll manually from a lead's quick actions.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/40">
      <div className="px-5 py-3 flex items-center justify-between bg-muted/10">
        <p className="text-xs text-muted-foreground">{data.length} enrollments · {data.filter(d => d.status === 'active').length} active</p>
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1.5" onClick={() => runNow.mutate(undefined)} disabled={runNow.isPending}>
          <PlayCircle className="h-3.5 w-3.5" /> Run engine now
        </Button>
      </div>
      {data.map(e => (
        <div key={e.id} className="px-5 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">
                {e.contact ? `${e.contact.first_name} ${e.contact.last_name}` : e.contact_id.slice(0, 8)}
              </p>
              <Pill tone={e.status === 'active' ? 'success' : e.status === 'completed' ? 'neutral' : 'muted'}>
                {e.status}
              </Pill>
              <Pill tone="muted">step {e.current_step_order}</Pill>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Enrolled {formatDistanceToNow(new Date(e.enrolled_at), { addSuffix: true })}
              {e.next_step_due_at && e.status === 'active' && ` · next step ${formatDistanceToNow(new Date(e.next_step_due_at), { addSuffix: true })}`}
              {e.exit_reason && ` · exit: ${e.exit_reason}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {e.contact_id && (
              <Button asChild size="icon" variant="ghost" className="h-7 w-7" title="Open lead">
                <Link to={`/crm/leads/${e.contact_id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
              </Button>
            )}
            {e.status === 'active' && (
              <>
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Run this enrollment now"
                  onClick={() => runNow.mutate(e.id)} disabled={runNow.isPending}>
                  <PlayCircle className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Unenroll"
                  onClick={() => unenroll.mutate([e.id])} disabled={unenroll.isPending}>
                  <UserMinus className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
