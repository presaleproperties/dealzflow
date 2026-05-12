import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { useCrmAuditLog, type CrmAuditRow } from '@/hooks/useLeadDataSafety';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';

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
  'export.full_zip': 'text-muted-foreground',
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

function rowCount(r: CrmAuditRow): number {
  if (r.affected_count != null) return r.affected_count;
  if (r.record_id) return 1;
  return 0;
}

export default function AuditLogPage() {
  const navigate = useNavigate();
  const { isOwnerOrAdmin, isLoading: accessLoading } = useCrmAccess();
  const { data: rows = [], isLoading } = useCrmAuditLog({ limit: 1000 });
  const [q, setQ] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [userFilter, setUserFilter] = useState<string>('');
  const [range, setRange] = useState<DateRange | undefined>();
  const [minRows, setMinRows] = useState<string>('');
  const [maxRows, setMaxRows] = useState<string>('');
  const [payloadRow, setPayloadRow] = useState<CrmAuditRow | null>(null);

  if (accessLoading) return null;
  if (!isOwnerOrAdmin) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Only admins and owners can view the audit log.
      </div>
    );
  }

  const actions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.action))).sort(),
    [rows]
  );
  const users = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      const key = r.actor_id ?? r.actor_email ?? r.actor_label ?? '';
      if (!key) return;
      const label = r.actor_label ?? r.actor_email ?? key;
      if (!map.has(key)) map.set(key, label);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const minN = minRows ? Number(minRows) : null;
    const maxN = maxRows ? Number(maxRows) : null;
    const from = range?.from ? new Date(range.from).getTime() : null;
    const to = range?.to ? new Date(range.to).getTime() + 86400000 : null;
    return rows.filter((r) => {
      if (actionFilter && r.action !== actionFilter) return false;
      if (userFilter) {
        const key = r.actor_id ?? r.actor_email ?? r.actor_label ?? '';
        if (key !== userFilter) return false;
      }
      const t = new Date(r.occurred_at).getTime();
      if (from != null && t < from) return false;
      if (to != null && t >= to) return false;
      const n = rowCount(r);
      if (minN != null && n < minN) return false;
      if (maxN != null && n > maxN) return false;
      if (!ql) return true;
      return (
        (r.actor_label ?? '').toLowerCase().includes(ql) ||
        (r.actor_email ?? '').toLowerCase().includes(ql) ||
        r.action.toLowerCase().includes(ql) ||
        (r.record_id ?? '').toLowerCase().includes(ql) ||
        (r.changed_fields ?? []).some((f) => f.toLowerCase().includes(ql))
      );
    });
  }, [rows, q, actionFilter, userFilter, range, minRows, maxRows]);

  const resetFilters = () => {
    setQ('');
    setActionFilter('');
    setUserFilter('');
    setRange(undefined);
    setMinRows('');
    setMaxRows('');
  };

  return (
    <div className="max-w-[1200px] mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">Lead mutations, bulk operations, and exports.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>Back to Admin</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search actor, field, record id"
          className="max-w-xs h-9"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm max-w-[200px]"
        >
          <option value="">All users</option>
          {users.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn('h-9 justify-start font-normal', !range && 'text-muted-foreground')}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {range?.from ? (
                range.to ? (
                  <>{format(range.from, 'LLL d')} – {format(range.to, 'LLL d')}</>
                ) : format(range.from, 'LLL d, y')
              ) : 'Date range'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={range}
              onSelect={setRange}
              numberOfMonths={2}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            value={minRows}
            onChange={(e) => setMinRows(e.target.value)}
            placeholder="Min rows"
            className="h-9 w-24"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="number"
            min={0}
            value={maxRows}
            onChange={(e) => setMaxRows(e.target.value)}
            placeholder="Max"
            className="h-9 w-20"
          />
        </div>

        <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9">Reset</Button>
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
              <th className="px-3 py-2 text-right">Rows</th>
              <th className="px-3 py-2 text-left">Detail</th>
              <th className="px-3 py-2 text-right">Payload</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No entries.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
                  {format(new Date(r.occurred_at), 'MMM d, HH:mm:ss')}
                </td>
                <td className="px-3 py-2">
                  <div className="text-foreground">{r.actor_label ?? '—'}</div>
                  {r.actor_email && (
                    <div className="text-[11px] text-muted-foreground">{r.actor_email}</div>
                  )}
                </td>
                <td className={`px-3 py-2 font-medium ${ACTION_TONE[r.action] ?? 'text-foreground'}`}>{r.action}</td>
                <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                  {r.record_id ? (
                    <button onClick={() => navigate(`/crm/leads/${r.record_id}`)} className="hover:text-foreground hover:underline">
                      {r.record_id.slice(0, 8)}…
                    </button>
                  ) : (r.bulk_job_id ? `bulk·${r.bulk_job_id.slice(0, 6)}` : '—')}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{rowCount(r) || '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{diffSummary(r)}</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => setPayloadRow(r)}>
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!payloadRow} onOpenChange={(o) => !o && setPayloadRow(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {payloadRow?.action} · {payloadRow ? format(new Date(payloadRow.occurred_at), 'MMM d, yyyy HH:mm:ss') : ''}
            </DialogTitle>
            <DialogDescription>
              {payloadRow?.actor_label ?? '—'}
              {payloadRow?.actor_email ? ` · ${payloadRow.actor_email}` : ''}
              {payloadRow?.record_id ? ` · ${payloadRow.record_id}` : ''}
            </DialogDescription>
          </DialogHeader>
          {payloadRow && (
            <div className="space-y-3 text-xs max-h-[60vh] overflow-auto">
              {payloadRow.changed_fields?.length ? (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Changed fields</div>
                  <div className="flex flex-wrap gap-1">
                    {payloadRow.changed_fields.map((f) => (
                      <span key={f} className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[11px]">{f}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {(['before', 'after', 'filter_snapshot', 'meta'] as const).map((k) => {
                const v = payloadRow[k];
                if (!v || (typeof v === 'object' && Object.keys(v).length === 0)) return null;
                return (
                  <div key={k}>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{k}</div>
                    <pre className="rounded-md bg-muted/50 border border-border p-3 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                      {JSON.stringify(v, null, 2)}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
