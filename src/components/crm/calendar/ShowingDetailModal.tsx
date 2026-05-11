import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { formatContactName } from '@/lib/format';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { CrmShowingWithContact } from '@/hooks/useCrmShowings';

const STATUS_BADGE: Record<string, string> = {
  confirmed: 'bg-primary/15 text-primary border-primary/30',
  completed: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  cancelled: 'bg-muted text-muted-foreground border-border',
  'no-show': 'bg-destructive/15 text-destructive border-destructive/30',
};

interface Props {
  showing: CrmShowingWithContact | null;
  onClose: () => void;
  onUpdateStatus: (id: string, status: string) => void;
}

export function ShowingDetailModal({ showing, onClose, onUpdateStatus }: Props) {
  if (!showing) return null;

  const contactName = showing.crm_contacts
    ? formatContactName(showing.crm_contacts.first_name, showing.crm_contacts.last_name)
    : 'Unknown';
  const status = showing.status ?? 'confirmed';

  return (
    <Dialog open={!!showing} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent aria-describedby={undefined} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Showing Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Link to={`/crm/leads/${showing.contact_id}`}
              className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
              {contactName} <ExternalLink className="h-3 w-3" />
            </Link>
            <Badge className={`text-[10px] capitalize ${STATUS_BADGE[status] ?? ''}`}>{status}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Project</span>
              <p className="font-medium">{showing.project}</p>
            </div>
            {showing.unit && (
              <div>
                <span className="text-muted-foreground text-xs">Unit</span>
                <p className="font-medium">{showing.unit}</p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground text-xs">Date</span>
              <p className="font-medium">{format(new Date(showing.showing_date), 'MMM d, yyyy')}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Time</span>
              <p className="font-medium">{showing.showing_time}</p>
            </div>
            {showing.assigned_agent && (
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">Agent</span>
                <p className="font-medium">{showing.assigned_agent}</p>
              </div>
            )}
          </div>

          {showing.notes && (
            <div>
              <span className="text-muted-foreground text-xs">Notes</span>
              <p className="text-sm">{showing.notes}</p>
            </div>
          )}
        </div>

        {status === 'confirmed' && (
          <DialogFooter className="flex-row gap-2">
            <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onUpdateStatus(showing.id, 'completed')}>
              Complete
            </Button>
            <Button size="sm" variant="outline" className="flex-1"
              onClick={() => onUpdateStatus(showing.id, 'cancelled')}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" className="flex-1"
              onClick={() => onUpdateStatus(showing.id, 'no-show')}>
              No-Show
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
