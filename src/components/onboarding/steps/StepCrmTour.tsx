import { StepShell } from '../StepShell';
import { Link } from 'react-router-dom';
import { Users, Workflow, MessageCircle, Calendar, ArrowRight } from 'lucide-react';

interface Props {
  eyebrow: string;
  onBack: () => void;
  onFinish: () => void;
  finishLabel?: string;
}

const STOPS = [
  {
    to: '/crm/leads',
    icon: Users,
    title: 'Leads',
    body: "Every contact, sortable, searchable. Open one to see their full timeline, notes, and presale activity.",
  },
  {
    to: '/crm/pipeline',
    icon: Workflow,
    title: 'Pipeline',
    body: 'Kanban view of where every lead sits — first-match-wins logic keeps a lead in only one column.',
  },
  {
    to: '/crm/chats',
    icon: MessageCircle,
    title: 'Chats',
    body: 'Unified SMS + email inbox. Pinned threads stay on top. Pull to refresh on mobile.',
  },
  {
    to: '/crm/calendar',
    icon: Calendar,
    title: 'Calendar',
    body: 'Showings, meetings, and Google events colour-coded in one view.',
  },
];

export function StepCrmTour({ eyebrow, onBack, onFinish, finishLabel = 'Finish' }: Props) {
  return (
    <StepShell
      eyebrow={eyebrow}
      title="Your 4 daily stops"
      subtitle="The CRM is built around four pages. Tap any one to jump in — your wizard progress is saved."
      primaryLabel={finishLabel}
      onBack={onBack}
      onPrimary={onFinish}
    >
      <div className="space-y-2.5">
        {STOPS.map(({ to, icon: Icon, title, body }) => (
          <Link
            key={to}
            to={to}
            className="flex items-start gap-3 p-3.5 rounded-xl border border-border/60 bg-card/50 hover:border-primary/50 hover:bg-primary/5 transition-colors group"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                {title}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{body}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors mt-2 shrink-0" />
          </Link>
        ))}
      </div>
    </StepShell>
  );
}
