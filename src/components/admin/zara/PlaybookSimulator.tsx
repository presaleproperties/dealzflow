// PlaybookSimulator — preview trigger match + drafted behavior sequence
// without saving anything. Used inside the Playbook editor dialog.
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Play, Sparkles, CheckCircle2, XCircle, Mail, MessageSquare, Clock, AlertTriangle } from 'lucide-react';

type Props = {
  playbookName: string;
  triggerJson: string;
  sequenceJson: string;
};

type AssignedLead = { id: string; first_name: string | null; last_name: string | null; email: string | null };

type SimResult = {
  ok: boolean;
  trigger_match: boolean;
  match_reasons: string[];
  lead_summary: { id: string; name: string; email: string | null; phone: string | null; language: string | null; status: string | null; tags: string[]; score: number };
  model: string;
  total_duration: string;
  step_count: number;
  steps: Array<{
    step: number;
    action: string;
    channel: string | null;
    delay_minutes: number;
    delay_label: string;
    cumulative_after: string;
    exit_on_reply: boolean;
    preview:
      | { kind: 'message'; subject: string | null; body: string; reasoning: string; confidence: number; language: string }
      | { kind: 'noop'; note: string }
      | { kind: 'skipped'; note: string }
      | { kind: 'error'; error: string };
  }>;
};

export function PlaybookSimulator({ playbookName, triggerJson, sequenceJson }: Props) {
  const [mode, setMode] = useState<'sample' | 'real'>('sample');
  const [sampleTags, setSampleTags] = useState('hot, presale-website');
  const [sampleLang, setSampleLang] = useState('en');
  const [sampleStatus, setSampleStatus] = useState('New Lead');
  const [sampleScore, setSampleScore] = useState(60);
  const [contactId, setContactId] = useState<string>('');
  const [leads, setLeads] = useState<AssignedLead[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);

  // Load Zara-assigned leads for the "real lead" picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: zara } = await supabase.from('crm_team').select('id, display_name').eq('slug', 'zara').maybeSingle();
      if (!zara) return;
      const keys = [zara.id, zara.display_name].filter(Boolean) as string[];
      const { data } = await supabase
        .from('crm_contacts')
        .select('id, first_name, last_name, email')
        .in('assigned_to', keys)
        .is('deleted_at', null)
        .limit(50);
      if (!cancelled) {
        setLeads((data ?? []) as AssignedLead[]);
        if (data?.[0]) setContactId(data[0].id);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const parsedSeq = useMemo(() => {
    try { const v = JSON.parse(sequenceJson || '[]'); return Array.isArray(v) ? v : []; }
    catch { return null; }
  }, [sequenceJson]);

  async function run() {
    let trig: any, seq: any;
    try { trig = JSON.parse(triggerJson || '{}'); } catch { return toast.error('Trigger JSON is invalid'); }
    try { seq = JSON.parse(sequenceJson || '[]'); } catch { return toast.error('Sequence JSON is invalid'); }
    if (!Array.isArray(seq) || seq.length === 0) return toast.error('Add at least one step to the sequence');

    setRunning(true);
    setResult(null);
    try {
      const payload: any = {
        playbook_name: playbookName,
        trigger_conditions: trig,
        behavior_sequence: seq,
      };
      if (mode === 'real' && contactId) payload.contact_id = contactId;
      else payload.sample_lead = {
        tags: sampleTags.split(',').map((s) => s.trim()).filter(Boolean),
        language: sampleLang,
        status: sampleStatus,
        score: sampleScore,
      };

      const { data, error } = await supabase.functions.invoke('zara-simulate-playbook', { body: payload });
      if (error) throw error;
      setResult(data as SimResult);
    } catch (e: any) {
      toast.error(e?.message ?? 'Simulation failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Simulator</h3>
          <span className="text-[11px] text-muted-foreground">— preview triggers + drafted messages without saving</span>
        </div>
        <div className="inline-flex rounded-md border border-border/60 p-0.5 text-[11px]">
          <button
            type="button"
            className={`px-2 py-0.5 rounded ${mode === 'sample' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setMode('sample')}
          >Sample lead</button>
          <button
            type="button"
            className={`px-2 py-0.5 rounded ${mode === 'real' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setMode('real')}
          >Real assigned lead</button>
        </div>
      </div>

      {mode === 'sample' ? (
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label className="text-[11px]">Tags (comma sep)</Label>
            <Input className="mt-1 h-8 text-xs" value={sampleTags} onChange={(e) => setSampleTags(e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px]">Language</Label>
            <Input className="mt-1 h-8 text-xs" value={sampleLang} onChange={(e) => setSampleLang(e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px]">Status</Label>
            <Input className="mt-1 h-8 text-xs" value={sampleStatus} onChange={(e) => setSampleStatus(e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px]">Score (0-100)</Label>
            <Input className="mt-1 h-8 text-xs" type="number" value={sampleScore} onChange={(e) => setSampleScore(Number(e.target.value))} />
          </div>
        </div>
      ) : (
        <div>
          <Label className="text-[11px]">Pick a Zara-assigned lead</Label>
          <select
            className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
          >
            {leads.length === 0 && <option value="">No assigned leads found</option>}
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {[l.first_name, l.last_name].filter(Boolean).join(' ') || '(no name)'} {l.email ? `· ${l.email}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={run} disabled={running}>
          <Play className="h-3.5 w-3.5 mr-1.5" /> {running ? 'Simulating…' : 'Run simulation'}
        </Button>
        {parsedSeq && <span className="text-[11px] text-muted-foreground">{parsedSeq.length} step(s) queued</span>}
        {!parsedSeq && <span className="text-[11px] text-rose-500">Sequence JSON invalid</span>}
      </div>

      {running && <Skeleton className="h-40" />}

      {result && (
        <div className="space-y-3">
          <Card className={result.trigger_match ? 'border-emerald-500/40' : 'border-amber-500/40'}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                {result.trigger_match
                  ? <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/15">Trigger matches</Badge>
                  : <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40">Trigger does not match</Badge>}
                <span className="text-[11px] text-muted-foreground">
                  {result.lead_summary.name} · score {result.lead_summary.score} · {result.lead_summary.language ?? 'en'} · {result.step_count} steps over {result.total_duration}
                </span>
              </div>
              <ul className="text-[11px] text-muted-foreground space-y-0.5">
                {result.match_reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    {result.trigger_match
                      ? <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                      : <XCircle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />}
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <ol className="space-y-2">
            {result.steps.map((s) => (
              <li key={s.step}>
                <Card>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-[10px] tabular-nums w-8 justify-center">#{s.step}</Badge>
                      {s.channel === 'email' ? <Mail className="h-3.5 w-3.5 text-primary" />
                        : s.channel === 'sms' || s.channel === 'whatsapp' ? <MessageSquare className="h-3.5 w-3.5 text-primary" />
                        : <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="font-medium">{s.action}</span>
                      {s.channel && <span className="text-[11px] text-muted-foreground">via {s.channel}</span>}
                      <span className="text-[11px] text-muted-foreground ml-auto">+{s.delay_label} (T+{s.cumulative_after})</span>
                      {s.exit_on_reply && <Badge variant="outline" className="text-[10px]">exit on reply</Badge>}
                    </div>

                    {s.preview.kind === 'message' && (
                      <div className="rounded-md border border-border/50 bg-background p-2.5 space-y-1.5">
                        {s.preview.subject && (
                          <div className="text-[11px]"><span className="text-muted-foreground">Subject:</span> <span className="font-medium">{s.preview.subject}</span></div>
                        )}
                        <div className="text-[12.5px] whitespace-pre-wrap leading-relaxed">{s.preview.body}</div>
                        <div className="flex items-center gap-3 text-[10.5px] text-muted-foreground pt-1 border-t border-border/40">
                          <span>conf {Math.round(s.preview.confidence * 100)}%</span>
                          <span>lang {s.preview.language}</span>
                          {s.preview.reasoning && <span className="italic truncate">{s.preview.reasoning}</span>}
                        </div>
                      </div>
                    )}
                    {s.preview.kind === 'noop' && <p className="text-[11px] text-muted-foreground italic">{s.preview.note}</p>}
                    {s.preview.kind === 'skipped' && (
                      <p className="text-[11px] text-amber-600 flex items-center gap-1.5"><AlertTriangle className="h-3 w-3"/>{s.preview.note}</p>
                    )}
                    {s.preview.kind === 'error' && (
                      <p className="text-[11px] text-rose-500 flex items-center gap-1.5"><XCircle className="h-3 w-3"/>{s.preview.error}</p>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
          <p className="text-[10.5px] text-muted-foreground italic">Nothing was saved or sent. Save the playbook to make it active.</p>
        </div>
      )}
    </div>
  );
}
