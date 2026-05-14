// Zara Jobs — recent edge-function ticks (planner, insight gen, etc.)
import { useEffect, useMemo, useState } from 'react';
import { ZaraShell } from '@/components/admin/zara/ZaraShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { Play, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'sonner';

type StatusFilter = 'all' | 'ok' | 'fail';
type RangeFilter = '1h' | '24h' | '7d' | '30d' | 'all';

const RANGE_MS: Record<RangeFilter, number | null> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  all: null,
};

export default function ZaraJobsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [range, setRange] = useState<RangeFilter>('24h');
  const [fnFilter, setFnFilter] = useState<string>('all');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('crm_audit_log').select('id, action, occurred_at, meta')
      .like('action', 'zara.tick%').order('occurred_at', { ascending: false }).limit(500);
    setRows(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function run(fn: string) {
    setBusy(fn);
    try {
      const { error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) throw error;
      toast.success(`${fn} triggered`);
      setTimeout(load, 1500);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  const fnOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.action.replace('zara.tick.', '')));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const cutoff = RANGE_MS[range] ? Date.now() - (RANGE_MS[range] as number) : null;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const fn = r.action.replace('zara.tick.', '');
      const ok = r.meta?.success !== false;
      if (status === 'ok' && !ok) return false;
      if (status === 'fail' && ok) return false;
      if (fnFilter !== 'all' && fn !== fnFilter) return false;
      if (cutoff && new Date(r.occurred_at).getTime() < cutoff) return false;
      if (q && !fn.toLowerCase().includes(q) && !JSON.stringify(r.meta ?? {}).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, status, range, fnFilter]);

  const clearFilters = () => { setSearch(''); setStatus('all'); setRange('24h'); setFnFilter('all'); };
  const filtersActive = search || status !== 'all' || range !== '24h' || fnFilter !== 'all';

  return (
    <ZaraShell title="Jobs" subtitle="Cron ticks & manual job runs"
      actions={<Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1"/>Refresh</Button>}>
      <div className="grid gap-3 md:grid-cols-3 mb-4">
        {[
          { fn: 'zara-plan-outbound', label: 'Outbound planner', schedule: 'every 15 min' },
          { fn: 'zara-insight-generator', label: 'Insight generator', schedule: 'daily 7am UTC' },
        ].map((j) => (
          <Card key={j.fn}>
            <CardContent className="p-4">
              <div className="text-sm font-medium">{j.label}</div>
              <div className="text-xs text-muted-foreground mb-3">{j.schedule}</div>
              <Button size="sm" onClick={() => run(j.fn)} disabled={busy === j.fn}>
                <Play className="h-3 w-3 mr-1"/>Run now
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">
              Recent ticks <span className="text-muted-foreground font-normal">({filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ''})</span>
            </CardTitle>
            {filtersActive && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <X className="h-3 w-3 mr-1"/>Clear
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search function or meta…"
                className="pl-8 h-9"
              />
            </div>
            <Select value={fnFilter} onValueChange={setFnFilter}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Function"/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All functions</SelectItem>
                {fnOptions.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="h-9 w-[130px]"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="ok">Success</SelectItem>
                <SelectItem value="fail">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={(v) => setRange(v as RangeFilter)}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last hour</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-48 w-full"/> : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ticks match the current filters.</p>
          ) : (
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
              {filtered.map((r) => {
                const ok = r.meta?.success !== false;
                return (
                  <div key={r.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-border/40 last:border-0">
                    <Badge variant={ok ? 'outline' : 'destructive'} className="text-[10px] min-w-[70px] justify-center">
                      {ok ? 'ok' : 'fail'}
                    </Badge>
                    <span className="font-mono text-xs">{r.action.replace('zara.tick.', '')}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {r.meta?.generated != null && `${r.meta.generated} gen · `}
                      {formatDistanceToNow(new Date(r.occurred_at), { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </ZaraShell>
  );
}
