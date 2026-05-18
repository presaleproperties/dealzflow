/**
 * ZaraDraftCard — rich inline preview + actions for any draft_email /
 * draft_sms / draft_whatsapp tool call inside the Zara chat.
 *
 * Two states:
 *  - pending approval (zara_pending_tool_calls row): preview tool input,
 *    Approve / Edit & approve / Deny. Approve runs zara-tool-approve which
 *    executes the tool (creates a zara_suggested_replies row).
 *  - draft created (tool result with draft_id): fetch the suggested reply,
 *    show a Plain ↔ Branded HTML preview toggle, plus Send / Edit / Discard
 *    and quick-refinement chips ("Shorter", "Warmer", "More urgent",
 *    "Translate to Punjabi") which kick a new Zara turn to rewrite the draft.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Pencil, X, Eye, Type, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Pill } from '@/components/crm/shared/Pill';
import type { ToolUiState } from '@/hooks/useZaraDockChat';

const REFINEMENTS = [
  'Make it shorter',
  'Warmer tone',
  'More urgent',
  'Translate to Punjabi',
] as const;

interface Props {
  tool: ToolUiState;
  channel: 'email' | 'sms' | 'whatsapp';
  decide: (pending_id: string, decision: 'approve' | 'deny') => Promise<void>;
  /** Fire a new Zara turn (used by refinement chips). */
  onChip: (text: string) => void;
}

export function ZaraDraftCard({ tool, channel, decide, onChip }: Props) {
  const qc = useQueryClient();
  const draftId = (tool.output as any)?.draft_id as string | undefined;
  const [previewMode, setPreviewMode] = useState<'plain' | 'branded'>(channel === 'email' ? 'branded' : 'plain');
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [busy, setBusy] = useState<'approve' | 'deny' | 'send' | null>(null);

  // Load the suggested-reply row once the draft has been created (post-approval).
  const { data: draft } = useQuery({
    queryKey: ['zara-suggested-reply', draftId],
    enabled: !!draftId,
    queryFn: async () => {
      const { data } = await supabase
        .from('zara_suggested_replies')
        .select('id, draft_subject, draft_text, draft_html, status, sent_at, contact_id, channel')
        .eq('id', draftId!)
        .maybeSingle();
      return data as {
        id: string; draft_subject: string | null; draft_text: string | null;
        draft_html: string | null; status: string; sent_at: string | null;
        contact_id: string; channel: string;
      } | null;
    },
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 4000 : false),
  });

  const isPendingApproval = tool.status === 'pending' && !!tool.pending_id;
  const input = (tool.input ?? {}) as { subject?: string; body?: string; cta_text?: string; cta_url?: string };

  // Seed the editor with current values when toggled on.
  useEffect(() => {
    if (editing) {
      setEditText(draft?.draft_text ?? input.body ?? '');
      setEditSubject(draft?.draft_subject ?? input.subject ?? '');
    }
  }, [editing, draft?.draft_text, draft?.draft_subject, input.body, input.subject]);

  const channelLabel = channel === 'email' ? 'Email' : channel === 'sms' ? 'SMS' : 'WhatsApp';

  const sendNow = async (textOverride?: string) => {
    if (!draft) return;
    setBusy('send');
    try {
      const finalText = (textOverride ?? draft.draft_text ?? '').trim();
      if (!finalText) throw new Error('Draft body is empty');
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke('zara-execute-send', {
        body: { draftId: draft.id, finalText, decidedBy: u.user?.id, decidedVia: 'chat_inline' },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if ((data as any)?.blocked) {
        toast.warning('Sandbox blocked — flip Zara to LIVE to send to real leads');
      } else {
        toast.success(`${channelLabel} sent`);
      }
      qc.invalidateQueries({ queryKey: ['zara-suggested-reply', draft.id] });
    } catch (e: any) {
      toast.error(e.message ?? 'Send failed');
    } finally {
      setBusy(null);
    }
  };

  const saveEditAndSend = async () => {
    if (!draft) return;
    if (editText.trim().length === 0) { toast.error('Body cannot be empty'); return; }
    setBusy('send');
    try {
      const patch: Record<string, unknown> = { draft_text: editText };
      if (channel === 'email') patch.draft_subject = editSubject;
      const { error: upErr } = await supabase.from('zara_suggested_replies').update(patch).eq('id', draft.id);
      if (upErr) throw upErr;
      setEditing(false);
      await sendNow(editText);
    } catch (e: any) {
      toast.error(e.message ?? 'Save failed');
      setBusy(null);
    }
  };

  const discard = async () => {
    if (!draft) return;
    setBusy('deny');
    try {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from('zara_suggested_replies').update({ status: 'rejected' }).eq('id', draft.id);
      await supabase.from('zara_approval_decisions').insert({
        draft_id: draft.id, contact_id: draft.contact_id,
        decision: 'reject', original_text: draft.draft_text ?? '',
        decided_by: u.user?.id, decided_via: 'chat_inline',
      });
      toast.success('Draft discarded');
      qc.invalidateQueries({ queryKey: ['zara-suggested-reply', draft.id] });
    } catch (e: any) {
      toast.error(e.message ?? 'Discard failed');
    } finally {
      setBusy(null);
    }
  };

  const tone = draft?.status === 'sent' ? 'success'
    : draft?.status === 'rejected' || draft?.status === 'sandbox_blocked' ? 'danger'
    : isPendingApproval ? 'warning' : 'muted';
  const statusLabel = draft?.status === 'sent' ? 'Sent'
    : draft?.status === 'rejected' ? 'Discarded'
    : draft?.status === 'sandbox_blocked' ? 'Sandbox'
    : isPendingApproval ? 'Awaiting approval' : 'Ready to send';

  const previewBody = draft?.draft_text ?? input.body ?? '';
  const previewSubject = draft?.draft_subject ?? input.subject ?? '';
  const canShowBranded = channel === 'email' && !!draft?.draft_html;

  // ─── PENDING APPROVAL STATE ───────────────────────────────────────────────
  if (isPendingApproval) {
    return (
      <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
        <div className="px-3 py-2 flex items-center justify-between border-b border-border/60 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="zara-eyebrow">{channelLabel} draft</span>
            <Pill size="sm" tone="warning">Awaiting approval</Pill>
          </div>
        </div>
        {channel === 'email' && previewSubject && (
          <div className="px-3 pt-2 text-[12px] text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wider mr-1.5">Subject</span>
            <span className="text-foreground font-medium">{previewSubject}</span>
          </div>
        )}
        <div className="px-3 py-2.5 text-[13px] whitespace-pre-wrap text-foreground/90 max-h-[260px] overflow-y-auto">
          {previewBody || <span className="text-muted-foreground italic">(empty)</span>}
        </div>
        <div className="px-3 py-2 border-t border-border/60 bg-muted/20 flex flex-wrap items-center gap-1.5">
          <Button
            size="sm" disabled={busy !== null}
            onClick={async () => { setBusy('approve'); try { await decide(tool.pending_id!, 'approve'); } finally { setBusy(null); } }}
            className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {busy === 'approve' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
            Approve & send
          </Button>
          <Button
            size="sm" variant="ghost" disabled={busy !== null}
            onClick={async () => { setBusy('deny'); try { await decide(tool.pending_id!, 'deny'); } finally { setBusy(null); } }}
            className="h-8"
          >
            <X className="w-3.5 h-3.5 mr-1.5" />Deny
          </Button>
          <div className="flex-1" />
          {REFINEMENTS.map((r) => (
            <button key={r} onClick={() => onChip(`${r} — keep the same intent.`)}
              className="text-[11px] px-2 py-1 rounded-full bg-foreground/[0.05] hover:bg-primary/10 hover:text-primary transition-colors">
              {r}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── POST-APPROVAL: DRAFT EXISTS ──────────────────────────────────────────
  if (!draftId) {
    // Tool errored or finished without creating a draft — render compact pill only.
    return (
      <div className="rounded-md border border-border/60 bg-card text-[11px] px-2 py-1 inline-flex items-center gap-1.5">
        <Pill size="sm" tone={tool.status === 'error' ? 'danger' : 'muted'}>{tool.status}</Pill>
        <span className="font-mono">draft_{channel}</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="zara-eyebrow">{channelLabel} draft</span>
          <Pill size="sm" tone={tone as any}>{statusLabel}</Pill>
        </div>
        {canShowBranded && !editing && (
          <button
            onClick={() => setPreviewMode((m) => (m === 'branded' ? 'plain' : 'branded'))}
            className="text-[10.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {previewMode === 'branded' ? <Type className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {previewMode === 'branded' ? 'Plain' : 'Branded'}
          </button>
        )}
      </div>

      {channel === 'email' && !editing && previewSubject && (
        <div className="px-3 pt-2 text-[12px] text-muted-foreground">
          <span className="text-[10px] uppercase tracking-wider mr-1.5">Subject</span>
          <span className="text-foreground font-medium">{previewSubject}</span>
        </div>
      )}

      {editing ? (
        <div className="p-3 space-y-2">
          {channel === 'email' && (
            <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} placeholder="Subject" className="h-8 text-[13px]" />
          )}
          <Textarea
            value={editText} onChange={(e) => setEditText(e.target.value)}
            rows={8} className="text-[13px] leading-relaxed font-[inherit]"
          />
        </div>
      ) : previewMode === 'branded' && canShowBranded ? (
        <div className="bg-neutral-100 dark:bg-neutral-900 p-2 sm:p-3">
          <iframe
            title="Email preview"
            srcDoc={draft!.draft_html!}
            sandbox=""
            className="w-full rounded-md bg-white shadow-sm h-[380px] sm:h-[480px] md:h-[560px]"
            style={{ border: 0 }}
          />
        </div>

      ) : (
        <div className="px-3 py-2.5 text-[13px] whitespace-pre-wrap text-foreground/90 max-h-[320px] overflow-y-auto">
          {previewBody || <span className="text-muted-foreground italic">(empty)</span>}
        </div>
      )}

      <div className="px-3 py-2 border-t border-border/60 bg-muted/20 flex flex-wrap items-center gap-1.5">
        {draft?.status === 'pending' && !editing && (
          <>
            <Button size="sm" disabled={busy !== null}
              onClick={() => sendNow()}
              className="h-8 bg-primary text-primary-foreground hover:bg-primary/90">
              {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
              Send now
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setEditing(true)} className="h-8">
              <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={discard} className="h-8 text-destructive hover:text-destructive">
              <X className="w-3.5 h-3.5 mr-1.5" />Discard
            </Button>
          </>
        )}
        {draft?.status === 'pending' && editing && (
          <>
            <Button size="sm" disabled={busy !== null} onClick={saveEditAndSend} className="h-8 bg-primary text-primary-foreground hover:bg-primary/90">
              {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
              Save & send
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setEditing(false)} className="h-8">Cancel</Button>
          </>
        )}
        {draft?.status === 'sent' && (
          <span className="text-[11.5px] text-muted-foreground">Delivered{draft.sent_at ? ` · ${new Date(draft.sent_at).toLocaleString()}` : ''}</span>
        )}
        {!editing && draft?.status === 'pending' && (
          <>
            <div className="flex-1" />
            {REFINEMENTS.map((r) => (
              <button key={r} onClick={() => onChip(`${r} — rewrite this draft.`)}
                className="text-[11px] px-2 py-1 rounded-full bg-foreground/[0.05] hover:bg-primary/10 hover:text-primary transition-colors">
                {r}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
