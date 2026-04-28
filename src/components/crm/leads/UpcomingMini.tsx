import { format } from 'date-fns';
import { ListTodo, Calendar, Plus } from 'lucide-react';
import { useCrmContactTasks, useCrmContactShowings } from '@/hooks/useCrmLeadDetail';
import type { CrmTask, CrmShowing } from './detail/types';

interface Props {
  contactId: string;
  onAddTask: () => void;
  onAddShowing: () => void;
}

/**
 * Compact "what's next" summary — shows only the next pending task and
 * next upcoming showing. Full lists live in the center column tabs.
 */
export function UpcomingMini({ contactId, onAddTask, onAddShowing }: Props) {
  const { data: tasks = [] } = useCrmContactTasks(contactId);
  const { data: showings = [] } = useCrmContactShowings(contactId);

  const now = new Date();
  const taskList = tasks as CrmTask[];
  const showingList = showings as CrmShowing[];

  const pendingTasks = taskList.filter((t) => t.status !== 'completed');
  const upcoming = showingList
    .filter((s) => new Date(s.showing_date) >= now && s.status !== 'cancelled')
    .sort((a, b) => new Date(a.showing_date).getTime() - new Date(b.showing_date).getTime());

  const nextTask = pendingTasks[0];
  const nextShowing = upcoming[0];

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm divide-y divide-border/60">
      <Row
        icon={<ListTodo className="w-4 h-4 text-foreground/70" />}
        label="Next task"
        countLabel={pendingTasks.length > 1 ? `+${pendingTasks.length - 1} more` : null}
        onAdd={onAddTask}
        title={nextTask?.title ?? null}
        meta={
          nextTask?.due_date
            ? `Due ${format(new Date(nextTask.due_date), 'MMM d')}`
            : nextTask
              ? 'No due date'
              : null
        }
      />
      <Row
        icon={<Calendar className="w-4 h-4 text-foreground/70" />}
        label="Next appointment"
        countLabel={upcoming.length > 1 ? `+${upcoming.length - 1} more` : null}
        onAdd={onAddShowing}
        title={nextShowing?.project ?? null}
        meta={
          nextShowing
            ? `${format(new Date(nextShowing.showing_date), 'MMM d')} · ${nextShowing.showing_time}`
            : null
        }
      />
    </div>
  );
}

function Row({
  icon, label, countLabel, onAdd, title, meta,
}: {
  icon: React.ReactNode;
  label: string;
  countLabel: string | null;
  onAdd: () => void;
  title: string | null;
  meta: string | null;
}) {
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="w-8 h-8 rounded-md border border-border/60 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground/80">{label}</p>
          {countLabel && (
            <span className="text-[10px] text-muted-foreground/70 font-medium">{countLabel}</span>
          )}
        </div>
        {title ? (
          <>
            <p className="text-[12.5px] font-medium text-foreground truncate mt-0.5">{title}</p>
            {meta && <p className="text-[10.5px] text-muted-foreground truncate">{meta}</p>}
          </>
        ) : (
          <p className="text-[12.5px] text-muted-foreground italic mt-0.5">None scheduled</p>
        )}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="w-7 h-7 rounded-md border border-border/60 hover:border-border hover:bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title={`Add ${label.toLowerCase().replace('next ', '')}`}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
