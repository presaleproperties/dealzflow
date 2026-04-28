import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatContactName } from '@/lib/format';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { TYPE_LABELS } from './types';

interface Props {
  contact: CrmContact;
  navInfo: { index: number; total: number } | null;
  onNavigate: (dir: 'prev' | 'next') => void;
  onTask: () => void;
  onShowing: () => void;
  onSendProject?: () => void;
  /** Show "Task" CTA only when the left details panel is collapsed. */
  showTaskCta?: boolean;
  /** Show "Book Showing" CTA only when the right insights panel is collapsed. */
  showShowingCta?: boolean;
}

/** Top bar — Lead identity, navigation, and primary CTAs. */
export function LeadTopBar({ contact, navInfo, onNavigate, onTask, onShowing, showTaskCta, showShowingCta }: Props) {
  const typeLabel = TYPE_LABELS[contact.contact_type] ?? 'LEAD';
  return (
    <div className="px-5 py-3 border-b border-border bg-background flex-shrink-0 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <Link to="/crm/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4" /> Leads
        </Link>
        <div className="h-5 w-px bg-border shrink-0" />
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-[15px] font-semibold text-foreground tracking-tight truncate">
            {formatContactName(contact.first_name, contact.last_name)}
          </h1>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
            {typeLabel}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {showTaskCta && (
          <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={onTask}>
            <ListTodo className="w-3.5 h-3.5" /> Task
          </Button>
        )}
        {showShowingCta && (
          <Button size="sm" className="h-9 text-xs gap-1.5" onClick={onShowing}>
            <Calendar className="w-3.5 h-3.5" /> Book Showing
          </Button>
        )}

        {navInfo && (
          <>
            <div className="h-5 w-px bg-border mx-1" />
            <button onClick={() => onNavigate('prev')} disabled={navInfo.index <= 0} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-muted-foreground tabular-nums px-1">
              {navInfo.index + 1} / {navInfo.total}
            </span>
            <button onClick={() => onNavigate('next')} disabled={navInfo.index >= navInfo.total - 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
