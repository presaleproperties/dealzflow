import { useState } from 'react';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAddCrmShowing } from '@/hooks/useCrmLeadDetail';
import { PROJECTS, AGENTS } from '@/hooks/useCrmContacts';

interface Props {
  contactId: string;
  project: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookShowingDialog({ contactId, project, open, onOpenChange }: Props) {
  const addShowing = useAddCrmShowing();
  const [form, setForm] = useState({
    project: project ?? '',
    unit: '',
    showing_date: '',
    showing_time: '',
    assigned_agent: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.project || !form.showing_date || !form.showing_time) return;
    await addShowing.mutateAsync({
      contact_id: contactId,
      project: form.project,
      unit: form.unit || undefined,
      showing_date: form.showing_date,
      showing_time: form.showing_time,
      assigned_agent: form.assigned_agent || undefined,
      notes: form.notes || undefined,
    });
    setForm({ project: project ?? '', unit: '', showing_date: '', showing_time: '', assigned_agent: '', notes: '' });
    onOpenChange(false);
  };

  const canSubmit = !!form.project && !!form.showing_date && !!form.showing_time && !addShowing.isPending;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md p-0 gap-0 flex flex-col max-h-[92vh]">
        <ResponsiveDialogHeader className="px-5 pt-5 pb-3 border-b border-border/60 shrink-0">
          <ResponsiveDialogTitle className="text-lg font-semibold tracking-tight">Book Showing</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project *</Label>
              <Select value={form.project} onValueChange={(v) => setForm({ ...form, project: v })}>
                <SelectTrigger className="h-11 text-base md:text-sm md:h-10"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>{PROJECTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unit</Label>
              <Input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="e.g. 2BR-405"
                maxLength={50}
                className="h-11 text-base md:text-sm md:h-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date *</Label>
                <Input
                  type="date"
                  value={form.showing_date}
                  onChange={(e) => setForm({ ...form, showing_date: e.target.value })}
                  className="h-11 text-base md:text-sm md:h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Time *</Label>
                <Input
                  type="time"
                  value={form.showing_time}
                  onChange={(e) => setForm({ ...form, showing_time: e.target.value })}
                  className="h-11 text-base md:text-sm md:h-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assigned Agent</Label>
              <Select value={form.assigned_agent} onValueChange={(v) => setForm({ ...form, assigned_agent: v })}>
                <SelectTrigger className="h-11 text-base md:text-sm md:h-10"><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>{AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                maxLength={500}
                placeholder="Optional notes…"
                className="min-h-[80px] text-base md:text-sm"
              />
            </div>
          </div>

          {/* Sticky footer — thumb reachable */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/60 bg-background shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] md:pb-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 md:h-10 flex-1 sm:flex-initial">
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} className="h-11 md:h-10 flex-1 sm:flex-initial">
              {addShowing.isPending ? 'Booking…' : 'Book Showing'}
            </Button>
          </div>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
