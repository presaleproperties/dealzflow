import { useState } from 'react';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAddCrmTask } from '@/hooks/useCrmLeadDetail';
import { useTeamAgents } from '@/hooks/useTeamAgents';
import { AgentAvatar } from '@/components/crm/AgentAvatar';

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
  const { data: agents = [] } = useTeamAgents();
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

  const canSubmit = form.title.trim().length > 0 && !addTask.isPending;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md p-0 gap-0 flex flex-col max-h-[92vh]">
        <ResponsiveDialogHeader className="px-5 pt-5 pb-3 border-b border-border/60 shrink-0">
          <ResponsiveDialogTitle className="text-lg font-semibold tracking-tight">Create Task</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Follow up call"
                maxLength={200}
                autoFocus
                className="h-11 text-base md:text-sm md:h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={1000}
                placeholder="Optional details…"
                className="min-h-[80px] text-base md:text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Due Date</Label>
                <Input
                  type="datetime-local"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="h-11 text-base md:text-sm md:h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="h-11 text-base md:text-sm md:h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</Label>
                <Select value={form.task_type} onValueChange={(v) => setForm({ ...form, task_type: v })}>
                  <SelectTrigger className="h-11 text-base md:text-sm md:h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assigned To</Label>
                <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                  <SelectTrigger className="h-11 text-base md:text-sm md:h-10"><SelectValue placeholder="Select agent" /></SelectTrigger>
                  <SelectContent>{agents.map((a) => <SelectItem key={a.id} value={a.name}><span className="inline-flex items-center gap-2"><AgentAvatar name={a.name} headshotUrl={a.headshot_url} focalY={a.focal_y} size={20} />{a.name}</span></SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Sticky footer — thumb reachable */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/60 bg-background shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] md:pb-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 md:h-10 flex-1 sm:flex-initial">
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} className="h-11 md:h-10 flex-1 sm:flex-initial">
              {addTask.isPending ? 'Creating…' : 'Create Task'}
            </Button>
          </div>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
