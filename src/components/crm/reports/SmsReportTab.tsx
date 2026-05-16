import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { format, subDays, startOfDay, parseISO } from 'date-fns';
import { MessageSquare, CheckCheck, AlertTriangle, Send, Inbox, Ban, DollarSign } from 'lucide-react';

type SmsLog = {
  id: string;
  user_id: string | null;
  contact_id: string | null;
  direction: string;
  status: string;
  body: string | null;
  sent_at: string;
  delivered_at: string | null;
  num_segments: number | null;
  channel: string;
  message_type: string;
  campaign_id: string | null;
  price: number | null;
  error_code: string | null;
};

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
];

const DELIVERED_STATUSES = new Set(['delivered', 'sent']);
const FAILED_STATUSES = new Set(['failed', 'undelivered', 'dlq']);

export function SmsReportTab() {
  const [days, setDays] = useState(30);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['crm-reports-sms-log', days],
    queryFn: async (): Promise<SmsLog[]> => {
      const since = subDays(new Date(), days).toISOString();
      const PAGE = 1000;
      let all: SmsLog[] = [];
      let from = 0;
      let more = true;
      while (more) {
        const { data, error } = await supabase
          .from('crm_sms_log')
          .select('id,user_id,contact_id,direction,status,body,sent_at,delivered_at,num_segments,channel,message_type,campaign_id,price,error_code')
          .gte('sent_at', since)
          .order('sent_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as SmsLog[];
        all = all.concat(batch);
        more = batch.length === PAGE;
        from += PAGE;
      }
      return all;
    },
  });

  const { data: optOuts = [] } = useQuery({
    queryKey: ['crm-reports-sms-optouts'],
    queryFn: async () => {
      const { count } = await supabase
        .from('crm_sms_opt_outs')
        .select('id', { count: 'exact', head: true });
      return [{ count: count ?? 0 }];
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['crm-reports-sms-campaigns', days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const { data } = await supabase
        .from('crm_sms_campaigns')
        .select('id,name,completed_at,recipients_count,delivered_count,failed_count,status,channel')
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['crm-team-agents-min'],
    queryFn: async () => {
      const { data } = await supabase.from('crm_team').select('user_id, display_name');
      return data ?? [];
    },
  });
  const agentMap = useMemo(
    () => Object.fromEntries(agents.map((a: any) => [a.user_id, a.display_name])),
    [agents],
  );

  const outbound = useMemo(() => logs.filter(l => l.direction === 'outbound'), [logs]);
  const inbound = useMemo(() => logs.filter(l => l.direction === 'inbound'), [logs]);

  const totalSent = outbound.length;
  const delivered = outbound.filter(l => DELIVERED_STATUSES.has(l.status) || !!l.delivered_at).length;
  const failed = outbound.filter(l => FAILED_STATUSES.has(l.status)).length;
  const pending = outbound.filter(l => !DELIVERED_STATUSES.has(l.status) && !FAILED_STATUSES.has(l.status)).length;
  const deliveryRate = totalSent ? (delivered / totalSent) * 100 : 0;
  const failRate = totalSent ? (failed / totalSent) * 100 : 0;
  const totalSegments = outbound.reduce((s, l) => s + (l.num_segments ?? 1), 0);
  const totalCost = outbound.reduce((s, l) => s + Math.abs(Number(l.price ?? 0)), 0);
  const uniqueContacts = new Set(outbound.map(l => l.contact_id).filter(Boolean)).size;
  const inboundCount = inbound.length;
  // Response rate: outbound contacts that responded
  const outboundContactIds = new Set(outbound.map(l => l.contact_id).filter(Boolean));
  const respondedContacts = new Set(inbound.map(l => l.contact_id).filter(c => c && outboundContactIds.has(c))).size;
  const responseRate = uniqueContacts ? (respondedContacts / uniqueContacts) * 100 : 0;

  const overTime = useMemo(() => {
    const buckets: Record<string, { date: string; outbound: number; inbound: number; failed: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      buckets[d] = { date: d, outbound: 0, inbound: 0, failed: 0 };
    }
    logs.forEach(l => {
      const d = format(startOfDay(parseISO(l.sent_at)), 'yyyy-MM-dd');
      if (!buckets[d]) return;
      if (l.direction === 'outbound') buckets[d].outbound++;
      else if (l.direction === 'inbound') buckets[d].inbound++;
      if (FAILED_STATUSES.has(l.status)) buckets[d].failed++;
    });
    return Object.values(buckets).map(b => ({ ...b, label: format(parseISO(b.date), 'MMM d') }));
  }, [logs, days]);

  const byChannel = useMemo(() => {
    const map: Record<string, number> = {};
    logs.forEach(l => {
      const k = (l.channel || 'sms').toUpperCase();
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [logs]);
  const CHANNEL_COLORS = ['hsl(var(--primary))', 'hsl(142 71% 45%)', 'hsl(210 62% 46%)'];

  const byAgent = useMemo(() => {
    const map: Record<string, { agent: string; sent: number; delivered: number; failed: number; segments: number; cost: number }> = {};
    outbound.forEach(l => {
      const k = l.user_id ?? 'unassigned';
      const name = agentMap[k] || 'Unknown';
      if (!map[k]) map[k] = { agent: name, sent: 0, delivered: 0, failed: 0, segments: 0, cost: 0 };
      map[k].sent++;
      if (DELIVERED_STATUSES.has(l.status) || l.delivered_at) map[k].delivered++;
      if (FAILED_STATUSES.has(l.status)) map[k].failed++;
      map[k].segments += l.num_segments ?? 1;
      map[k].cost += Math.abs(Number(l.price ?? 0));
    });
    return Object.values(map).sort((a, b) => b.sent - a.sent);
  }, [outbound, agentMap]);

  const topErrors = useMemo(() => {
    const map: Record<string, number> = {};
    outbound.forEach(l => {
      if (!FAILED_STATUSES.has(l.status)) return;
      const k = l.error_code || 'unknown';
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [outbound]);

  const funnel = [
    { stage: 'Sent', value: totalSent, color: 'hsl(var(--primary))' },
    { stage: 'Delivered', value: delivered, color: 'hsl(142 71% 45%)' },
    { stage: 'Responded', value: respondedContacts, color: 'hsl(38 92% 50%)' },
  ];
  const maxF = Math.max(...funnel.map(f => f.value), 1);

  const kpis = [
    { label: 'Sent', value: totalSent.toLocaleString(), icon: Send, sub: `${uniqueContacts} contacts` },
    { label: 'Delivery Rate', value: `${deliveryRate.toFixed(1)}%`, icon: CheckCheck, sub: `${delivered.toLocaleString()} delivered` },
    { label: 'Failed', value: `${failRate.toFixed(1)}%`, icon: AlertTriangle, sub: `${failed.toLocaleString()} failed` },
    { label: 'Inbound', value: inboundCount.toLocaleString(), icon: Inbox, sub: `${responseRate.toFixed(1)}% response` },
    { label: 'Segments', value: totalSegments.toLocaleString(), icon: MessageSquare, sub: `${pending} pending` },
    { label: 'Est. Cost', value: `$${totalCost.toFixed(2)}`, icon: DollarSign, sub: 'Twilio billed' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {isLoading ? 'Loading…' : `${logs.length.toLocaleString()} messages in last ${days} days`}
        </p>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            {RANGES.map(r => (
              <TabsTrigger key={r.days} value={String(r.days)} className="text-xs">{r.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="rounded-xl">
            <CardContent className="pt-4 px-3 sm:px-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <k.icon className="h-3.5 w-3.5" />
                <span className="text-[11px] sm:text-xs">{k.label}</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-foreground leading-tight">{k.value}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Over time */}
      <Card className="rounded-xl">
        <CardHeader><CardTitle className="text-base">Messages Over Time</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={overTime}>
              <defs>
                <linearGradient id="smsOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="smsIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={Math.max(0, Math.floor(overTime.length / 10))} className="fill-muted-foreground" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="outbound" stroke="hsl(var(--primary))" fill="url(#smsOut)" strokeWidth={2} name="Outbound" />
              <Area type="monotone" dataKey="inbound" stroke="hsl(142 71% 45%)" fill="url(#smsIn)" strokeWidth={2} name="Inbound" />
              <Area type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" fillOpacity={0} strokeWidth={2} name="Failed" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Funnel */}
        <Card className="rounded-xl lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Delivery Funnel</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {funnel.map((f, i) => {
              const pct = (f.value / maxF) * 100;
              const prev = i > 0 ? funnel[i - 1].value : null;
              const conv = prev && prev > 0 ? ((f.value / prev) * 100).toFixed(1) : null;
              return (
                <div key={f.stage}>
                  {i > 0 && conv && <div className="text-[11px] text-muted-foreground text-center py-0.5">↓ {conv}%</div>}
                  <div className="flex items-center gap-3">
                    <span className="text-xs w-20 shrink-0 text-right text-muted-foreground">{f.stage}</span>
                    <div className="flex-1 h-8 bg-muted/40 rounded-md overflow-hidden relative">
                      <div className="h-full rounded-md" style={{ width: `${Math.max(pct, 2)}%`, background: f.color, opacity: 0.85 }} />
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground">
                        {f.value.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Channel split */}
        <Card className="rounded-xl">
          <CardHeader><CardTitle className="text-base">Channel Split</CardTitle></CardHeader>
          <CardContent>
            {byChannel.length === 0 ? (
              <p className="text-xs text-muted-foreground py-10 text-center">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={byChannel} dataKey="value" nameKey="name" outerRadius={80} label={(e: any) => `${e.name} (${e.value})`}>
                    {byChannel.map((_, i) => <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Opt-outs + errors */}
        <Card className="rounded-xl">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Ban className="h-4 w-4" /> Compliance & Errors</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
              <span className="text-sm text-muted-foreground">Total opt-outs (STOP)</span>
              <span className="text-lg font-bold text-foreground">{(optOuts[0]?.count ?? 0).toLocaleString()}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Top error codes</p>
              {topErrors.length === 0 ? (
                <p className="text-xs text-muted-foreground">No failures 🎉</p>
              ) : (
                <ul className="space-y-1">
                  {topErrors.map(e => (
                    <li key={e.code} className="flex items-center justify-between text-sm">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{e.code}</code>
                      <span className="text-destructive font-medium">{e.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per agent */}
      <Card className="rounded-xl">
        <CardHeader><CardTitle className="text-base">Per Agent</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Delivery %</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Segments</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byAgent.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">No data</TableCell></TableRow>
              ) : byAgent.map(r => (
                <TableRow key={r.agent}>
                  <TableCell className="font-medium">{r.agent}</TableCell>
                  <TableCell className="text-right">{r.sent}</TableCell>
                  <TableCell className="text-right">{r.delivered}</TableCell>
                  <TableCell className="text-right text-primary font-semibold">{r.sent ? ((r.delivered / r.sent) * 100).toFixed(1) : '0'}%</TableCell>
                  <TableCell className="text-right text-destructive">{r.failed}</TableCell>
                  <TableCell className="text-right">{r.segments}</TableCell>
                  <TableCell className="text-right">${r.cost.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Campaigns */}
      {campaigns.length > 0 && (
        <Card className="rounded-xl">
          <CardHeader><CardTitle className="text-base">Recent Campaigns</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Delivery %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c: any) => {
                  const rec = c.recipients_count ?? 0;
                  const dr = rec > 0 ? ((c.delivered_count ?? 0) / rec) * 100 : 0;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium max-w-[280px] truncate">{c.name || 'Untitled'}</TableCell>
                      <TableCell className="uppercase text-xs">{c.channel || 'sms'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{c.completed_at ? format(parseISO(c.completed_at), 'MMM d, yyyy') : '—'}</TableCell>
                      <TableCell className="text-right">{rec.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(c.delivered_count ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-destructive">{(c.failed_count ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-primary font-semibold">{dr.toFixed(1)}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
