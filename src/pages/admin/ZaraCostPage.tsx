// Zara Models & Cost — last 7d AI usage from crm_zara_model_calls
import { useEffect, useState } from 'react';
import { ZaraShell } from '@/components/admin/zara/ZaraShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function ZaraCostPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cap, setCap] = useState<string>('20');
  const [autoPause, setAutoPause] = useState(true);

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from('crm_zara_model_calls').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(500),
      supabase.from('crm_zara_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    setCalls(c ?? []);
    setSettings(s);
    setCap(String(s?.daily_cost_cap_usd ?? 20));
    setAutoPause(!!s?.auto_pause_on_cost);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    const { error } = await supabase.from('crm_zara_settings').update({
      daily_cost_cap_usd: Number(cap) || 0,
      auto_pause_on_cost: autoPause,
    }).eq('id', 1);
    if (error) return toast.error(error.message);
    toast.success('Saved');
    load();
  }

  // Aggregate by model
  const byModel = calls.reduce((acc: Record<string, { calls: number; in: number; out: number; cost: number; fail: number }>, r) => {
    const k = r.model;
    acc[k] ||= { calls: 0, in: 0, out: 0, cost: 0, fail: 0 };
    acc[k].calls++;
    acc[k].in += r.input_tokens || 0;
    acc[k].out += r.output_tokens || 0;
    acc[k].cost += Number(r.cost_usd || 0);
    if (!r.success) acc[k].fail++;
    return acc;
  }, {});

  const totalCost = calls.reduce((a, b) => a + Number(b.cost_usd || 0), 0);
  const today = calls.filter((c) => new Date(c.created_at).toDateString() === new Date().toDateString());
  const todayCost = today.reduce((a, b) => a + Number(b.cost_usd || 0), 0);

  return (
    <ZaraShell title="Models & Cost" subtitle="AI usage over the last 7 days">
      <div className="grid gap-3 md:grid-cols-4 mb-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">7-day spend</div><div className="text-2xl font-semibold">${totalCost.toFixed(3)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Today</div><div className="text-2xl font-semibold">${todayCost.toFixed(3)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Calls (7d)</div><div className="text-2xl font-semibold">{calls.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Failures</div><div className="text-2xl font-semibold">{calls.filter((c) => !c.success).length}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">By model</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-32"/> : Object.keys(byModel).length === 0 ? (
              <p className="text-sm text-muted-foreground">No model calls logged yet.</p>
            ) : (
              <div className="space-y-2">
                {(Object.entries(byModel) as [string, any][]).sort((a,b) => b[1].cost - a[1].cost).map(([m, v]) => (
                  <div key={m} className="flex items-center gap-3 text-sm py-2 border-b border-border/40 last:border-0">
                    <span className="font-mono text-xs flex-1 truncate">{m}</span>
                    <Badge variant="outline" className="text-[10px]">{v.calls} calls</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums w-28 text-right">{(v.in/1000).toFixed(1)}k → {(v.out/1000).toFixed(1)}k tok</span>
                    <span className="font-semibold tabular-nums w-16 text-right">${v.cost.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Cost guardrails</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="cap">Daily cost cap (USD)</Label>
              <Input id="cap" type="number" step="0.5" value={cap} onChange={(e) => setCap(e.target.value)} className="mt-1.5"/>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="auto">Auto-pause when cap reached</Label>
              <Switch id="auto" checked={autoPause} onCheckedChange={setAutoPause}/>
            </div>
            <Button onClick={save} className="w-full">Save</Button>
            <div className="text-xs text-muted-foreground">Today: <span className="font-semibold">${todayCost.toFixed(3)}</span> / <span>${cap}</span></div>
          </CardContent>
        </Card>
      </div>
    </ZaraShell>
  );
}
