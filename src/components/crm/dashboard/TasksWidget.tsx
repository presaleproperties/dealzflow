import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListTodo, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, isPast, isToday } from 'date-fns';
import { toast } from 'sonner';

export function TasksWidget() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['crm-dashboard-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_tasks')
        .select('*, crm_contacts(id, first_name, last_name)')
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 20_000,
  });

  const completeTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_tasks').update({ status: 'completed' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-dashboard-tasks'] });
      toast.success('Task completed');
    },
  });

  const { overdue, today, upcoming } = useMemo(() => {
    const overdue: typeof tasks = [];
    const today: typeof tasks = [];
    const upcoming: typeof tasks = [];
    tasks.forEach(t => {
      if (!t.due_date) { upcoming.push(t); return; }
      const d = new Date(t.due_date);
      if (isPast(d) && !isToday(d)) overdue.push(t);
      else if (isToday(d)) today.push(t);
      else upcoming.push(t);
    });
    return { overdue, today, upcoming };
  }, [tasks]);

  const priorityColor = (p: string | null) => {
    if (p === 'high') return 'hsl(0 84% 60%)';
    if (p === 'medium') return 'hsl(38 92% 50%)';
    return 'hsl(220 10% 50%)';
  };

  const renderTask = (t: any) => {
    const contact = t.crm_contacts;
    const contactName = contact ? `${contact.first_name} ${contact.last_name}`.trim() : null;
    return (
      <div key={t.id} className="flex items-start gap-2 py-2 px-2 rounded-md hover:bg-muted/40 transition-colors group">
        <button
          onClick={() => completeTask.mutate(t.id)}
          className="mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 transition-colors hover:border-primary hover:bg-primary/20"
          style={{ borderColor: priorityColor(t.priority) }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-foreground truncate">{t.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {contactName && (
              <button
                onClick={() => navigate(`/crm/leads/${contact.id}`)}
                className="text-[10px] text-primary hover:underline truncate"
              >
                {contactName}
              </button>
            )}
            {t.due_date && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(new Date(t.due_date), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
        {t.priority && (
          <Badge variant="outline" className="text-[9px] border-0 shrink-0" style={{ background: `${priorityColor(t.priority)}15`, color: priorityColor(t.priority) }}>
            {t.priority}
          </Badge>
        )}
      </div>
    );
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-2 p-3 sm:p-4 border-b border-border">
        <ListTodo className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Tasks & Follow-ups</h3>
        <Badge variant="secondary" className="text-[10px] ml-auto">{tasks.length}</Badge>
      </div>

      <div className="max-h-[320px] overflow-y-auto p-1">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md m-1" />)
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No pending tasks 🎉</p>
        ) : (
          <>
            {overdue.length > 0 && (
              <div className="px-2 pt-1">
                <div className="flex items-center gap-1 mb-1">
                  <AlertTriangle className="w-3 h-3 text-destructive" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">Overdue ({overdue.length})</span>
                </div>
                {overdue.map(renderTask)}
              </div>
            )}
            {today.length > 0 && (
              <div className="px-2 pt-1">
                <div className="flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Today ({today.length})</span>
                </div>
                {today.map(renderTask)}
              </div>
            )}
            {upcoming.length > 0 && (
              <div className="px-2 pt-1">
                <div className="flex items-center gap-1 mb-1">
                  <CheckCircle2 className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Upcoming ({upcoming.length})</span>
                </div>
                {upcoming.map(renderTask)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
