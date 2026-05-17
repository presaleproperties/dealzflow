import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Pill } from '@/components/crm/shared/Pill';
import { Input } from '@/components/ui/input';

type AuditRow = {
  id: string;
  created_at: string;
  contact_id: string | null;
  draft_id: string | null;
  channel: string | null;
  trigger_kind: string | null;
  template_key: string | null;
  rule_evaluation: Record<string, unknown> | null;
  model: string | null;
  confidence: number | null;
  subject: string | null;
  decision: string;
  decision_reason: string | null;
  provider_message_id: string | null;
  meta: Record<string, unknown> | null;
};

type Contact = { id: string; first_name: string | null; last_name: string | null; email: string | null };

const decisionTone = (d: string): React.ComponentProps<typeof Pill>['tone'] => {
  if (d === 'autosent') return 'success';
  if (d === 'draft_only' || d === 'autosend_attempted' || d === 'dry_run') return 'info';
  if (d === 'sandbox_blocked') return 'warning';
  if (d === 'send_failed' || d === 'failed') return 'danger';
  return 'muted';
};

export default function ZaraOutboundAuditPage() {
  const [search, setSearch] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['zara-outbound-audit'],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('crm_zara_outbound_audit' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      const ids = Array.from(new Set((rows ?? []).map((r: any) => r.contact_id).filter(Boolean)));
      const contacts = new Map<string, Contact>();
      if (ids.length) {
        const { data: cs } = await supabase
          .from('crm_contacts')
          .select('id, first_name, last_name, email')
          .in('id', ids);
        (cs ?? []).forEach((c: any) => contacts.set(c.id, c));
      }
      return { rows: ((rows ?? []) as unknown) as AuditRow[], contacts };
    },
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    const rows = data?.rows ?? [];
    return rows.filter((r) => {
      if (decisionFilter !== 'all' && r.decision !== decisionFilter) return false;
      if (!search.trim()) return true;
      const c = r.contact_id ? data?.contacts.get(r.contact_id) : null;
      const hay = [
        c?.first_name, c?.last_name, c?.email,
        r.trigger_kind, r.decision, r.decision_reason, r.subject, r.provider_message_id,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [data, search, decisionFilter]);

  const decisions = useMemo(() => {
    const set = new Set<string>();
    (data?.rows ?? []).forEach((r) => set.add(r.decision));
    return Array.from(set).sort();
  }, [data]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="crm-h1">Zara outbound audit</h1>
            <p className="crm-meta mt-1">
              Per-message log: trigger, rule evaluation, template, and final send decision.
            </p>
          </div>
          <Link to="/crm/zara" className="text-sm text-primary hover:underline">← Zara cockpit</Link>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, trigger, reason, message id…"
            className="max-w-sm"
          />
          <select
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All decisions</option>
            {decisions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <span className="crm-meta ml-auto">{filtered.length} of {data?.rows.length ?? 0} rows</span>
        </div>

        {isLoading ? (
          <div className="crm-meta">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-border p-8 text-center crm-meta">
            No audit rows yet. They appear here as soon as Zara evaluates a lead.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left crm-meta">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Lead</th>
                  <th className="px-3 py-2 font-medium">Trigger / template</th>
                  <th className="px-3 py-2 font-medium">Channel</th>
                  <th className="px-3 py-2 font-medium">Decision</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const c = r.contact_id ? data?.contacts.get(r.contact_id) : null;
                  const name = c ? [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id : '—';
                  const isOpen = expanded === r.id;
                  return (
                    <>
                      <tr
                        key={r.id}
                        className="border-t border-border hover:bg-muted/30 cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                      >
                        <td className="px-3 py-2 whitespace-nowrap crm-meta">
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        </td>
                        <td className="px-3 py-2">
                          {r.contact_id ? (
                            <Link
                              to={`/crm/leads/${r.contact_id}`}
                              className="text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {name}
                            </Link>
                          ) : <span className="crm-meta">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs">{r.trigger_kind ?? '—'}</span>
                          {r.template_key && r.template_key !== r.trigger_kind ? (
                            <span className="crm-meta ml-1">/ {r.template_key}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 crm-meta">{r.channel ?? '—'}</td>
                        <td className="px-3 py-2">
                          <Pill tone={decisionTone(r.decision)} size="sm">{r.decision}</Pill>
                        </td>
                        <td className="px-3 py-2 crm-meta">{r.decision_reason ?? '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/20 border-t border-border">
                          <td colSpan={6} className="px-3 py-3 space-y-2">
                            {r.subject && (
                              <div><span className="crm-meta">Subject:</span> {r.subject}</div>
                            )}
                            {r.provider_message_id && (
                              <div><span className="crm-meta">Provider id:</span> <span className="font-mono text-xs">{r.provider_message_id}</span></div>
                            )}
                            {r.draft_id && (
                              <div><span className="crm-meta">Draft id:</span> <span className="font-mono text-xs">{r.draft_id}</span></div>
                            )}
                            {(r.model || r.confidence != null) && (
                              <div className="crm-meta">
                                model: {r.model ?? '—'} · confidence: {r.confidence ?? '—'}
                              </div>
                            )}
                            <div>
                              <div className="crm-meta mb-1">Rule evaluation</div>
                              <pre className="text-xs bg-background border border-border rounded p-2 overflow-x-auto">
{JSON.stringify(r.rule_evaluation ?? {}, null, 2)}
                              </pre>
                            </div>
                            {r.meta && Object.keys(r.meta).length > 0 && (
                              <div>
                                <div className="crm-meta mb-1">Provider meta</div>
                                <pre className="text-xs bg-background border border-border rounded p-2 overflow-x-auto">
{JSON.stringify(r.meta, null, 2)}
                                </pre>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
