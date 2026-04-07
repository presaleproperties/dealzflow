import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAddCrmTask } from '@/hooks/useCrmLeadDetail';
import { AGENTS } from '@/hooks/useCrmContacts';

const TASK_TYPES = ['follow_up', 'showing', 'call', 'email', 'other'] as const;
const PRIORITIES = ['high', 'medium', 'low'] as const;

interface Props {
  contactId: string;
  assignedTo: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTaskDialog({ contactId, assignedTo, open, onOpenChange }: Props) {
  const addTask = useAddCrmTask();
  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    task_type: 'follow_up',
    assigned_to: assignedTo ?? '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    await addTask.mutateAsync({
      contact_id: contactId,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : undefined,
      priority: form.priority,
      task_type: form.task_type,
      assigned_to: form.assigned_to || undefined,
    });
    setForm({ title: '', description: '', due_date: '', priority: 'medium', task_type: 'follow_up', assigned_to: assignedTo ?? '' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Follow up call" maxLength={200} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} className="min-h-[60px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Due Date</Label>
              <Input type="datetime-local" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.task_type} onValueChange={(v) => setForm({ ...form, task_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assigned To</Label>
              <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>{AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={addTask.isPending || !form.title.trim()}>
              {addTask.isPending ? 'Creating...' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
