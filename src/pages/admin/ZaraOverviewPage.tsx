// Zara Overview — new landing at /admin/zara (replaces old dashboard).
// Uses ZaraShell sidebar. Existing rich dashboard moved to /admin/zara/live.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ZaraShell } from '@/components/admin/zara/ZaraShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { ZARA_TEAM_ID, ZARA_EDGE_FUNCTIONS } from '@/lib/zaraConstants';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  Sparkles, Activity, Database, Clock, Gauge, Heart, Play, FlaskConical, ExternalLink,
} from 'lucide-react';

type State = {
  settings: any;
  lastTick: any;
  uptime: number;
  tableCount: number;
  behaviorScore: number;
  stateDist: { state: string; count: number }[];
  recent: any[];
};

const ZARA_STATES = ['new','contacted','engaged','warming','qualifying','booking_offered','booked','hot','dormant','dead'];

export default function ZaraOverviewPage() {
  const [s, setS] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [
      { data: settings },
      { data: ticks },
      { data: tables },
      { data: score },
      { data: dist },
      { data: recent },
    ] = await Promise.all([
      supabase.from('crm_zara_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('crm_audit_log').select('*').like('action', 'zara.tick%').order('occurred_at', { ascending: false }).limit(50),
      supabase.rpc('crm_zara_pending_drafts_count'),
      supabase.rpc('crm_zara_behavior_score'),
      supabase.from('crm_contacts').select('zara_state').eq('assigned_to', ZARA_TEAM_ID).is('deleted_at', null),
      supabase.from('crm_audit_log').select('id, action, occurred_at, meta').eq('actor_label', 'zara')
        .in('action', ['zara.draft_created','zara.replied','zara.escalation','zara.tick.insights'])
        .order('occurred_at', { ascending: false }).limit(15),
    ]);

    const successful = (ticks ?? []).filter((t: any) => t.meta?.success !== false).length;
    const uptime = ticks && ticks.length > 0 ? Math.round((successful / ticks.length) * 100) : 100;

    const counts: Record<string, number> = {};
    (dist ?? []).forEach((r: any) => {
      const k = r.zara_state || 'new';
      counts[k] = (counts[k] ?? 0) + 1;
    });
    const stateDist = Object.entries(counts).map(([state, count]) => ({ state, count }));

    // table count via fixed list of zara tables (avoids needing pg_meta)
    const tableCount = 8; // crm_zara_settings, drafts, insights, knowledge_gaps, model_calls, playbooks, zara_org_context, zara_system_prompts

    setS({
      settings,
      lastTick: ticks?.[0] ?? null,
      uptime,
      tableCount,
      behaviorScore: typeof score === 'number' ? score : 50,
      stateDist,
      recent: recent ?? [],
    });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function runPlanner() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('zara-plan-outbound', { body: { limit: 25 } });
      if (error) throw error;
      const r: any = data;
      if (r?.ok) toast.success(`Planner: ${r.generated ?? 0} draft(s) generated`);
      else toast.warning(`Planner: ${r?.reason ?? 'no drafts'}`);
      load();
    } catch (e: any) { toast.error(e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function toggleKill(next: boolean) {
    setBusy(true);
    const { error } = await supabase.from('crm_zara_settings').update({ enabled: next }).eq('id', 1);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(next ? 'Zara enabled' : 'Zara paused');
    load();
  }

  if (loading || !s) {
    return <ZaraShell title="Overview"><Skeleton className="h-64 w-full" /></ZaraShell>;
  }

  return (
    <ZaraShell
      title="Overview"
      subtitle="Health, state distribution, recent activity"
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/zara/live"><Activity className="h-4 w-4 mr-1" /> Live dashboard</Link>
          </Button>
          <Button size="sm" onClick={runPlanner} disabled={busy}>
            <Play className="h-4 w-4 mr-1" /> Run planner now
          </Button>
        </>
      }
    >
      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Tile icon={Activity} label="Edge functions" value={ZARA_EDGE_FUNCTIONS.length} />
        <Tile icon={Database} label="Zara tables" value={s.tableCount} />
        <Tile icon={Clock} label="Last tick" value={s.lastTick ? formatDistanceToNow(new Date(s.lastTick.occurred_at), { addSuffix: true }) : '—'} small />
        <Tile icon={Gauge} label="7-day uptime" value={`${s.uptime}%`} tone={s.uptime >= 95 ? 'text-emerald-500' : 'text-amber-500'} />
        <Tile icon={Heart} label="Behavior score" value={`${s.behaviorScore}/100`} tone={s.behaviorScore >= 70 ? 'text-emerald-500' : s.behaviorScore >= 50 ? 'text-amber-500' : 'text-rose-500'} />
        <Card>
          <CardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Kill switch</span>
              <Switch checked={!!s.settings?.enabled} onCheckedChange={toggleKill} disabled={busy} />
            </div>
            <span className={`text-sm font-semibold ${s.settings?.enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}>
              {s.settings?.enabled ? 'Enabled' : 'Paused'}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* State distribution + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Lead state distribution</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {ZARA_STATES.map((st) => {
              const row = s.stateDist.find((d) => d.state === st);
              const count = row?.count ?? 0;
              const total = s.stateDist.reduce((a, b) => a + b.count, 0) || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={st} className="flex items-center gap-3 text-sm">
                  <div className="w-32 text-muted-foreground capitalize">{st.replace(/_/g, ' ')}</div>
                  <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-12 text-right tabular-nums">{count}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {s.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : s.recent.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="text-[10px]">{r.action.replace('zara.', '')}</Badge>
                <span className="text-muted-foreground text-xs ml-auto">
                  {formatDistanceToNow(new Date(r.occurred_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Quick test lead */}
      <Card className="mt-4 border-dashed">
        <CardContent className="p-4 flex items-center gap-3">
          <FlaskConical className="h-5 w-5 text-amber-500" />
          <div className="flex-1">
            <div className="text-sm font-medium">Quick test lead</div>
            <p className="text-xs text-muted-foreground">Coming next — creates a throwaway lead tagged <code>zara:test</code>, triggers the planner, watch a draft appear in /admin/zara/drafts.</p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin/zara/drafts">Drafts <ExternalLink className="h-3 w-3 ml-1" /></Link>
          </Button>
        </CardContent>
      </Card>
    </ZaraShell>
  );
}

function Tile({ icon: Icon, label, value, tone, small }: {
  icon: any; label: string; value: any; tone?: string; small?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`font-semibold ${small ? 'text-sm' : 'text-2xl'} ${tone ?? ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
