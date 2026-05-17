import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Pill } from '@/components/crm/shared/Pill';
import { Input } from '@/components/ui/input';

type Draft = {
  id: string;
  contact_id: string;
  channel: string;
  trigger_kind: string;
  status: string;
  subject: string | null;
  scheduled_for: string;
  sent_at: string | null;
  created_at: string;
  send_meta: any;
};

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  last_touch_at: string | null;
  status: string | null;
};

type Row = {
  contact: Contact;
  latest: Draft;
  step: number;
  total: number;
  lastSentAt: string | null;
  outboundId: string | null;
};

function extractOutboundId(send_meta: any): string | null {
  if (!send_meta || typeof send_meta !== 'object') return null;
  return (
    send_meta.gmail_message_id ||
    send_meta.message_id ||
    send_meta.twilio_message_sid ||
    send_meta.sid ||
    send_meta.id ||
    null
  );
}

function statusTone(s: string): 'primary' | 'success' | 'danger' | 'muted' | 'info' {
  if (s === 'sent') return 'success';
  if (s === 'pending' || s === 'scheduled') return 'primary';
  if (s === 'rejected' || s === 'sandbox_blocked' || s === 'failed') return 'danger';
  if (s === 'approved' || s === 'edited_approved') return 'info';
  return 'muted';
}

export default function ZaraEngagementStatusPage() {
  const [q, setQ] = useState('');

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ['zara-engagement-drafts'],
    queryFn: async (): Promise<Draft[]> => {
      const { data } = await supabase
        .from('crm_zara_drafts')
        .select('id, contact_id, channel, trigger_kind, status, subject, scheduled_for, sent_at, created_at, send_meta')
        .order('created_at', { ascending: false })
        .limit(500);
      return (data as Draft[]) ?? [];
    },
    refetchInterval: 30_000,
  });

  const contactIds = useMemo(
    () => Array.from(new Set(drafts.map((d) => d.contact_id))).filter(Boolean),
    [drafts],
  );

  const { data: contacts = [] } = useQuery({
    queryKey: ['zara-engagement-contacts', contactIds.join(',')],
    enabled: contactIds.length > 0,
    queryFn: async (): Promise<Contact[]> => {
      const { data } = await supabase
        .from('crm_contacts')
        .select('id, first_name, last_name, email, last_touch_at, status')
        .in('id', contactIds);
      return (data as Contact[]) ?? [];
    },
  });

  const rows: Row[] = useMemo(() => {
    const byContact = new Map<string, Contact>();
    contacts.forEach((c) => byContact.set(c.id, c));
    const grouped = new Map<string, Draft[]>();
    drafts.forEach((d) => {
      const arr = grouped.get(d.contact_id) ?? [];
      arr.push(d);
      grouped.set(d.contact_id, arr);
    });
    const out: Row[] = [];
    grouped.forEach((list, contactId) => {
      const contact = byContact.get(contactId);
      if (!contact) return;
      const latest = list[0];
      const sent = list.filter((d) => d.status === 'sent');
      const lastSent = sent.find((d) => d.sent_at) ?? null;
      out.push({
        contact,
        latest,
        step: sent.length,
        total: list.length,
        lastSentAt: lastSent?.sent_at ?? null,
        outboundId: extractOutboundId(lastSent?.send_meta),
      });
    });
    return out.sort((a, b) => {
      const aTs = new Date(a.latest.created_at).getTime();
      const bTs = new Date(b.latest.created_at).getTime();
      return bTs - aTs;
    });
  }, [drafts, contacts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const name = `${r.contact.first_name ?? ''} ${r.contact.last_name ?? ''}`.toLowerCase();
      return (
        name.includes(needle) ||
        (r.contact.email ?? '').toLowerCase().includes(needle) ||
        r.latest.trigger_kind.toLowerCase().includes(needle)
      );
    });
  }, [rows, q]);

  return (
    <div className="m-page">
      <div className="flex flex-col gap-1.5">
        <h1 className="crm-h1">Engagement status</h1>
        <p className="text-sm text-muted-foreground">
          Live view of every lead Zara is nudging — last touch, current trigger, outbound message id, and step in the flow.
        </p>
      </div>

      <div className="mt-4 mb-3">
        <Input
          placeholder="Search by name, email, or trigger…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.4fr_0.6fr] gap-3 px-4 py-2.5 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          <div>Lead</div>
          <div>Last touch</div>
          <div>Trigger</div>
          <div>Status</div>
          <div>Outbound id</div>
          <div className="text-right">Step</div>
        </div>

        {isLoading && (
          <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No drafts yet. Once Zara generates outbound, leads will appear here.
          </div>
        )}

        {filtered.map((r) => {
          const name = [r.contact.first_name, r.contact.last_name].filter(Boolean).join(' ') || '(unknown)';
          return (
            <Link
              key={r.contact.id}
              to={`/crm/leads/${r.contact.id}`}
              className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.4fr_0.6fr] gap-3 px-4 py-3 border-t border-border crm-row-hover items-center"
            >
              <div className="min-w-0">
                <div className="crm-row-title truncate">{name}</div>
                <div className="text-xs text-muted-foreground truncate">{r.contact.email ?? '—'}</div>
              </div>
              <div className="text-sm">
                {r.contact.last_touch_at
                  ? formatDistanceToNow(new Date(r.contact.last_touch_at), { addSuffix: true })
                  : <span className="text-muted-foreground">never</span>}
              </div>
              <div>
                <Pill size="sm" tone="muted">{r.latest.trigger_kind}</Pill>
                <div className="text-[11px] text-muted-foreground mt-1">{r.latest.channel}</div>
              </div>
              <div>
                <Pill size="sm" tone={statusTone(r.latest.status)}>{r.latest.status}</Pill>
                {r.lastSentAt && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    sent {formatDistanceToNow(new Date(r.lastSentAt), { addSuffix: true })}
                  </div>
                )}
              </div>
              <div className="text-xs font-mono text-muted-foreground truncate" title={r.outboundId ?? ''}>
                {r.outboundId ?? '—'}
              </div>
              <div className="text-right text-sm tabular-nums">
                <span className="font-medium">{r.step}</span>
                <span className="text-muted-foreground">/{r.total}</span>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3">
        Step counts sent autonomous drafts per lead. Outbound id is the provider message id (Gmail / Twilio) for the last sent draft.
      </p>
    </div>
  );
}
