import { CalendarDays, ListTodo } from 'lucide-react';
import { format } from 'date-fns';
import { useCrmContactShowings, useCrmContactTasks } from '@/hooks/useCrmLeadDetail';

export function LeadUpcomingCard({ contactId }: { contactId: string }) {
  const { data: showings = [] } = useCrmContactShowings(contactId);
  const { data: tasks = [] } = useCrmContactTasks(contactId);

  const now = new Date();
  const upcomingShowings = showings
    .filter((s: any) => new Date(s.showing_date) >= now && s.status !== 'cancelled')
    .sort((a: any, b: any) => new Date(a.showing_date).getTime() - new Date(b.showing_date).getTime());

  const upcomingTasks = tasks
    .filter((t: any) => t.status !== 'completed' && t.due_date && new Date(t.due_date) >= now)
    .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const hasItems = upcomingShowings.length > 0 || upcomingTasks.length > 0;

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-3">Upcoming</h3>
      {!hasItems ? (
        <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
      ) : (
        <div className="space-y-2.5">
          {upcomingShowings.slice(0, 3).map((s: any) => (
            <div key={s.id} className="flex items-start gap-2.5">
              <CalendarDays className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'hsl(270 60% 55%)' }} strokeWidth={1.8} />
              <div>
                <p className="text-sm text-foreground">{s.project}{s.unit ? ` — ${s.unit}` : ''}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(s.showing_date), 'MMM d, yyyy')} at {s.showing_time}</p>
              </div>
            </div>
          ))}
          {upcomingTasks.slice(0, 3).map((t: any) => (
            <div key={t.id} className="flex items-start gap-2.5">
              <ListTodo className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'hsl(38 92% 50%)' }} strokeWidth={1.8} />
              <div>
                <p className="text-sm text-foreground">{t.title}</p>
                <p className="text-xs text-muted-foreground">Due {format(new Date(t.due_date), 'MMM d, yyyy')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
