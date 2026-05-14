// Zara Behavior — score breakdown + AI-generated insights feed
import { useEffect, useState } from 'react';
import { ZaraShell } from '@/components/admin/zara/ZaraShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

export default function ZaraBehaviorPage() {
  const [score, setScore] = useState<number>(50);
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: i }] = await Promise.all([
      supabase.rpc('crm_zara_behavior_score'),
      supabase.from('crm_zara_insights').select('*').eq('is_dismissed', false)
        .order('created_at', { ascending: false }).limit(20),
    ]);
    setScore(typeof s === 'number' ? s : 50);
    setInsights(i ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function generateNow() {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('zara-insight-generator', { body: {} });
      if (error) throw error;
      toast.success('Insights regenerated');
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function dismiss(id: string) {
    await supabase.from('crm_zara_insights').update({ is_dismissed: true }).eq('id', id);
    setInsights((rows) => rows.filter((r) => r.id !== id));
  }

  const tone = score >= 70 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-rose-500';

  return (
    <ZaraShell title="Behavior" subtitle="Health score & AI-generated insights"
      actions={<Button size="sm" onClick={generateNow} disabled={busy}><Sparkles className="h-4 w-4 mr-1"/>Generate insights</Button>}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Behavior score</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-24"/> : (
              <>
                <div className={`text-5xl font-semibold tabular-nums ${tone}`}>{score}</div>
                <div className="text-xs text-muted-foreground mt-2">Composite of approval rate, gap count, reply rate, escalation precision, uptime.</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Insights feed</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48"/> : insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active insights. Click "Generate insights" to run the analysis now.</p>
            ) : (
              <div className="space-y-3">
                {insights.map((i) => (
                  <div key={i.id} className="flex gap-3 p-3 rounded-md border border-border/60">
                    <Badge variant={i.severity === 'critical' ? 'destructive' : i.severity === 'warning' ? 'default' : 'outline'} className="h-fit text-[10px]">
                      {i.severity}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{i.insight_text}</div>
                      {i.suggested_action && <div className="text-xs text-muted-foreground mt-1"><span className="font-medium">Suggested:</span> {i.suggested_action}</div>}
                      <div className="text-[11px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}</div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dismiss(i.id)}><X className="h-3 w-3"/></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ZaraShell>
  );
}
