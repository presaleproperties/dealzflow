// Zara Lead Assignment Designer — playbook list + JSON editor
import { useEffect, useState } from 'react';
import { ZaraShell } from '@/components/admin/zara/ZaraShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PlaybookSimulator } from '@/components/admin/zara/PlaybookSimulator';

type Playbook = {
  id: string;
  name: string;
  description: string | null;
  trigger_conditions: any;
  behavior_sequence: any;
  is_active: boolean;
  priority: number;
  times_triggered: number;
};

const EMPTY: Partial<Playbook> = {
  name: '', description: '', trigger_conditions: {}, behavior_sequence: [],
  is_active: true, priority: 100,
};

export default function ZaraPlaybooksPage() {
  const [rows, setRows] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Playbook> | null>(null);
  const [trigJson, setTrigJson] = useState('');
  const [seqJson, setSeqJson] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('crm_zara_playbooks').select('*').order('priority', { ascending: true });
    setRows((data ?? []) as any);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function open(p: Partial<Playbook>) {
    setEditing(p);
    setTrigJson(JSON.stringify(p.trigger_conditions ?? {}, null, 2));
    setSeqJson(JSON.stringify(p.behavior_sequence ?? [], null, 2));
  }

  async function save() {
    if (!editing) return;
    let trig: any, seq: any;
    try { trig = JSON.parse(trigJson || '{}'); } catch { return toast.error('Trigger JSON invalid'); }
    try { seq = JSON.parse(seqJson || '[]'); } catch { return toast.error('Sequence JSON invalid'); }
    const payload = {
      name: editing.name || 'Untitled',
      description: editing.description || null,
      trigger_conditions: trig,
      behavior_sequence: seq,
      is_active: editing.is_active ?? true,
      priority: editing.priority ?? 100,
    };
    const { error } = editing.id
      ? await supabase.from('crm_zara_playbooks').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('crm_zara_playbooks').insert(payload);
    if (error) return toast.error(error.message);
    toast.success('Saved');
    setEditing(null); load();
  }

  async function del(id: string) {
    if (!confirm('Delete this playbook?')) return;
    const { error } = await supabase.from('crm_zara_playbooks').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Deleted'); load();
  }

  async function toggleActive(p: Playbook) {
    await supabase.from('crm_zara_playbooks').update({ is_active: !p.is_active }).eq('id', p.id);
    setRows((r) => r.map((x) => x.id === p.id ? { ...x, is_active: !x.is_active } : x));
  }

  return (
    <ZaraShell title="Lead Assignment Designer" subtitle="Playbooks resolved in priority order when a lead enters Zara"
      actions={<Button size="sm" onClick={() => open(EMPTY)}><Plus className="h-4 w-4 mr-1"/>New playbook</Button>}>
      {loading ? <Skeleton className="h-64"/> : (
        <div className="space-y-3">
          {rows.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <Badge variant="outline" className="text-[10px] tabular-nums w-12 justify-center">#{p.priority}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.name}</span>
                    {p.is_active ? <Badge className="text-[10px]">active</Badge> : <Badge variant="outline" className="text-[10px]">paused</Badge>}
                    <span className="text-[11px] text-muted-foreground">triggered {p.times_triggered}×</span>
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
                  <div className="flex gap-2 mt-1.5">
                    <span className="text-[10px] text-muted-foreground">trigger: <code className="font-mono">{JSON.stringify(p.trigger_conditions).slice(0, 60)}</code></span>
                    <span className="text-[10px] text-muted-foreground">{(p.behavior_sequence as any[])?.length ?? 0} step(s)</span>
                  </div>
                </div>
                <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)}/>
                <Button variant="ghost" size="icon" onClick={() => open(p)}><Pencil className="h-4 w-4"/></Button>
                <Button variant="ghost" size="icon" onClick={() => del(p.id)}><Trash2 className="h-4 w-4 text-rose-500"/></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit' : 'New'} playbook</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div><Label>Name</Label><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="mt-1.5"/></div>
                <div><Label>Priority (lower = first)</Label><Input type="number" value={editing.priority ?? 100} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })} className="mt-1.5"/></div>
              </div>
              <div><Label>Description</Label><Input value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="mt-1.5"/></div>
              <div>
                <Label>Trigger conditions (JSON)</Label>
                <Textarea value={trigJson} onChange={(e) => setTrigJson(e.target.value)} className="mt-1.5 min-h-[120px] font-mono text-xs"/>
                <p className="text-[11px] text-muted-foreground mt-1">Supported keys: <code>tags</code> (string[]), <code>score_min</code> (number), <code>buyer_type</code> (string).</p>
              </div>
              <div>
                <Label>Behavior sequence (JSON array of steps)</Label>
                <Textarea value={seqJson} onChange={(e) => setSeqJson(e.target.value)} className="mt-1.5 min-h-[200px] font-mono text-xs"/>
                <p className="text-[11px] text-muted-foreground mt-1">Each step: <code>{`{ step, action, delay_minutes, channel, exit_on_reply? }`}</code></p>
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}/>
              </div>

              <PlaybookSimulator
                playbookName={editing.name || 'Untitled'}
                triggerJson={trigJson}
                sequenceJson={seqJson}
              />
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </ZaraShell>
  );
}
