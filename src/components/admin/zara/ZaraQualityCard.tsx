// Phase 2: Zara quality metrics. Reads zara_metrics_by_intent + zara_metrics_daily.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ZaraQualityCard() {
  const { data: byIntent = [] } = useQuery({
    queryKey: ['zara-metrics-by-intent'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('zara_metrics_by_intent')
        .select('*');
      if (error) throw error;
      return (data ?? []) as Array<{
        intent: string; drafts: number; sent: number; sent_unedited: number;
        unedited_pct: number | null; avg_edit_distance: number | null; avg_confidence: number | null;
      }>;
    },
  });

  const { data: daily = [] } = useQuery({
    queryKey: ['zara-metrics-daily'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('zara_metrics_daily')
        .select('*')
        .order('day', { ascending: false })
        .limit(14);
      if (error) throw error;
      return (data ?? []) as Array<{
        day: string; intent: string; drafts: number; sent: number;
        sent_unedited: number; escalated: number; flagged_for_human: number;
        avg_edit_distance: number | null; avg_latency_ms: number | null;
      }>;
    },
  });

  const totals = byIntent.reduce(
    (acc, r) => ({
      drafts: acc.drafts + r.drafts,
      sent: acc.sent + r.sent,
      unedited: acc.unedited + r.sent_unedited,
    }),
    { drafts: 0, sent: 0, unedited: 0 },
  );
  const sendRate = totals.drafts ? Math.round((totals.sent / totals.drafts) * 100) : 0;
  const uneditedRate = totals.sent ? Math.round((totals.unedited / totals.sent) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Zara Quality (last 30 days)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Drafts" value={totals.drafts.toString()} />
          <Stat label="Send rate" value={`${sendRate}%`} />
          <Stat label="Sent unedited" value={`${uneditedRate}%`} hint="higher = Zara nailed it" />
        </div>

        <div>
          <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">By intent</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr><th className="text-left py-1">Intent</th><th className="text-right">Drafts</th><th className="text-right">Sent</th><th className="text-right">Unedited %</th><th className="text-right">Avg edits</th></tr>
              </thead>
              <tbody>
                {byIntent.map((r) => (
                  <tr key={r.intent} className="border-t border-border/50">
                    <td className="py-1.5">{r.intent}</td>
                    <td className="text-right">{r.drafts}</td>
                    <td className="text-right">{r.sent}</td>
                    <td className="text-right">{r.unedited_pct ?? '—'}%</td>
                    <td className="text-right">{r.avg_edit_distance ?? '—'}</td>
                  </tr>
                ))}
                {byIntent.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No drafts yet — data appears as Zara replies.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Last 14 days</h4>
          <div className="text-xs text-muted-foreground space-y-1">
            {daily.slice(0, 7).map((d, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-20">{d.day}</span>
                <span className="w-16">{d.intent}</span>
                <span>{d.drafts} drafts · {d.sent} sent · {d.escalated} escalated · avg {d.avg_latency_ms}ms</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{hint}</div>}
    </div>
  );
}
