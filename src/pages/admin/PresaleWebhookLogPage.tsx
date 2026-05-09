import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

type InboundRow = {
  idempotency_key: string;
  event_type: string;
  status: string;
  signature_valid: boolean | null;
  occurred_at: string | null;
  received_at: string;
  error: string | null;
};
type OutboundRow = {
  id: string;
  target_url: string;
  event_type: string;
  status: string;
  attempts: number;
  last_status_code: number | null;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
};

export default function PresaleWebhookLogPage() {
  const [tab, setTab] = useState<'in' | 'out'>('in');
  const [inbound, setInbound] = useState<InboundRow[]>([]);
  const [outbound, setOutbound] = useState<OutboundRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: i }, { data: o }] = await Promise.all([
      supabase.from('crm_inbound_events' as any)
        .select('idempotency_key,event_type,status,signature_valid,occurred_at,received_at,error')
        .order('received_at', { ascending: false }).limit(200),
      supabase.from('crm_outbound_webhooks' as any)
        .select('id,target_url,event_type,status,attempts,last_status_code,last_error,next_attempt_at,created_at')
        .order('created_at', { ascending: false }).limit(200),
    ]);
    setInbound((i as any) ?? []);
    setOutbound((o as any) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const statusTone = (s: string) =>
    s === 'processed' || s === 'delivered' ? 'text-emerald-500'
    : s === 'duplicate' ? 'text-muted-foreground'
    : s === 'retry' || s === 'pending' || s === 'received' ? 'text-amber-500'
    : 'text-destructive';

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Presale webhook log</h1>
          <p className="text-sm text-muted-foreground mt-1">Last 200 events in each direction.</p>
        </div>
        <button onClick={load}
          className="text-sm px-3 py-1.5 rounded border border-border hover:bg-accent">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="flex gap-1 mb-4 border-b border-border">
        {(['in', 'out'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t === 'in' ? `Inbound (${inbound.length})` : `Outbound (${outbound.length})`}
          </button>
        ))}
      </div>

      {tab === 'in' ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Received</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Sig</th>
                <th className="text-left p-3">Idempotency key</th>
                <th className="text-left p-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {inbound.map((r) => (
                <tr key={r.idempotency_key} className="border-t border-border">
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{format(new Date(r.received_at), 'MMM d, HH:mm:ss')}</td>
                  <td className="p-3 font-mono text-xs">{r.event_type}</td>
                  <td className={`p-3 font-medium ${statusTone(r.status)}`}>{r.status}</td>
                  <td className="p-3">{r.signature_valid === true ? '✓' : r.signature_valid === false ? '✗' : '—'}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground truncate max-w-[280px]">{r.idempotency_key}</td>
                  <td className="p-3 text-destructive text-xs truncate max-w-[200px]">{r.error ?? ''}</td>
                </tr>
              ))}
              {!inbound.length && !loading && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No inbound events yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Created</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Attempts</th>
                <th className="text-left p-3">Code</th>
                <th className="text-left p-3">Next attempt</th>
                <th className="text-left p-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {outbound.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), 'MMM d, HH:mm:ss')}</td>
                  <td className="p-3 font-mono text-xs">{r.event_type}</td>
                  <td className={`p-3 font-medium ${statusTone(r.status)}`}>{r.status}</td>
                  <td className="p-3">{r.attempts}</td>
                  <td className="p-3">{r.last_status_code ?? '—'}</td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{format(new Date(r.next_attempt_at), 'MMM d, HH:mm:ss')}</td>
                  <td className="p-3 text-destructive text-xs truncate max-w-[200px]">{r.last_error ?? ''}</td>
                </tr>
              ))}
              {!outbound.length && !loading && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No outbound webhooks yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
