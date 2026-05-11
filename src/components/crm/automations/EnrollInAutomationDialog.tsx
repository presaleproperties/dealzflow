import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCrmAutomations, useEnrollContacts } from '@/hooks/useCrmAutomations';
import { Zap } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contactIds: string[];
  contactNames?: string[];
}

export function EnrollInAutomationDialog({ open, onOpenChange, contactIds, contactNames }: Props) {
  const { data: autos } = useCrmAutomations();
  const enrollMut = useEnrollContacts();
  const [selected, setSelected] = useState<string>('');
  const active = (autos ?? []).filter(a => a.is_active);

  const onEnroll = () => {
    if (!selected) return;
    enrollMut.mutate(
      { automationId: selected, contactIds },
      { onSuccess: () => { onOpenChange(false); setSelected(''); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Enroll {contactIds.length} {contactIds.length === 1 ? 'lead' : 'leads'} in automation
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {contactNames && contactNames.length > 0 && (
            <p className="text-xs text-muted-foreground line-clamp-2">{contactNames.join(', ')}</p>
          )}
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger><SelectValue placeholder="Pick an active automation…" /></SelectTrigger>
            <SelectContent>
              {active.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No active automations. Activate one first.</div>}
              {active.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Already-active enrollments will be skipped. The first step runs on the next engine tick (~15 min) or immediately via Run Now.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onEnroll} disabled={!selected || enrollMut.isPending}>
            {enrollMut.isPending ? 'Enrolling…' : 'Enroll'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
