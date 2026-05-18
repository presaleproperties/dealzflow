// Zara Overview — Apple Intelligence v2.
// Editorial number-first tiles, hairline dividers, no shadcn Cards.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ZaraShell } from '@/components/admin/zara/ZaraShell';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { ZARA_TEAM_ID, ZARA_EDGE_FUNCTIONS } from '@/lib/zaraConstants';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Play } from 'lucide-react';

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
      { data: score },
      { data: dist },
      { data: recent },
    ] = await Promise.all([
      supabase.from('crm_zara_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('crm_audit_log').select('*').like('action', 'zara.tick%').order('occurred_at', { ascending: false }).limit(50),
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

    setS({
      settings,
      lastTick: ticks?.[0] ?? null,
      uptime,
      tableCount: 8,
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
    return <ZaraShell title="Overview"><Skeleton className="h-64 w-full rounded-2xl" /></ZaraShell>;
  }

  const totalLeads = s.stateDist.reduce((a, b) => a + b.count, 0);

  return (
    <ZaraShell
      title="Overview"
      subtitle="A quiet view of Zara's health, attention, and recent work."
      actions={
        <>
          <Button variant="ghost" size="sm" asChild className="text-[12px]">
            <Link to="/admin/zara/live">Live dashboard</Link>
          </Button>
          <Button size="sm" onClick={runPlanner} disabled={busy} className="text-[12px]">
            <Play className="h-3.5 w-3.5 mr-1.5" /> Run planner
          </Button>
        </>
      }
    >
      {/* Number tiles — editorial, number first */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
        <Tile label="Edge functions" value={ZARA_EDGE_FUNCTIONS.length} />
        <Tile label="Zara tables"    value={s.tableCount} />
        <Tile
          label="Last tick"
          value={s.lastTick ? formatDistanceToNow(new Date(s.lastTick.occurred_at), { addSuffix: true }) : '—'}
          small
        />
        <Tile
          label="7-day uptime"
          value={`${s.uptime}%`}
          accent={s.uptime >= 95 ? 'emerald' : 'amber'}
        />
        <Tile
          label="Behavior"
          value={`${s.behaviorScore}`}
          sub="/ 100"
          accent={s.behaviorScore >= 70 ? 'emerald' : s.behaviorScore >= 50 ? 'amber' : 'rose'}
        />
        <KillSwitchTile enabled={!!s.settings?.enabled} onToggle={toggleKill} disabled={busy} />
      </div>

      {/* State distribution + Recent — flat layout, hairline only */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10">
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="zara-section-head !mb-0">Lead state distribution</h2>
            <span className="zara-meta">{totalLeads.toLocaleString()} leads</span>
          </div>
          <ul className="space-y-2.5">
            {ZARA_STATES.map((st) => {
              const row = s.stateDist.find((d) => d.state === st);
              const count = row?.count ?? 0;
              const pct = totalLeads ? Math.round((count / totalLeads) * 100) : 0;
              return (
                <li key={st} className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
                  <span className="text-[12px] text-foreground/80 capitalize">{st.replace(/_/g, ' ')}</span>
                  <div className="h-[3px] bg-foreground/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${pct}%`,
                        background: 'linear-gradient(90deg, hsl(var(--primary) / 0.55), hsl(var(--primary)))',
                      }}
                    />
                  </div>
                  <span className="zara-meta w-14 text-right">{count.toLocaleString()}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="zara-section-head">Recent activity</h2>
          {s.recent.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground italic">Nothing yet. Zara is listening.</p>
          ) : (
            <ul className="space-y-2.5">
              {s.recent.map((r, i) => (
                <li key={r.id}>
                  <div className="flex items-baseline justify-between gap-3 py-1">
                    <span className="text-[12.5px] text-foreground/85">
                      {r.action.replace('zara.', '').replace(/_/g, ' ')}
                    </span>
                    <span className="zara-meta">
                      {formatDistanceToNow(new Date(r.occurred_at), { addSuffix: true })}
                    </span>
                  </div>
                  {i < s.recent.length - 1 && <hr className="zara-rule mt-1" />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Quick test lead — quiet footer */}
      <hr className="zara-rule my-10" />
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="zara-eyebrow">Sandbox</div>
          <p className="text-[12.5px] text-muted-foreground mt-1.5 max-w-md leading-relaxed">
            Create a throwaway lead tagged <code className="text-foreground/90">zara:test</code> and watch a draft appear in Drafts.
          </p>
        </div>
        <Link to="/admin/zara/drafts" className="zara-link text-[12.5px]">
          Open Drafts →
        </Link>
      </div>
    </ZaraShell>
  );
}

function Tile({
  label, value, sub, small, accent,
}: { label: string; value: any; sub?: string; small?: boolean; accent?: 'emerald' | 'amber' | 'rose' }) {
  const accentColor =
    accent === 'emerald' ? 'text-emerald-500' :
    accent === 'amber'   ? 'text-amber-500'   :
    accent === 'rose'    ? 'text-rose-500'    : '';
  return (
    <div className="zara-tile">
      <div className="zara-tile__label">{label}</div>
      <div className={`zara-tile__num ${small ? 'zara-tile__num--sm' : ''} ${accentColor}`}>
        {value}
        {sub && <span className="text-[13px] text-muted-foreground/80 ml-1 font-normal">{sub}</span>}
      </div>
    </div>
  );
}

function KillSwitchTile({ enabled, onToggle, disabled }: {
  enabled: boolean; onToggle: (v: boolean) => void; disabled: boolean;
}) {
  return (
    <div className="zara-tile flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="zara-tile__label">Kill switch</span>
        <Switch checked={enabled} onCheckedChange={onToggle} disabled={disabled} />
      </div>
      <div className={`mt-3 text-[15px] font-medium tracking-tight ${enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}>
        {enabled ? 'Live' : 'Paused'}
      </div>
    </div>
  );
}

