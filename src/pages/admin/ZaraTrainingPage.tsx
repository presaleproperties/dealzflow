// Zara Training — system-prompt versioning + workspace custom instructions
// + mark sent drafts as training examples (few-shot for the planner)
import { useEffect, useState } from 'react';
import { ZaraShell } from '@/components/admin/zara/ZaraShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Save, Star } from 'lucide-react';

export default function ZaraTrainingPage() {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [version, setVersion] = useState('');
  const [summary, setSummary] = useState('');
  const [orgInst, setOrgInst] = useState('');
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: ps }, { data: ctx }, { data: ds }] = await Promise.all([
      supabase.from('zara_system_prompts').select('*').order('created_at', { ascending: false }),
      supabase.from('zara_org_context').select('*').eq('id', 1).maybeSingle(),
      supabase.from('crm_zara_drafts').select('id, channel, subject, body, status, is_training_example, sent_at, trigger_kind')
        .in('status', ['sent','approved']).order('sent_at', { ascending: false, nullsFirst: false }).limit(50),
    ]);
    setPrompts(ps ?? []);
    const active = (ps ?? []).find((p) => p.is_active);
    setActiveId(active?.id ?? null);
    setEditText(active?.prompt_text ?? '');
    setOrgInst(ctx?.custom_instructions ?? '');
    setDrafts(ds ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveNewVersion() {
    if (!editText.trim() || !version.trim()) return toast.error('Version + prompt required');
    const { data: { user } } = await supabase.auth.getUser();
    // deactivate existing
    await supabase.from('zara_system_prompts').update({ is_active: false }).eq('is_active', true);
    const { error } = await supabase.from('zara_system_prompts').insert({
      name: 'planner', version, prompt_text: editText, is_active: true,
      change_summary: summary || null, created_by: user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Saved & activated ${version}`);
    setVersion(''); setSummary('');
    load();
  }

  async function activate(id: string) {
    await supabase.from('zara_system_prompts').update({ is_active: false }).eq('is_active', true);
    const { error } = await supabase.from('zara_system_prompts').update({ is_active: true }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Activated');
    load();
  }

  async function saveOrgContext() {
    const { error } = await supabase.from('zara_org_context')
      .update({ custom_instructions: orgInst, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) return toast.error(error.message);
    toast.success('Workspace context saved');
  }

  async function toggleTraining(d: any) {
    const next = !d.is_training_example;
    await supabase.from('crm_zara_drafts').update({ is_training_example: next }).eq('id', d.id);
    setDrafts((rows) => rows.map((r) => r.id === d.id ? { ...r, is_training_example: next } : r));
  }

  return (
    <ZaraShell title="Training" subtitle="System prompt versions, workspace context, training examples">
      <Tabs defaultValue="prompt">
        <TabsList>
          <TabsTrigger value="prompt">System Prompt</TabsTrigger>
          <TabsTrigger value="context">Workspace Context</TabsTrigger>
          <TabsTrigger value="examples">Training Examples</TabsTrigger>
        </TabsList>

        <TabsContent value="prompt" className="space-y-4 mt-4">
          {loading ? <Skeleton className="h-64"/> : (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">Active prompt editor</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-[300px] font-mono text-xs"/>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div><Label>New version label</Label><Input placeholder="v2" value={version} onChange={(e) => setVersion(e.target.value)} className="mt-1.5"/></div>
                    <div><Label>Change summary</Label><Input placeholder="What changed?" value={summary} onChange={(e) => setSummary(e.target.value)} className="mt-1.5"/></div>
                  </div>
                  <Button onClick={saveNewVersion}><Save className="h-4 w-4 mr-1"/>Save & activate new version</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Version history</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {prompts.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0 text-sm">
                      <Badge variant={p.is_active ? 'default' : 'outline'} className="text-[10px]">{p.version}</Badge>
                      <span className="text-xs text-muted-foreground flex-1 truncate">{p.change_summary || '—'}</span>
                      <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</span>
                      {!p.is_active && <Button size="sm" variant="outline" onClick={() => activate(p.id)}>Activate</Button>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="context" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Workspace custom instructions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Appended to every Zara prompt. Use for: brokerage tone, project priorities, recurring objections.</p>
              <Textarea value={orgInst} onChange={(e) => setOrgInst(e.target.value)} className="min-h-[200px]" placeholder="e.g. Always prioritize Pacific Pearl pre-construction. Use casual tone. Mention free deck downloads."/>
              <Button onClick={saveOrgContext}><Save className="h-4 w-4 mr-1"/>Save</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="examples" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Sent drafts — mark good ones as training examples</CardTitle></CardHeader>
            <CardContent>
              {drafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sent drafts yet.</p>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {drafts.map((d) => (
                    <div key={d.id} className="p-3 rounded border border-border/60">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge variant="outline" className="text-[10px]">{d.channel}</Badge>
                        <Badge variant="outline" className="text-[10px]">{d.trigger_kind}</Badge>
                        {d.subject && <span className="text-sm font-medium truncate flex-1">{d.subject}</span>}
                        <Button size="sm" variant={d.is_training_example ? 'default' : 'outline'} onClick={() => toggleTraining(d)}>
                          <Star className={`h-3 w-3 mr-1 ${d.is_training_example ? 'fill-current' : ''}`}/>
                          {d.is_training_example ? 'Example' : 'Mark'}
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{d.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </ZaraShell>
  );
}
