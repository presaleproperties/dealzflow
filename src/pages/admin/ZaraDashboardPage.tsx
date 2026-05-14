// Zara Live Dashboard — realtime view of what Zara is working on.
// Sections: status hero, today's stats, live activity stream, assigned
// leads queue, escalations needing Uzair, training/health.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsAdmin } from '@/hooks/useAdmin';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Sparkles, Settings, Activity, Mail, MessageSquare, AlertTriangle,
  CheckCircle2, ShieldAlert, Clock, Users, Zap, Brain, RefreshCw,
  ArrowUpRight, Pause, Play, Flame,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const ZARA_SLUG = 'zara';

type AuditRow = {
  id: string;
  occurred_at: string;
  action: string;
  record_id: string | null;
  meta: any;
};

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[] | null;
  status: string | null;
  language: string | null;
  last_touch_at: string | null;
  engagement_score: number | null;
};

const ACTION_META: Record<string, { label: string; tone: string; icon: any }> = {
  'zara.replied':    { label: 'Auto-replied',  tone: 'text-emerald-500', icon: CheckCircle2 },
  'zara.escalation': { label: 'Escalated',     tone: 'text-amber-500',   icon: Flame },
  'zara.blocked':    { label: 'Blocked',       tone: 'text-muted-foreground', icon: ShieldAlert },
  'zara.send_failed':{ label: 'Send failed',   tone: 'text-rose-500',    icon: AlertTriangle },
  'zara.error':      { label: 'Error',         tone: 'text-rose-500',    icon: AlertTriangle },
};

function channelIcon(ch?: string) {
  if (ch === 'email') return Mail;
  return MessageSquare;
}

export default function ZaraDashboardPage() {
  const navigate = useNavigate();
  const { data: isAdmin, isLoading: checking } = useIsAdmin();
  const [loading, setLoading] = useState(true);
  const [zara, setZara] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!checking && !isAdmin) navigate('/'); }, [checking, isAdmin, navigate]);

  const load = async () => {
    const { data: t } = await supabase.from('crm_team')
      .select('id, slug, display_name, email, is_ai, is_active, sender_signature_html')
      .eq('slug', ZARA_SLUG).maybeSingle();
    setZara(t);
    const { data: s } = await supabase.from('crm_zara_settings').select('*').eq('id', 1).maybeSingle();
    setSettings(s);
    const { data: a } = await supabase.from('crm_audit_log')
      .select('id, occurred_at, action, record_id, meta')
      .eq('actor_label', 'zara')
      .order('occurred_at', { ascending: false })
      .limit(100);
    setAudit((a as AuditRow[]) || []);
    if (t?.id) {
      const { data: l } = await supabase.from('crm_contacts')
        .select('id, first_name, last_name, email, phone, tags, status, language, last_touch_at, engagement_score')
        .eq('assigned_to', t.id)
        .is('deleted_at', null)
        .order('last_touch_at', { ascending: false, nullsFirst: false })
        .limit(50);
      setLeads((l as Lead[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Realtime subscription on Zara's audit rows
  useEffect(() => {
    const ch = supabase.channel('zara-live-audit')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'crm_audit_log', filter: 'actor_label=eq.zara' },
        (payload) => {
          setAudit((prev) => [payload.new as AuditRow, ...prev].slice(0, 100));
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const stats = useMemo(() => {
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const inDay = audit.filter(r => new Date(r.occurred_at).getTime() >= dayAgo);
    const inWeek = audit.filter(r => new Date(r.occurred_at).getTime() >= weekAgo);
    const count = (rows: AuditRow[], a: string) => rows.filter(r => r.action === a).length;
    return {
      replied24:    count(inDay, 'zara.replied'),
      escalated24:  count(inDay, 'zara.escalation'),
      blocked24:    count(inDay, 'zara.blocked'),
      failed24:     count(inDay, 'zara.send_failed') + count(inDay, 'zara.error'),
      replied7:     count(inWeek, 'zara.replied'),
      escalated7:   count(inWeek, 'zara.escalation'),
    };
  }, [audit]);

  const escalations = useMemo(
    () => audit.filter(r => r.action === 'zara.escalation').slice(0, 10),
    [audit],
  );

  const inQuietHours = useMemo(() => {
    if (!settings) return false;
    try {
      const now = new Date();
      const tz = settings.timezone || 'America/Vancouver';
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' });
      const [hh, mm] = fmt.format(now).split(':').map(Number);
      const cur = hh * 60 + mm;
      const [sh, sm] = String(settings.quiet_hours_start).split(':').map(Number);
      const [eh, em] = String(settings.quiet_hours_end).split(':').map(Number);
      const start = sh * 60 + (sm || 0);
      const end = eh * 60 + (em || 0);
      return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end);
    } catch { return false; }
  }, [settings]);

  const toggleEnabled = async (next: boolean) => {
    if (!settings) return;
    setBusy(true);
    const { error } = await supabase.from('crm_zara_settings').update({ enabled: next }).eq('id', 1);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setSettings({ ...settings, enabled: next });
    toast.success(next ? 'Zara is back online' : 'Zara paused');
  };

  const syncIdentity = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke('zara-sync-identity', { body: {} });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success('Synced from Presale'); load(); }
  };

  if (checking || loading) {
    return (
      <AppLayout>
        <Header title="Zara — Live" />
        <div className="container mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  const enabled = !!settings?.enabled;
  const onlineNow = enabled && !inQuietHours;

  return (
    <AppLayout>
      <Header title="Zara — Live" />

      <div className="container mx-auto px-4 py-6 space-y-6 max-w-7xl">
        {/* HERO */}
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start gap-6 justify-between">
              <div className="flex items-start gap-4">
                <div className={`relative h-14 w-14 rounded-full grid place-items-center bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-md`}>
                  <Sparkles className="h-7 w-7" />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full ring-2 ring-background ${onlineNow ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-semibold">{zara?.display_name || 'Zara'}</h1>
                    <Badge variant="secondary" className="gap-1"><Brain className="h-3 w-3" /> AI Agent</Badge>
                    {onlineNow ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20">● Live</Badge>
                    ) : enabled ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/40"><Clock className="h-3 w-3 mr-1" /> Quiet hours</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground"><Pause className="h-3 w-3 mr-1" /> Paused</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{zara?.email}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Quiet hours {settings?.quiet_hours_start}–{settings?.quiet_hours_end} {settings?.timezone}
                    {' · '}Caps: {settings?.daily_send_cap_per_lead}/day per lead, {settings?.workspace_daily_cap}/day workspace
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border">
                  <span className="text-xs text-muted-foreground">Kill switch</span>
                  <Switch checked={enabled} onCheckedChange={toggleEnabled} disabled={busy} />
                </div>
                <Button variant="outline" size="sm" onClick={syncIdentity} disabled={busy}>
                  <RefreshCw className="h-4 w-4 mr-1.5" /> Sync identity
                </Button>
                <Button variant="outline" size="sm" onClick={load}>
                  <Activity className="h-4 w-4 mr-1.5" /> Refresh
                </Button>
                <Button asChild size="sm">
                  <Link to="/admin/zara/settings"><Settings className="h-4 w-4 mr-1.5" /> Settings</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={Users} label="Assigned leads" value={leads.length} tone="text-foreground" />
          <StatCard icon={CheckCircle2} label="Replied (24h)" value={stats.replied24} tone="text-emerald-500" />
          <StatCard icon={Flame} label="Escalated (24h)" value={stats.escalated24} tone="text-amber-500" />
          <StatCard icon={ShieldAlert} label="Blocked (24h)" value={stats.blocked24} tone="text-muted-foreground" />
          <StatCard icon={AlertTriangle} label="Failures (24h)" value={stats.failed24} tone="text-rose-500" />
        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live activity */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Live activity
                <Badge variant="outline" className="ml-1 text-xs font-normal">realtime</Badge>
              </CardTitle>
              <span className="text-xs text-muted-foreground">{audit.length} events</span>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[520px]">
                <div className="divide-y">
                  {audit.length === 0 && (
                    <div className="p-10 text-center text-sm text-muted-foreground">
                      Quiet for now. Zara will react here when an inbound reply arrives.
                    </div>
                  )}
                  {audit.map(row => {
                    const meta = ACTION_META[row.action] || { label: row.action, tone: 'text-foreground', icon: Activity };
                    const Icon = meta.icon;
                    const Ch = channelIcon(row.meta?.channel);
                    return (
                      <Link
                        key={row.id}
                        to={row.record_id ? `/crm/leads/${row.record_id}` : '#'}
                        className="block px-4 py-3 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 ${meta.tone}`}><Icon className="h-4 w-4" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-medium">{meta.label}</span>
                              {row.meta?.intent && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{row.meta.intent}</Badge>
                              )}
                              {row.meta?.confidence != null && (
                                <span className="text-xs text-muted-foreground">{Math.round(Number(row.meta.confidence) * 100)}%</span>
                              )}
                              <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Ch className="h-3 w-3" />
                                {formatDistanceToNow(new Date(row.occurred_at), { addSuffix: true })}
                              </span>
                            </div>
                            {(row.meta?.reply || row.meta?.suggested_reply || row.meta?.inbound_preview) && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {row.meta.reply || row.meta.suggested_reply || row.meta.inbound_preview}
                              </p>
                            )}
                            {row.meta?.reason && (
                              <p className="text-xs text-amber-600 mt-1">Reason: {row.meta.reason}</p>
                            )}
                            {row.meta?.error && (
                              <p className="text-xs text-rose-600 mt-1">Error: {String(row.meta.error).slice(0, 200)}</p>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right rail */}
          <div className="space-y-6">
            {/* Escalations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-amber-500" />
                  Needs Uzair
                  <Badge variant="secondary" className="ml-auto">{escalations.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {escalations.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground text-center">No open escalations.</div>
                ) : (
                  <div className="divide-y">
                    {escalations.map(e => (
                      <Link key={e.id} to={e.record_id ? `/crm/leads/${e.record_id}` : '#'}
                        className="flex items-start gap-2 px-4 py-3 hover:bg-muted/40">
                        <Flame className="h-4 w-4 text-amber-500 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {e.meta?.intent || 'Escalation'} · {e.meta?.channel || 'msg'}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {e.meta?.inbound_preview || e.meta?.suggested_reply || '—'}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true })}
                          </p>
                        </div>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Training / Brain */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-4 w-4" /> Training & brain
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Classifier model" value={settings?.model_classify || '—'} />
                <Row label="Drafter model"    value={settings?.model_draft || '—'} />
                <Row label="Prompt version"   value={settings?.system_prompt_version || 'v0'} />
                <Row label="7-day replies"    value={String(stats.replied7)} />
                <Row label="7-day escalations" value={String(stats.escalated7)} />
                <Button asChild variant="outline" size="sm" className="w-full mt-2">
                  <Link to="/admin/zara/settings">Tune behavior →</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* LEADS TABS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Zara's lead queue
              <Badge variant="secondary" className="ml-1">{leads.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All ({leads.length})</TabsTrigger>
                <TabsTrigger value="hot">Hot ({leads.filter(l => l.tags?.includes('hot')).length})</TabsTrigger>
                <TabsTrigger value="muted">Muted ({leads.filter(l => l.tags?.includes('zara:muted')).length})</TabsTrigger>
                <TabsTrigger value="cold">Cold ({leads.filter(l => !l.last_touch_at || (Date.now() - new Date(l.last_touch_at).getTime() > 14*86400000)).length})</TabsTrigger>
              </TabsList>
              <TabsContent value="all"><LeadList leads={leads} /></TabsContent>
              <TabsContent value="hot"><LeadList leads={leads.filter(l => l.tags?.includes('hot'))} /></TabsContent>
              <TabsContent value="muted"><LeadList leads={leads.filter(l => l.tags?.includes('zara:muted'))} /></TabsContent>
              <TabsContent value="cold"><LeadList leads={leads.filter(l => !l.last_touch_at || (Date.now() - new Date(l.last_touch_at).getTime() > 14*86400000))} /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number | string; tone: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${tone}`} />
        </div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs truncate max-w-[60%] text-right">{value}</span>
    </div>
  );
}

function LeadList({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) {
    return <div className="py-10 text-center text-sm text-muted-foreground">No leads in this view.</div>;
  }
  return (
    <div className="divide-y -mx-2">
      {leads.map(l => {
        const name = [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || 'Lead';
        const isHot = l.tags?.includes('hot');
        const isMuted = l.tags?.includes('zara:muted');
        return (
          <Link key={l.id} to={`/crm/leads/${l.id}`}
            className="flex items-center gap-3 px-2 py-2.5 hover:bg-muted/40 rounded-md">
            <div className="h-8 w-8 rounded-full bg-muted grid place-items-center text-xs font-medium">
              {name.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{name}</span>
                {isHot && <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 text-[10px] px-1.5 py-0">hot</Badge>}
                {isMuted && <Badge variant="outline" className="text-[10px] px-1.5 py-0">muted</Badge>}
                {l.language && l.language !== 'en' && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{l.language}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {l.email || l.phone || '—'} · {l.status || 'new'}
                {l.last_touch_at && ` · last touch ${formatDistanceToNow(new Date(l.last_touch_at), { addSuffix: true })}`}
              </p>
            </div>
            {l.engagement_score != null && (
              <span className="text-xs font-mono text-muted-foreground">{l.engagement_score}</span>
            )}
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
          </Link>
        );
      })}
    </div>
  );
}
