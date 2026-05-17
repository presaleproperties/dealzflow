// Zara Tools Analytics — measures which tools Zara uses and how they convert.
// Reads from views: zara_tool_usage_30d, zara_tool_daily_30d, zara_tool_conversion_30d.
import { useEffect, useMemo, useState } from 'react';
import { ZaraShell } from '@/components/admin/zara/ZaraShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { Wrench, TrendingUp, AlertOctagon } from 'lucide-react';

type Usage = { tool_name: string; calls: number; leads_touched: number; failures: number; failure_pct: number | null; last_used_at: string | null };
type Conv = { tool_name: string; leads_touched: number; leads_converted: number; conversion_pct: number | null };
type Daily = { tool_name: string; day: string; calls: number };

export default function ZaraToolsPage() {
  const [usage, setUsage] = useState<Usage[] | null>(null);
  const [conv, setConv] = useState<Conv[] | null>(null);
  const [daily, setDaily] = useState<Daily[] | null>(null);

  useEffect(() => {
    (async () => {
      const [u, c, d] = await Promise.all([
        supabase.from('zara_tool_usage_30d' as any).select('*'),
        supabase.from('zara_tool_conversion_30d' as any).select('*'),
        supabase.from('zara_tool_daily_30d' as any).select('*'),
      ]);
      setUsage((u.data as any) ?? []);
      setConv((c.data as any) ?? []);
      setDaily((d.data as any) ?? []);
    })();
  }, []);

  const convByTool = useMemo(() => {
    const m: Record<string, Conv> = {};
    (conv ?? []).forEach((r) => { m[r.tool_name] = r; });
    return m;
  }, [conv]);

  const totals = useMemo(() => {
    const calls = (usage ?? []).reduce((a, b) => a + b.calls, 0);
    const failures = (usage ?? []).reduce((a, b) => a + b.failures, 0);
    const touched = (conv ?? []).reduce((a, b) => a + b.leads_touched, 0);
    const converted = (conv ?? []).reduce((a, b) => a + b.leads_converted, 0);
    return { calls, failures, touched, converted, convPct: touched ? Math.round((converted / touched) * 1000) / 10 : 0 };
  }, [usage, conv]);

  const sparkByTool = useMemo(() => {
    const m: Record<string, Daily[]> = {};
    (daily ?? []).forEach((r) => { (m[r.tool_name] ||= []).push(r); });
    Object.values(m).forEach((arr) => arr.sort((a, b) => a.day.localeCompare(b.day)));
    return m;
  }, [daily]);

  if (!usage || !conv || !daily) {
    return <ZaraShell title="Tools"><Skeleton className="h-64 w-full" /></ZaraShell>;
  }

  const rows = [...usage].sort((a, b) => b.calls - a.calls);

  return (
    <ZaraShell title="Tools" subtitle="Which tools Zara uses & which ones convert (last 30 days)">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Tile icon={Wrench} label="Tool calls" value={totals.calls} />
        <Tile icon={AlertOctagon} label="Failures" value={totals.failures} tone={totals.failures > 0 ? 'text-amber-500' : ''} />
        <Tile icon={TrendingUp} label="Leads touched" value={totals.touched} />
        <Tile icon={TrendingUp} label="Avg conversion" value={`${totals.convPct}%`} tone="text-emerald-500" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-tool performance</CardTitle>
          <p className="text-xs text-muted-foreground">
            Conversion = % of leads touched by this tool that received an approved Zara reply within 14 days.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Tool</th>
                <th className="text-right px-4 py-2 font-medium">Calls</th>
                <th className="text-right px-4 py-2 font-medium">Fail %</th>
                <th className="text-right px-4 py-2 font-medium">Leads</th>
                <th className="text-right px-4 py-2 font-medium">Conv %</th>
                <th className="text-left px-4 py-2 font-medium">30-day trend</th>
                <th className="text-right px-4 py-2 font-medium">Last used</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No tool activity in the last 30 days yet.</td></tr>
              )}
              {rows.map((r) => {
                const c = convByTool[r.tool_name];
                const pct = c?.conversion_pct ?? null;
                return (
                  <tr key={r.tool_name} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{r.tool_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.calls}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${(r.failure_pct ?? 0) > 10 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      {r.failure_pct == null ? '—' : `${r.failure_pct}%`}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{c?.leads_touched ?? 0}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${pct != null && pct >= 30 ? 'text-emerald-500' : pct != null && pct >= 10 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      {pct == null ? '—' : `${pct}%`}
                    </td>
                    <td className="px-4 py-2"><Sparkline points={sparkByTool[r.tool_name] ?? []} /></td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {r.last_used_at ? formatDistanceToNow(new Date(r.last_used_at), { addSuffix: true }) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </ZaraShell>
  );
}

function Tile({ icon: Icon, label, value, tone }: { icon: any; label: string; value: any; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`font-semibold text-2xl ${tone ?? ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Sparkline({ points }: { points: Daily[] }) {
  if (points.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const w = 120, h = 24;
  const max = Math.max(...points.map((p) => p.calls), 1);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step},${h - (p.calls / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="text-primary">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}
