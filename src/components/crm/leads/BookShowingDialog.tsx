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

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader><ResponsiveDialogTitle>Book Showing</ResponsiveDialogTitle></ResponsiveDialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <Label>Project *</Label>
            <Select value={form.project} onValueChange={(v) => setForm({ ...form, project: v })}>
              <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>{PROJECTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Unit</Label>
            <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="e.g. 2BR-405" maxLength={50} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date *</Label>
              <Input type="date" value={form.showing_date} onChange={(e) => setForm({ ...form, showing_date: e.target.value })} />
            </div>
            <div>
              <Label>Time *</Label>
              <Input type="time" value={form.showing_time} onChange={(e) => setForm({ ...form, showing_time: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Assigned Agent</Label>
            <Select value={form.assigned_agent} onValueChange={(v) => setForm({ ...form, assigned_agent: v })}>
              <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
              <SelectContent>{AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} className="min-h-[60px]" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={addShowing.isPending || !form.project || !form.showing_date || !form.showing_time}>
              {addShowing.isPending ? 'Booking...' : 'Book Showing'}
            </Button>
          </div>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
