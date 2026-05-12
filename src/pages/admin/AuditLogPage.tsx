import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCrmAuditLog, type CrmAuditRow } from '@/hooks/useLeadDataSafety';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

const ACTION_TONE: Record<string, string> = {
  insert: 'text-emerald-600',
  update: 'text-foreground',
  delete: 'text-destructive',
  soft_delete: 'text-amber-600',
  restore: 'text-emerald-600',
  hard_delete: 'text-destructive',
  bulk_soft_delete: 'text-amber-600',
  bulk_restore: 'text-emerald-600',
  bulk_hard_delete: 'text-destructive',
  purge: 'text-destructive',
  export_lead: 'text-muted-foreground',
  export_workspace: 'text-muted-foreground',
};

function diffSummary(row: CrmAuditRow): string {
  if (row.changed_fields?.length) {
    const sample = row.changed_fields.slice(0, 4).join(', ');
    const extra = row.changed_fields.length > 4 ? ` (+${row.changed_fields.length - 4})` : '';
    return `Changed: ${sample}${extra}`;
  }
  if (row.affected_count != null) return `Affected: ${row.affected_count}`;
  return '';
}

export default function AuditLogPage() {
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useCrmAuditLog({ limit: 500 });
  const [q, setQ] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('');

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (actionFilter && r.action !== actionFilter) return false;
      if (!ql) return true;
      return (
        (r.actor_label ?? '').toLowerCase().includes(ql) ||
        r.action.toLowerCase().includes(ql) ||
        (r.record_id ?? '').toLowerCase().includes(ql) ||
        (r.changed_fields ?? []).some((f) => f.toLowerCase().includes(ql))
      );
    });
  }, [rows, q, actionFilter]);

  const actions = useMemo(() => Array.from(new Set(rows.map(r => r.action))).sort(), [rows]);

  return (
    <div className="max-w-[1100px] mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">Lead mutations, bulk operations, and exports.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>Back to Admin</Button>
      </div>

      <div className="flex items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by actor, action, field, or record id" className="max-w-sm h-9" />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} of {rows.length}</span>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Actor</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Record</th>
              <th className="px-3 py-2 text-left">Detail</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No entries.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
                  {format(new Date(r.occurred_at), 'MMM d, HH:mm:ss')}
                </td>
                <td className="px-3 py-2">{r.actor_label ?? '—'}</td>
                <td className={`px-3 py-2 font-medium ${ACTION_TONE[r.action] ?? 'text-foreground'}`}>{r.action}</td>
                <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                  {r.record_id ? (
                    <button onClick={() => navigate(`/crm/leads/${r.record_id}`)} className="hover:text-foreground hover:underline">
                      {r.record_id.slice(0, 8)}…
                    </button>
                  ) : (r.bulk_job_id ? `bulk·${r.bulk_job_id.slice(0, 6)}` : '—')}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{diffSummary(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
