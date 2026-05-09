import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { CrmTask } from './types';

export function TaskRow({ task }: { task: CrmTask }) {
  const qc = useQueryClient();
  const isOverdue = !!task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
  const completeTask = useMutation({
    mutationFn: async () => {
      const prev = { status: task.status, completed_at: task.completed_at ?? null };
      const { error } = await supabase
        .from('crm_tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', task.id);
      if (error) throw error;
      return prev;
    },
    onSuccess: (prev) => {
      qc.invalidateQueries({ queryKey: ['crm-contact-tasks', task.contact_id] });
      toast.success('Task completed', {
        action: {
          label: 'Undo',
          onClick: async () => {
            const { error } = await supabase
              .from('crm_tasks')
              .update({ status: prev?.status ?? 'pending', completed_at: prev?.completed_at ?? null })
              .eq('id', task.id);
            if (error) {
              toast.error(`Couldn't undo: ${error.message}`);
              return;
            }
            qc.invalidateQueries({ queryKey: ['crm-contact-tasks', task.contact_id] });
            toast.success('Task restored');
          },
        },
        duration: 6000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isPresaleTask = !!task.presale_task_id;
  const isClaimed = task.status === 'claimed' || !!task.claimed_at;
  const claim = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('crm_claim_task', { _task_id: task.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-contact-tasks', task.contact_id] });
      toast.success('Task claimed — presale notified');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className={cn(
      'flex items-start gap-2.5 p-3 rounded-lg bg-card border transition-colors',
      isOverdue ? 'border-destructive/30' : 'border-border/60 hover:border-border'
    )}>
      <Checkbox
        className="mt-0.5 h-4 w-4"
        checked={task.status === 'completed'}
        disabled={completeTask.isPending || task.status === 'completed'}
        onCheckedChange={(checked) => { if (checked) completeTask.mutate(); }}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] font-medium leading-snug', task.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground')}>{task.title}</p>
        {task.due_date && (
          <p className={cn('text-xs mt-0.5', isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
            {isOverdue ? 'Overdue · ' : ''}{format(new Date(task.due_date), 'MMM d, yyyy')}
          </p>
        )}
      </div>
      {isPresaleTask && !isClaimed && task.status !== 'completed' && (
        <button
          type="button"
          disabled={claim.isPending}
          onClick={() => claim.mutate()}
          className="text-[10px] font-semibold uppercase tracking-wider shrink-0 px-2 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          {claim.isPending ? 'Claiming…' : 'Claim'}
        </button>
      )}
      {isClaimed && (
        <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0 text-muted-foreground">Claimed</span>
      )}
      {task.priority === 'high' && !isPresaleTask && (
        <span className="text-[10px] text-destructive font-semibold uppercase tracking-wider shrink-0">High</span>
      )}
    </div>
  );
}
