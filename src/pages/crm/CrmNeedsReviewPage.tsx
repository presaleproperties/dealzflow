/**
 * /crm/needs-review — Inbox of scheduled emails flagged needs_review=true.
 *
 * Visibility is governed by the existing `crm_email_schedule` RLS, which
 * already restricts SELECTs to contacts the current agent can see, so the
 * list naturally scopes to the assigned agent. Admins see everything.
 *
 * Approve  → clears needs_review (row stays `pending`, scheduler will send).
 * Reject   → sets status='cancelled' (scheduler skips non-pending rows).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Check, X, Loader2, Mail, ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/crm/shared/Pill';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

type Row = {
  id: string;
  contact_id: string | null;
  template_id: string | null;
  to_emails: string[];
  cc: string | null;
  bcc: string | null;
  subject: string;
  body_html: string;
  send_at: string;
  status: string;
  review_reason: string | null;
  created_at: string;
  created_by: string;
};

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  assigned_to: string | null;
};

export default function CrmNeedsReviewPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rejectRow, setRejectRow] = useState<Row | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['crm-needs-review'],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from('crm_email_schedule')
        .select('id,contact_id,template_id,to_emails,cc,bcc,subject,body_html,send_at,status,review_reason,created_at,created_by')
        .eq('needs_review', true)
        .neq('status', 'sent')
        .neq('status', 'cancelled')
        .order('send_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const contactIds = useMemo(
    () => Array.from(new Set(rows.map(r => r.contact_id).filter(Boolean))) as string[],
    [rows],
  );

  const { data: contacts = [] } = useQuery({
    queryKey: ['crm-needs-review-contacts', contactIds.join(',')],
    enabled: contactIds.length > 0,
    queryFn: async (): Promise<Contact[]> => {
      const { data } = await supabase
        .from('crm_contacts')
        .select('id,first_name,last_name,assigned_to')
        .in('id', contactIds);
      return (data ?? []) as Contact[];
    },
  });
  const contactMap = useMemo(() => {
    const m = new Map<string, Contact>();
    contacts.forEach(c => m.set(c.id, c));
    return m;
  }, [contacts]);

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const approve = async (row: Row) => {
    setBusyId(row.id);
    const { error } = await supabase
      .from('crm_email_schedule')
      .update({ needs_review: false, review_reason: null })
      .eq('id', row.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Approved — will send at scheduled time');
    qc.invalidateQueries({ queryKey: ['crm-needs-review'] });
  };

  const reject = async () => {
    if (!rejectRow) return;
    setBusyId(rejectRow.id);
    const reason = rejectReason.trim();
    const { error } = await supabase
      .from('crm_email_schedule')
      .update({
        status: 'cancelled',
        needs_review: false,
        review_reason: reason
          ? `Rejected: ${reason}`
          : (rejectRow.review_reason ?? 'Rejected by agent'),
      })
      .eq('id', rejectRow.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Rejected');
    setRejectRow(null);
    setRejectReason('');
    qc.invalidateQueries({ queryKey: ['crm-needs-review'] });
  };

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-6 max-w-[1100px] mx-auto">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" />
            Needs Review
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scheduled emails waiting on your approval before they send.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {rows.length} pending
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-16 text-center">
          <Mail className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm font-medium">Inbox zero</div>
          <div className="text-xs text-muted-foreground mt-1">
            Nothing scheduled needs your review right now.
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(row => {
            const c = row.contact_id ? contactMap.get(row.contact_id) : null;
            const name = c
              ? [c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)'
              : '(no contact)';
            const isOpen = expanded.has(row.id);
            const busy = busyId === row.id;
            const sendIn = formatDistanceToNow(new Date(row.send_at), { addSuffix: true });

            return (
              <li
                key={row.id}
                className="border border-border rounded-lg bg-card overflow-hidden"
              >
                <div className="flex items-start gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => toggle(row.id)}
                    className="mt-0.5 p-0.5 text-muted-foreground hover:text-foreground shrink-0"
                    aria-label={isOpen ? 'Collapse' : 'Expand'}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {row.contact_id ? (
                        <Link
                          to={`/crm/leads/${row.contact_id}`}
                          className="text-sm font-medium hover:text-primary truncate"
                        >
                          {name}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">{name}</span>
                      )}
                      <Pill size="sm" tone="warning">Needs review</Pill>
                      {row.template_id && (
                        <Pill size="sm" tone="muted">{row.template_id}</Pill>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                        sends {sendIn}
                      </span>
                    </div>

                    <div className="mt-1 text-sm truncate">
                      <span className="text-muted-foreground">Subject:</span>{' '}
                      <span className="font-medium">{row.subject || '(no subject)'}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      To: {row.to_emails?.join(', ') || '—'}
                    </div>
                    {row.review_reason && (
                      <div className="text-xs text-amber-500 mt-1">
                        Reason: {row.review_reason}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setRejectRow(row); setRejectReason(''); }}
                      disabled={busy}
                    >
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button size="sm" onClick={() => approve(row)} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                      Approve
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-border bg-muted/20 px-3 py-3">
                    <div className="text-xs text-muted-foreground mb-2">Preview</div>
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert text-sm border border-border rounded bg-background p-3 overflow-auto max-h-[420px]"
                      dangerouslySetInnerHTML={{ __html: row.body_html || '<em>(empty body)</em>' }}
                    />
                    {(row.cc || row.bcc) && (
                      <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                        {row.cc && <div>Cc: {row.cc}</div>}
                        {row.bcc && <div>Bcc: {row.bcc}</div>}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!rejectRow} onOpenChange={(o) => { if (!o) { setRejectRow(null); setRejectReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject scheduled email</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              This will cancel the send. Optionally note why.
            </div>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Wrong project, lead already replied, content off-tone…"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectRow(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject} disabled={busyId === rejectRow?.id}>
              {busyId === rejectRow?.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
