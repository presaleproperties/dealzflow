import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BookShowingDialog } from '@/components/crm/leads/BookShowingDialog';
import { SectionHeader } from './shared';
import type { CrmShowing } from './types';

export function ShowingsTab({ contactId, showings }: { contactId: string; showings: CrmShowing[] }) {
  const [showBooking, setShowBooking] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader>Appointments</SectionHeader>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setShowBooking(true)}>
          <Plus className="w-3.5 h-3.5" /> Book
        </Button>
      </div>
      {showings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-10 h-10 rounded-full border border-border/60 flex items-center justify-center mb-3">
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground/80">No appointments</p>
          <p className="text-xs text-muted-foreground mt-1">Book a showing to track property visits</p>
        </div>
      ) : (
        <div className="space-y-2">
          {showings.map((s) => (
            <div key={s.id} className="flex items-start gap-3 px-3.5 py-3 rounded-lg border border-border/60 bg-card hover:border-border transition-colors">
              <div className="w-8 h-8 rounded-md border border-border/60 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-foreground/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{s.project}{s.unit ? ` — ${s.unit}` : ''}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(s.showing_date), 'MMM d, yyyy')} at {s.showing_time}</p>
                {s.notes && <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{s.notes}</p>}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                {s.status ?? 'Confirmed'}
              </span>
            </div>
          ))}
        </div>
      )}
      <BookShowingDialog contactId={contactId} project={null} open={showBooking} onOpenChange={setShowBooking} />
    </div>
  );
}
