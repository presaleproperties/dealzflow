import { useMemo, useState } from 'react';
import { Sparkles, Send, Pencil, Info, X, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Pill } from '@/components/crm/shared/Pill';
import { useAuth } from '@/hooks/useAuth';
import { useLeadZaraDraft, type ZaraLeadDraft } from '@/hooks/useLeadZaraDraft';
import { cn } from '@/lib/utils';

interface Props {
  contactId: string;
}

const AUTO_SEND_TOPICS = new Set([
  'price_list',
  'sqft',
  'completion_date',
  'deposit_structure',
  'brochure_request',
  'generic_thanks',
  'faq',
]);

export function ZaraReplyChip({ contactId }: Props) {
  const { data: draft } = useLeadZaraDraft(contactId);
  if (!draft) return null;
  return <ZaraReplyChipInner draft={draft} />;
}

function ZaraReplyChipInner({ draft }: { draft: ZaraLeadDraft }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.draft_text);
  const [sending, setSending] = useState(false);
  const [undoToken, setUndoToken] = useState<{ id: string; until: number } | null>(null);

  const confidencePct = draft.confidence != null ? Math.round(Number(draft.confidence) * 100) : null;
  const autoEligible = useMemo(() => {
    const intentOk = draft.intent ? AUTO_SEND_TOPICS.has(draft.intent) : false;
    const confOk = (draft.confidence ?? 0) >= 0.9;
    const noGuardrails = !draft.guardrails_hit?.length;
    return intentOk && confOk && noGuardrails;
  }, [draft]);

  const sources = useMemo(() => {
    const out: { label: string; detail?: string }[] = [];
    const s = draft.consulted_sources;
    if (s && typeof s === 'object') {
      for (const [k, v] of Object.entries(s)) {
        if (!v) continue;
        out.push({ label: k.replace(/_/g, ' '), detail: typeof v === 'string' ? v : JSON.stringify(v).slice(0, 120) });
      }
    }
    const c = Array.isArray(draft.citations) ? draft.citations : [];
    for (const cit of c) {
      const lbl = (cit && (cit.title || cit.source || cit.label)) || 'citation';
      const det = (cit && (cit.snippet || cit.url || cit.detail)) || undefined;
      out.push({ label: String(lbl), detail: det ? String(det).slice(0, 120) : undefined });
    }
    return out;
  }, [draft]);

  const approve = async (finalText: string) => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('zara-execute-send', {
        body: { draftId: draft.id, finalText },
      });
      if (error) throw error;
      const res = data as any;
      if (res?.blocked) {
        toast.warning(`Sandbox: would send to ${res.would_send_to ?? '(no recipient)'}`);
      } else {
        toast.success('Reply sent');
        setUndoToken({ id: draft.id, until: Date.now() + 60_000 });
      }
      qc.invalidateQueries({ queryKey: ['zara-lead-draft', draft.contact_id] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const dismiss = async () => {
    await supabase.from('zara_suggested_replies').update({ status: 'rejected' }).eq('id', draft.id);
    await supabase.from('zara_approval_decisions').insert({
      draft_id: draft.id,
      contact_id: draft.contact_id,
      decision: 'reject',
      original_text: draft.draft_text,
      decided_by: session?.user?.id,
      decided_via: 'lead_detail_chip',
    } as any);
    toast.success('Dismissed');
    qc.invalidateQueries({ queryKey: ['zara-lead-draft', draft.contact_id] });
  };

  const undo = async () => {
    await supabase.from('crm_zara_outbound_audit').insert({
      draft_id: draft.id,
      contact_id: draft.contact_id,
      channel: draft.channel,
      decision: 'undone',
      decision_reason: 'user_pressed_undo_within_60s',
      meta: { source: 'lead_detail_chip' },
    } as any);
    setUndoToken(null);
    toast.success('Marked as undone in audit log');
  };

  // ── Post-send undo strip (60s) ────────────────────────────────────────────
  if (undoToken) {
    const secondsLeft = Math.max(0, Math.ceil((undoToken.until - Date.now()) / 1000));
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Sent · undo within {secondsLeft}s</span>
        <Button size="sm" variant="ghost" onClick={undo} className="h-7 gap-1.5">
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[hsl(43_60%_55%/0.35)] bg-[hsl(43_60%_55%/0.06)] px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-[hsl(43_60%_55%)]" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(43_60%_55%)]">Zara draft</span>
        <Pill tone="neutral" size="sm">{draft.channel}</Pill>
        {draft.intent && <Pill tone="neutral" size="sm">{draft.intent.replace(/_/g, ' ')}</Pill>}
        {confidencePct != null && (
          <Pill tone={confidencePct >= 90 ? 'success' : confidencePct >= 70 ? 'neutral' : 'warning'} size="sm">
            {confidencePct}%
          </Pill>
        )}
        {autoEligible && <Pill tone="success" size="sm">auto-eligible</Pill>}
        {draft.guardrails_hit?.length > 0 && (
          <Pill tone="warning" size="sm">guarded</Pill>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">draft only</span>
      </div>

      {editing ? (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="mb-2 text-sm"
        />
      ) : (
        <p className="mb-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{draft.draft_text}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {editing ? (
          <>
            <Button size="sm" disabled={sending} onClick={() => approve(text)} className="h-7 gap-1.5">
              <Send className="h-3.5 w-3.5" /> Send edited
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(draft.draft_text); }} className="h-7">
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={sending} onClick={() => approve(draft.draft_text)} className="h-7 gap-1.5">
              <Send className="h-3.5 w-3.5" /> Accept &amp; send
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="h-7 gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          </>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 gap-1.5">
              <Info className="h-3.5 w-3.5" /> Why this?
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 text-xs" align="start">
            <div className="space-y-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Inbound</div>
                <div className="mt-0.5 text-foreground">{draft.inbound_text}</div>
              </div>
              {sources.length > 0 ? (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sources</div>
                  <ul className="mt-1 space-y-1">
                    {sources.map((s, i) => (
                      <li key={i} className="rounded bg-muted/40 px-2 py-1">
                        <div className="font-medium text-foreground">{s.label}</div>
                        {s.detail && <div className="text-muted-foreground">{s.detail}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-muted-foreground">No source citations recorded.</div>
              )}
              {draft.guardrails_hit?.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Guardrails</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {draft.guardrails_hit.map((g) => (
                      <Pill key={g} tone="warning" size="sm">{g}</Pill>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <Button size="sm" variant="ghost" onClick={dismiss} className={cn('h-7 gap-1.5 text-muted-foreground')}>
          <X className="h-3.5 w-3.5" /> Dismiss
        </Button>
      </div>
    </div>
  );
}
