/**
 * Inline panel on the lead detail that lists queued/needs-review emails
 * (rows in `crm_email_schedule` not yet sent for this contact) so the
 * assigned agent can preview the branded HTML, approve, send now, edit
 * subject, or cancel — without leaving the lead page.
 *
 * Mirrors the actions on /crm/needs-review but scoped to one contact and
 * adds "Send now" for already-approved-but-scheduled rows.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Check, X, Send, Mail, ChevronDown, ChevronRight, Loader2, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
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

  if (isLoading || rows.length === 0) return null;

  const reviewCount = rows.filter(r => r.needs_review).length;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Queued emails
        </span>
        <Pill tone="neutral" size="sm">{rows.length}</Pill>
        {reviewCount > 0 && <Pill tone="warning" size="sm">{reviewCount} need review</Pill>}
      </div>

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

              {isOpen && (
                <div className="mt-2 ml-5 space-y-2">
                  <div className="rounded border border-border bg-background overflow-hidden">
                    <iframe
                      title={`preview-${row.id}`}
                      srcDoc={row.body_html}
                      sandbox=""
                      className="w-full h-[420px] bg-white"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.needs_review && (
                      <Button size="sm" disabled={busy} onClick={() => approve(row)} className="h-7 gap-1.5">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Approve
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => sendNow(row)} className="h-7 gap-1.5">
                      <Send className="h-3.5 w-3.5" /> Send now
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => cancel(row)} className="h-7 gap-1.5 text-muted-foreground">
                      <X className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
