import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useTeamAgents } from '@/hooks/useTeamAgents';
import { AgentAvatar } from '@/components/crm/AgentAvatar';
import { useCreateShowing } from '@/hooks/useCrmShowings';
import { ProjectPicker } from '@/components/crm/projects/ProjectPicker';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function BookShowingModal({ open, onOpenChange }: Props) {
  const { data: contacts } = useCrmContacts();
  const createMut = useCreateShowing();
  const { data: agents = [] } = useTeamAgents();

  const [contactId, setContactId] = useState('');
  const [project, setProject] = useState('');
  const [unit, setUnit] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [agent, setAgent] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');

  const filtered = contacts?.filter(c => {
    const full = `${c.first_name} ${c.last_name}`.toLowerCase();
    return full.includes(search.toLowerCase());
  }) ?? [];

  const reset = () => {
    setContactId(''); setProject(''); setUnit(''); setDate(''); setTime('10:00'); setAgent(''); setNotes(''); setSearch('');
  };

  const handleSave = () => {
    if (!contactId || !project || !date || !time) return;
    createMut.mutate({
      contact_id: contactId,
      project,
      unit: unit || undefined,
      showing_date: date,
      showing_time: time,
      assigned_agent: agent || undefined,
      notes: notes || undefined,
    }, {
      onSuccess: () => { reset(); onOpenChange(false); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book Showing</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Lead</Label>
            <Input placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && !contactId && filtered.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-border/50 bg-popover">
                {filtered.slice(0, 8).map(c => (
                  <button key={c.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
                    onClick={() => { setContactId(c.id); setSearch(`${c.first_name} ${c.last_name}`); }}>
                    {c.first_name} {c.last_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Project</Label>
            <ProjectPicker value={project} onChange={(name) => setProject(name)} />
          </div>

          <div className="space-y-2">
            <Label>Unit (optional)</Label>
            <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. Unit 502" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assigned Agent</Label>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
              <SelectContent>
                {agents.map(a => <SelectItem key={a.id} value={a.name}><span className="inline-flex items-center gap-2"><AgentAvatar name={a.name} headshotUrl={a.headshot_url} focalY={a.focal_y} size={20} />{a.name}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any details…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSave} disabled={!contactId || !project || !date || createMut.isPending}>
            {createMut.isPending ? 'Saving…' : 'Book Showing'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
