// Zara Jobs — recent edge-function ticks (planner, insight gen, etc.)
import { useEffect, useState } from 'react';
import { ZaraShell } from '@/components/admin/zara/ZaraShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function ZaraJobsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('crm_audit_log').select('id, action, occurred_at, meta')
      .like('action', 'zara.tick%').order('occurred_at', { ascending: false }).limit(100);
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
        <CardHeader><CardTitle className="text-base">Recent ticks (last 100)</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-48 w-full"/> : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ticks recorded yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
              {rows.map((r) => {
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
