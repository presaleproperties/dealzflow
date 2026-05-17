import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';

type LeadProfile = 'first_time_buyer' | 'investor' | 'parent_for_kid' | 'upsizer' | 'downsizer' | 'other';

interface Props {
  contactId: string;
  contactName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Train Zara on this win" — pre-fills a winning conversation from the lead's
 * recent thread, lets the user trim/edit, then saves + embeds via zara-embed.
 */
export function TrainOnWinDialog({ contactId, contactName, open, onOpenChange }: Props) {
  const [leadProfile, setLeadProfile] = useState<LeadProfile>('first_time_buyer');
  const [projectType, setProjectType] = useState('');
  const [budgetRange, setBudgetRange] = useState('');
  const [primaryLanguage, setPrimaryLanguage] = useState('English');
  const [initialSituation, setInitialSituation] = useState('');
  const [turningMessage, setTurningMessage] = useState('');
  const [whyItWorked, setWhyItWorked] = useState('');
  const [outcome, setOutcome] = useState('Booked a showing');
  const [tagsText, setTagsText] = useState('');
  const [fullThread, setFullThread] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ['train-on-win-messages', contactId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from('crm_messages')
        .select('direction, content, channel, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true })
        .limit(60);
      return data ?? [];
    },
  });

  const renderedThread = useMemo(() => {
    return messages
      .filter((m: any) => (m.content ?? '').trim().length > 0)
      .map((m: any) => `[${m.direction}${m.channel ? ` · ${m.channel}` : ''}] ${m.content}`)
      .join('\n\n');
  }, [messages]);

  // Pre-fill once when the dialog opens / thread loads.
  useEffect(() => {
    if (!open) return;
    setFullThread((prev) => (prev ? prev : renderedThread));
    if (!initialSituation && messages.length > 0) {
      const firstInbound = messages.find((m: any) => m.direction === 'inbound')?.content ?? '';
      setInitialSituation(firstInbound.slice(0, 500));
    }
    if (!turningMessage && messages.length > 0) {
      // Best-guess: longest outbound message in the last third of the thread.
      const cutoff = Math.floor(messages.length * (2 / 3));
      const tail = messages.slice(cutoff).filter((m: any) => m.direction === 'outbound');
      const longest = tail.sort((a: any, b: any) => (b.content?.length ?? 0) - (a.content?.length ?? 0))[0];
      if (longest?.content) setTurningMessage(longest.content);
    }
  }, [open, renderedThread, messages, initialSituation, turningMessage]);

  const reset = () => {
    setLeadProfile('first_time_buyer');
    setProjectType('');
    setBudgetRange('');
    setPrimaryLanguage('English');
    setInitialSituation('');
    setTurningMessage('');
    setWhyItWorked('');
    setOutcome('Booked a showing');
    setTagsText('');
    setFullThread('');
  };

  const save = async () => {
    const missing: string[] = [];
    if (!initialSituation.trim()) missing.push('initial situation');
    if (!turningMessage.trim()) missing.push('turning message');
    if (!whyItWorked.trim()) missing.push('why it worked');
    if (!outcome.trim()) missing.push('outcome');
    if (!fullThread.trim()) missing.push('full thread');
    if (missing.length) {
      toast.error(`Fill in: ${missing.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();

      // Build the embedded text: profile + situation + turning + why + thread.
      const embedText = [
        `Profile: ${leadProfile}`,
        projectType && `Project: ${projectType}`,
        budgetRange && `Budget: ${budgetRange}`,
        primaryLanguage && `Language: ${primaryLanguage}`,
        `Initial: ${initialSituation}`,
        `Turning message: ${turningMessage}`,
        `Why it worked: ${whyItWorked}`,
        `Outcome: ${outcome}`,
        `Thread:\n${fullThread}`,
      ].filter(Boolean).join('\n\n');

      // Best-effort embedding; on failure we still save the row and queue a re-embed.
      let embedding: number[] | null = null;
      let embedError: string | null = null;
      try {
        const { data: embRes, error: embFnErr } = await supabase.functions.invoke('zara-embed', {
          body: { texts: [embedText.slice(0, 8000)] },
        });
        if (embFnErr) throw embFnErr;
        const arr = (embRes as any)?.embeddings?.[0];
        if (Array.isArray(arr)) embedding = arr;
        else throw new Error('embed returned no vector');
      } catch (e: any) {
        embedError = e?.message ?? String(e);
        console.warn('[train-on-win] embed failed, will queue re-embed', e);
      }

      const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);

      const { data: inserted, error } = await supabase
        .from('zara_winning_conversations')
        .insert({
          lead_profile: leadProfile,
          primary_language: primaryLanguage || null,
          budget_range: budgetRange || null,
          project_type: projectType || null,
          initial_situation: initialSituation,
          full_thread: fullThread,
          turning_message: turningMessage,
          why_it_worked: whyItWorked,
          outcome,
          source_contact_id: contactId,
          tags,
          embedding: embedding as any,
          created_by: u.user?.id ?? null,
        } as any)
        .select('id')
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

      // If the embedding failed, queue a background re-embed job and notify clearly.
      if (!embedding && inserted?.id) {
        const { error: qErr } = await supabase.from('zara_embed_queue').insert({
          kind: 'winning_conversation',
          target_id: inserted.id,
          embed_text: embedText.slice(0, 8000),
          enqueued_by: u.user?.id ?? null,
        } as any);
        if (qErr) {
          toast.warning('Saved, but could not queue re-embed', {
            description: `${embedError ?? 'embed failed'} · ${qErr.message}`,
            duration: 10000,
          });
        } else {
          toast.warning('Saved — embedding will retry in the background', {
            description: `${embedError ?? 'embed failed'}. Auto-retries with backoff up to 6 times.`,
            duration: 10000,
          });
        }
      } else {
        toast.success('Trained Zara on this win', {
          description: 'Indexed and ready to influence future drafts.',
        });
      }
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Train Zara on this win
          </DialogTitle>
          <p className="text-[12px] text-muted-foreground">
            Capture what worked with {contactName}. Zara retrieves similar wins when drafting future replies.
          </p>
        </DialogHeader>

        {loadingMsgs && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading thread…
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px]">Lead profile</Label>
            <select
              value={leadProfile}
              onChange={(e) => setLeadProfile(e.target.value as LeadProfile)}
              className="w-full h-9 px-2 rounded-md border border-input bg-background text-[12.5px]"
            >
              <option value="first_time_buyer">First-time buyer</option>
              <option value="investor">Investor</option>
              <option value="parent_for_kid">Parent buying for kid</option>
              <option value="upsizer">Upsizer</option>
              <option value="downsizer">Downsizer</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <Label className="text-[11px]">Primary language</Label>
            <Input value={primaryLanguage} onChange={(e) => setPrimaryLanguage(e.target.value)} className="h-9 text-[12.5px]" />
          </div>
          <div>
            <Label className="text-[11px]">Project type</Label>
            <Input value={projectType} onChange={(e) => setProjectType(e.target.value)} placeholder="presale condo / detached / townhome…" className="h-9 text-[12.5px]" />
          </div>
          <div>
            <Label className="text-[11px]">Budget range</Label>
            <Input value={budgetRange} onChange={(e) => setBudgetRange(e.target.value)} placeholder="$700k–$900k" className="h-9 text-[12.5px]" />
          </div>
        </div>

        <div>
          <Label className="text-[11px]">Initial situation</Label>
          <Textarea value={initialSituation} onChange={(e) => setInitialSituation(e.target.value)} rows={2} className="text-[12.5px]" placeholder="What did the lead originally say or want?" />
        </div>

        <div>
          <Label className="text-[11px]">Turning message (the one that worked)</Label>
          <Textarea value={turningMessage} onChange={(e) => setTurningMessage(e.target.value)} rows={3} className="text-[12.5px]" />
        </div>

        <div>
          <Label className="text-[11px]">Why it worked</Label>
          <Textarea value={whyItWorked} onChange={(e) => setWhyItWorked(e.target.value)} rows={2} className="text-[12.5px]" placeholder="Tone, timing, hook, social proof…" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px]">Outcome</Label>
            <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} className="h-9 text-[12.5px]" />
          </div>
          <div>
            <Label className="text-[11px]">Tags (comma-separated)</Label>
            <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="presale, langley, urgency" className="h-9 text-[12.5px]" />
          </div>
        </div>

        <div>
          <Label className="text-[11px]">Full thread (edit to trim noise)</Label>
          <Textarea value={fullThread} onChange={(e) => setFullThread(e.target.value)} rows={8} className="text-[12px] font-mono" />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : 'Train Zara'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
