import { TrendingUp } from 'lucide-react';
import { useCrmContactMessages, useCrmContactShowings, useCrmContactTasks } from '@/hooks/useCrmLeadDetail';

export function LeadScoreCard({ contactId }: { contactId: string }) {
  const { data: messages = [] } = useCrmContactMessages(contactId);
  const { data: showings = [] } = useCrmContactShowings(contactId);
  const { data: tasks = [] } = useCrmContactTasks(contactId);

  // Simple scoring
  const inbound = messages.filter((m: any) => m.direction === 'inbound').length;
  const outbound = messages.filter((m: any) => m.direction === 'outbound').length;
  const showingCount = showings.length;
  const completedTasks = tasks.filter((t: any) => t.status === 'completed').length;

  const score = Math.min(100, inbound * 10 + outbound * 3 + showingCount * 15 + completedTasks * 5);

  const color = score >= 70 ? 'hsl(142 71% 45%)' : score >= 40 ? 'hsl(38 92% 50%)' : 'hsl(220 10% 50%)';
  const label = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cold';

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-3">Lead Score</h3>
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-14 h-14 rounded-full border-4"
          style={{ borderColor: color }}
        >
          <span className="text-lg font-bold" style={{ color }}>{score}</span>
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color }}>{label}</p>
          <div className="text-[11px] text-muted-foreground space-y-0.5 mt-1">
            <p>{inbound} inbound msg{inbound !== 1 ? 's' : ''}</p>
            <p>{showingCount} showing{showingCount !== 1 ? 's' : ''}</p>
            <p>{completedTasks} task{completedTasks !== 1 ? 's' : ''} done</p>
          </div>
        </div>
      </div>
    </div>
  );
}
