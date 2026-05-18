/**
 * Inline panel on the lead detail that lists queued/needs-review emails
 * (rows in `crm_email_schedule` not yet sent for this contact) so the
 * assigned agent can preview the branded HTML, approve, send now, edit
 * subject, or cancel — without leaving the lead page.
 *
 * Mirrors the actions on /crm/needs-review but scoped to one contact and
 * adds "Send now" for already-approved-but-scheduled rows.
 */
import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Check, X, Send, Mail, ChevronDown, ChevronRight, Loader2, Clock, AlertCircle, Pencil, Save, Code2, Type } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Pill } from '@/components/crm/shared/Pill';
import { toast } from 'sonner';

type Row = {
  id: string;
  subject: string;
  body_html: string;
  to_emails: string[];
  send_at: string;
  status: string;
  needs_review: boolean;
  review_reason: string | null;
  created_at: string;
};

export function ZaraQueuedEmailsPanel({ contactId }: { contactId: string }) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'rich' | 'html'>('rich');
  const [draftSubject, setDraftSubject] = useState('');
  const [draftHtml, setDraftHtml] = useState('');
  const richRef = useRef<HTMLDivElement | null>(null);

  const startEdit = (row: Row) => {
    setEditId(row.id);
    setOpenId(row.id);
    setEditMode('rich');
    setDraftSubject(row.subject ?? '');
    setDraftHtml(row.body_html ?? '');
  };
  const cancelEdit = () => { setEditId(null); setDraftSubject(''); setDraftHtml(''); };

  const saveEdits = async (row: Row, opts: { approve?: boolean; sendNow?: boolean } = {}) => {
    setBusyId(row.id);
    const patch: Record<string, unknown> = {
      subject: draftSubject.trim() || row.subject,
      body_html: draftHtml,
    };
    if (opts.approve || opts.sendNow) {
      patch.needs_review = false;
      patch.review_reason = null;
    }
    if (opts.sendNow) patch.send_at = new Date().toISOString();
    const { error } = await supabase.from('crm_email_schedule').update(patch).eq('id', row.id);
    if (error) {
      setBusyId(null);
      return toast.error(error.message);
    }
    if (opts.sendNow) {
      supabase.functions.invoke('process-scheduled-emails', { body: { source: 'lead_panel_edit', rowId: row.id } })
        .catch(() => { /* cron will pick it up */ });
    }
    setBusyId(null);
    setEditId(null);
    toast.success(
      opts.sendNow ? 'Saved & sending now' : opts.approve ? 'Saved & approved' : 'Changes saved',
    );
    invalidate();
  };


  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['lead-queued-emails', contactId],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from('crm_email_schedule')
        .select('id,subject,body_html,to_emails,send_at,status,needs_review,review_reason,created_at')
        .eq('contact_id', contactId)
        .in('status', ['pending'])
        .order('send_at', { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['lead-queued-emails', contactId] });

  const approve = async (row: Row) => {
    setBusyId(row.id);
    const { error } = await supabase
      .from('crm_email_schedule')
      .update({ needs_review: false, review_reason: null })
      .eq('id', row.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success('Approved — will send at scheduled time');
    invalidate();
  };

  const sendNow = async (row: Row) => {
    setBusyId(row.id);
    const { error: upErr } = await supabase
      .from('crm_email_schedule')
      .update({ needs_review: false, review_reason: null, send_at: new Date().toISOString() })
      .eq('id', row.id);
    if (upErr) {
      setBusyId(null);
      return toast.error(upErr.message);
    }
    // Kick the scheduler so it doesn't wait for the next cron tick.
    supabase.functions.invoke('process-scheduled-emails', { body: { source: 'lead_panel', rowId: row.id } })
      .catch(() => { /* cron will pick it up */ });
    setBusyId(null);
    toast.success('Sending now');
    invalidate();
  };

  const cancel = async (row: Row) => {
    setBusyId(row.id);
    const { error } = await supabase
      .from('crm_email_schedule')
      .update({ status: 'cancelled', needs_review: false, review_reason: 'Cancelled from lead page' })
      .eq('id', row.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success('Cancelled');
    invalidate();
  };

  // ─────────────────────────────────────────────────────────────
  // Also surface Zara-pending draft_email tool calls (live in chat,
  // not yet flushed to crm_email_schedule) so the agent can approve
  // or edit them directly on the lead page.
  // ─────────────────────────────────────────────────────────────
  type DraftRow = {
    id: string;
    tool_name: string;
    tool_input: { contact_id?: string; subject?: string; body?: string; cta_url?: string; purpose?: string };
    status: string;
    created_at: string;
  };
  const { data: drafts = [] } = useQuery({
    queryKey: ['lead-zara-pending-drafts', contactId],
    queryFn: async (): Promise<DraftRow[]> => {
      const { data, error } = await supabase
        .from('zara_pending_tool_calls')
        .select('id,tool_name,tool_input,status,created_at')
        .eq('status', 'pending')
        .eq('tool_name', 'draft_email')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      const all = (data ?? []) as DraftRow[];
      return all.filter(r => r.tool_input?.contact_id === contactId);
    },
    refetchInterval: 10_000,
  });

  const [draftEditId, setDraftEditId] = useState<string | null>(null);
  const [draftEditSubject, setDraftEditSubject] = useState('');
  const [draftEditBody, setDraftEditBody] = useState('');
  const [draftBusy, setDraftBusy] = useState<string | null>(null);

  const decideDraft = async (row: DraftRow, decision: 'approve' | 'deny') => {
    setDraftBusy(row.id);
    try {
      // Persist edits onto tool_input before approval so the executor uses them.
      if (decision === 'approve' && draftEditId === row.id) {
        const patched = {
          ...row.tool_input,
          subject: draftEditSubject.trim() || row.tool_input.subject,
          body: draftEditBody,
        };
        const { error: upErr } = await supabase
          .from('zara_pending_tool_calls')
          .update({ tool_input: patched })
          .eq('id', row.id);
        if (upErr) throw upErr;
      }
      const { data: sess } = await supabase.auth.getSession();
      const SB_URL = (import.meta as any).env.VITE_SUPABASE_URL;
      const resp = await fetch(`${SB_URL}/functions/v1/zara-tool-approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sess.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ pending_id: row.id, decision }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Decision failed');
      toast.success(decision === 'approve' ? 'Approved & sending' : 'Draft denied');
      setDraftEditId(null);
      qc.invalidateQueries({ queryKey: ['lead-zara-pending-drafts', contactId] });
      qc.invalidateQueries({ queryKey: ['lead-queued-emails', contactId] });
    } catch (e: any) {
      toast.error(e.message ?? 'Decision failed');
    } finally {
      setDraftBusy(null);
    }
  };

  if (isLoading) return null;
  if (rows.length === 0 && drafts.length === 0) return null;

  const reviewCount = rows.filter(r => r.needs_review).length;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Queued &amp; draft emails
        </span>
        {(rows.length + drafts.length) > 0 && (
          <Pill tone="neutral" size="sm">{rows.length + drafts.length}</Pill>
        )}
        {drafts.length > 0 && <Pill tone="warning" size="sm">{drafts.length} draft</Pill>}
        {reviewCount > 0 && <Pill tone="warning" size="sm">{reviewCount} need review</Pill>}
      </div>

      {drafts.length > 0 && (
        <ul className="divide-y divide-border border-b border-border">
          {drafts.map(d => {
            const editing = draftEditId === d.id;
            const busy = draftBusy === d.id;
            const subj = editing ? draftEditSubject : (d.tool_input.subject ?? '(no subject)');
            const body = editing ? draftEditBody : (d.tool_input.body ?? '');
            return (
              <li key={d.id} className="px-3 py-2.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground truncate">{subj || '(no subject)'}</span>
                  <Pill tone="warning" size="sm">zara draft</Pill>
                  <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</span>
                </div>
                {editing ? (
                  <div className="space-y-2">
                    <Input
                      value={draftEditSubject}
                      onChange={(e) => setDraftEditSubject(e.target.value)}
                      className="h-8 text-sm"
                      placeholder="Subject"
                    />
                    <Textarea
                      value={draftEditBody}
                      onChange={(e) => setDraftEditBody(e.target.value)}
                      rows={8}
                      className="text-sm"
                      placeholder="Body"
                    />
                    <p className="text-[10px] text-muted-foreground">Branded template + signature are applied when Zara sends.</p>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-[12.5px] leading-snug text-foreground/90 bg-muted/30 rounded p-2 max-h-[260px] overflow-y-auto font-sans">{body}</pre>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {editing ? (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => decideDraft(d, 'approve')} className="h-7 gap-1.5">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Save &amp; send
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraftEditId(null)} className="h-7 gap-1.5 text-muted-foreground">
                        <X className="h-3.5 w-3.5" /> Discard edits
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => decideDraft(d, 'approve')} className="h-7 gap-1.5">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Approve &amp; send
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setDraftEditId(d.id);
                          setDraftEditSubject(d.tool_input.subject ?? '');
                          setDraftEditBody(d.tool_input.body ?? '');
                        }}
                        className="h-7 gap-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => decideDraft(d, 'deny')} className="h-7 gap-1.5 text-muted-foreground">
                        <X className="h-3.5 w-3.5" /> Deny
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}


      <ul className="divide-y divide-border">
        {rows.map(row => {
          const isOpen = openId === row.id;
          const busy = busyId === row.id;
          const sendIn = formatDistanceToNow(new Date(row.send_at), { addSuffix: true });
          return (
            <li key={row.id} className="px-3 py-2.5">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : row.id)}
                  className="mt-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">{row.subject || '(no subject)'}</span>
                    {row.needs_review ? (
                      <Pill tone="warning" size="sm">needs review</Pill>
                    ) : (
                      <Pill tone="neutral" size="sm">scheduled</Pill>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>sends {sendIn}</span>
                    <span>·</span>
                    <span className="truncate">{(row.to_emails ?? []).join(', ')}</span>
                  </div>
                  {row.review_reason && (
                    <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                      <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>{row.review_reason}</span>
                    </div>
                  )}
                </div>
              </div>

              {isOpen && (() => {
                const isEditing = editId === row.id;
                const previewHtml = isEditing ? draftHtml : row.body_html;
                return (
                  <div className="mt-2 ml-5 space-y-2">
                    {isEditing && (
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Subject
                          </label>
                          <Input
                            value={draftSubject}
                            onChange={(e) => setDraftSubject(e.target.value)}
                            className="h-8 mt-1 text-sm"
                            placeholder="Email subject"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Body
                            </label>
                            <div className="inline-flex rounded border border-border overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setEditMode('rich')}
                                className={`px-2 py-0.5 text-[10px] inline-flex items-center gap-1 ${editMode === 'rich' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}
                              ><Type className="h-3 w-3" /> Rich</button>
                              <button
                                type="button"
                                onClick={() => setEditMode('html')}
                                className={`px-2 py-0.5 text-[10px] inline-flex items-center gap-1 border-l border-border ${editMode === 'html' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}
                              ><Code2 className="h-3 w-3" /> HTML</button>
                            </div>
                          </div>
                          {editMode === 'rich' ? (
                            <div
                              ref={richRef}
                              contentEditable
                              suppressContentEditableWarning
                              onInput={(e) => setDraftHtml((e.target as HTMLDivElement).innerHTML)}
                              dangerouslySetInnerHTML={{ __html: draftHtml }}
                              className="mt-1 min-h-[200px] max-h-[360px] overflow-y-auto rounded border border-border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 prose prose-sm max-w-none dark:prose-invert"
                            />
                          ) : (
                            <Textarea
                              value={draftHtml}
                              onChange={(e) => setDraftHtml(e.target.value)}
                              rows={10}
                              className="mt-1 font-mono text-xs"
                              placeholder="<p>Hi {{first_name}}, …</p>"
                            />
                          )}
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {editMode === 'rich' ? 'Type to edit. Branded template + signature are re-applied on send.' : 'Edit raw HTML. Preview updates live.'}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="rounded border border-border bg-background overflow-hidden">
                      <iframe
                        title={`preview-${row.id}`}
                        srcDoc={previewHtml}
                        sandbox=""
                        className="w-full h-[420px] bg-white"
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {isEditing ? (
                        <>
                          <Button size="sm" disabled={busy} onClick={() => saveEdits(row, { approve: true })} className="h-7 gap-1.5">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Save &amp; approve
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => saveEdits(row, { sendNow: true })} className="h-7 gap-1.5">
                            <Send className="h-3.5 w-3.5" /> Save &amp; send now
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => saveEdits(row)} className="h-7 gap-1.5">
                            <Save className="h-3.5 w-3.5" /> Save only
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={cancelEdit} className="h-7 gap-1.5 text-muted-foreground">
                            <X className="h-3.5 w-3.5" /> Discard
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" disabled={busy} onClick={() => sendNow(row)} className="h-7 gap-1.5">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            {row.needs_review ? 'Approve & send' : 'Send now'}
                          </Button>
                          {row.needs_review && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => approve(row)} className="h-7 gap-1.5">
                              <Check className="h-3.5 w-3.5" /> Approve only
                            </Button>
                          )}
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => startEdit(row)} className="h-7 gap-1.5">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => cancel(row)} className="h-7 gap-1.5 text-muted-foreground">
                            <X className="h-3.5 w-3.5" /> Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
