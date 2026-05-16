import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, subDays, startOfDay, parseISO } from 'date-fns';
import { Mail, Eye, MousePointerClick, AlertTriangle, Send, Users, Download, ExternalLink, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

type EmailLog = {
  id: string;
  contact_id: string;
  user_id: string | null;
  subject: string | null;
  sent_at: string;
  direction: string;
  status: string;
  open_count: number | null;
  click_count: number | null;
  human_open_count?: number | null;
  bot_open_count?: number | null;
  opened_at: string | null;
  clicked_at: string | null;
  failed_at: string | null;
};

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
];

export function EmailReportTab() {
  const [days, setDays] = useState(30);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['crm-reports-email-log', days],
    queryFn: async (): Promise<EmailLog[]> => {
      const since = subDays(new Date(), days).toISOString();
      const PAGE = 1000;
      let all: EmailLog[] = [];
      let from = 0;
      let more = true;
      while (more) {
        const { data, error } = await supabase
          .from('crm_email_log')
          .select('id,contact_id,user_id,subject,sent_at,direction,status,open_count,click_count,human_open_count,bot_open_count,opened_at,clicked_at,failed_at')
          .gte('sent_at', since)
          .order('sent_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as EmailLog[];
        all = all.concat(batch);
        more = batch.length === PAGE;
        from += PAGE;
      }
      return all;
    },
  });

  // Mass-campaign sends — these are NOT in crm_email_log, they live in crm_email_send_jobs
  const { data: massJobs = [] } = useQuery({
    queryKey: ['crm-reports-email-mass-jobs', days],
    queryFn: async (): Promise<EmailLog[]> => {
      const since = subDays(new Date(), days).toISOString();
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      let more = true;
      while (more) {
        const { data, error } = await supabase
          .from('crm_email_send_jobs')
          .select('id,contact_id,subject,status,sent_at,opened_at,clicked_at,open_count,click_count,campaign_id,error_message,created_at')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []);
        all = all.concat(batch);
        more = batch.length === PAGE;
        from += PAGE;
      }
      // Normalize into EmailLog-ish rows (direction='outbound', user_id=null since mass is sent server-side)
      return all.map((r: any) => ({
        id: r.id,
        contact_id: r.contact_id,
        user_id: null,
        subject: r.subject ?? '(mass campaign)',
        sent_at: r.sent_at ?? r.created_at,
        direction: 'outbound',
        status: r.status,
        open_count: r.open_count ?? 0,
        click_count: r.click_count ?? 0,
        opened_at: r.opened_at,
        clicked_at: r.clicked_at,
        failed_at: ['failed', 'bounced', 'complained', 'rejected'].includes(r.status) ? (r.sent_at ?? r.created_at) : null,
      })) as EmailLog[];
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['crm-reports-email-campaigns', days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const { data } = await supabase
        .from('crm_email_campaigns')
        .select('id,subject,sent_at,recipients_count,opens,clicks,status')
        .gte('sent_at', since)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false });
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

  // Bounced / failed addresses — pulled from mass send log (has email_to)
  const { data: badSendRows = [] } = useQuery({
    queryKey: ['crm-reports-email-bounces', days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from('crm_email_send_jobs')
        .select('email_to, contact_id, recipient_name, status, error_message, sent_at, created_at')
        .in('status', ['failed', 'bounced', 'complained', 'suppressed', 'rejected'])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Also pull failed 1:1 sends from crm_email_log + join contacts for emails
  const { data: badLogContacts = [] } = useQuery({
    queryKey: ['crm-reports-email-bounces-1to1', days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const { data: logs, error } = await supabase
        .from('crm_email_log')
        .select('contact_id, status, error_message, failed_at, sent_at')
        .eq('direction', 'outbound')
        .or('status.eq.failed,status.eq.bounced,status.eq.complained,failed_at.not.is.null')
        .gte('sent_at', since)
        .limit(1000);
      if (error) throw error;
      const ids = Array.from(new Set((logs ?? []).map((l: any) => l.contact_id).filter(Boolean)));
      if (ids.length === 0) return [];
      const { data: contacts } = await supabase
        .from('crm_contacts')
        .select('id, email, first_name, last_name')
        .in('id', ids);
      const cmap = new Map((contacts ?? []).map((c: any) => [c.id, c]));
      return (logs ?? []).map((l: any) => {
        const c = cmap.get(l.contact_id);
        return {
          email_to: c?.email ?? null,
          contact_id: l.contact_id,
          recipient_name: c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : null,
          status: l.status ?? 'failed',
          error_message: l.error_message,
          sent_at: l.failed_at ?? l.sent_at,
          created_at: l.failed_at ?? l.sent_at,
        };
      });
    },
  });

  const badAddresses = useMemo(() => {
    type Row = {
      email: string; contactId: string | null; name: string | null;
      count: number; lastStatus: string; lastError: string | null; lastAt: string;
    };
    const map = new Map<string, Row>();
    const ingest = (rows: any[]) => {
      rows.forEach(r => {
        const email = (r.email_to || '').toLowerCase().trim();
        if (!email) return;
        const cur = map.get(email);
        const at = r.sent_at || r.created_at;
        if (!cur) {
          map.set(email, {
            email,
            contactId: r.contact_id ?? null,
            name: r.recipient_name ?? null,
            count: 1,
            lastStatus: r.status,
            lastError: r.error_message ?? null,
            lastAt: at,
          });
        } else {
          cur.count += 1;
          if (!cur.lastAt || (at && at > cur.lastAt)) {
            cur.lastAt = at;
            cur.lastStatus = r.status;
            cur.lastError = r.error_message ?? cur.lastError;
          }
          if (!cur.contactId && r.contact_id) cur.contactId = r.contact_id;
          if (!cur.name && r.recipient_name) cur.name = r.recipient_name;
        }
      });
    };
    ingest(badSendRows as any[]);
    ingest(badLogContacts as any[]);
    return Array.from(map.values()).sort((a, b) => b.count - a.count || (b.lastAt || '').localeCompare(a.lastAt || ''));
  }, [badSendRows, badLogContacts]);

  const totalBadAddresses = badAddresses.length;
  const totalBadEvents = badAddresses.reduce((s, r) => s + r.count, 0);

  const exportBadCsv = () => {
    const headers = ['email', 'name', 'failures', 'last_status', 'last_error', 'last_failed_at', 'contact_id'];
    const lines = [headers.join(',')];
    badAddresses.forEach(r => {
      const esc = (v: any) => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      lines.push([r.email, r.name, r.count, r.lastStatus, r.lastError, r.lastAt, r.contactId].map(esc).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bounced-emails-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyAllEmails = async () => {
    await navigator.clipboard.writeText(badAddresses.map(r => r.email).join('\n'));
    toast.success(`Copied ${badAddresses.length} addresses`);
  };


  const outbound = useMemo(
    () => [...logs.filter(l => l.direction === 'outbound'), ...massJobs],
    [logs, massJobs],
  );
  // Prefer verified human opens. Fallback to raw open_count for legacy rows
  // (sent before bot filtering was deployed) so historical data isn't zeroed out.
  const humanOpens = (l: EmailLog) => {
    const h = l.human_open_count ?? null;
    const b = l.bot_open_count ?? 0;
    const raw = l.open_count ?? 0;
    if (h !== null && (h > 0 || b > 0)) return h; // post-filter row
    return raw; // legacy row, no classification available
  };
  const totalSent = outbound.length;
  const sentOk = outbound.filter(l => l.status === 'sent').length;
  const failed = outbound.filter(l => l.status === 'failed' || !!l.failed_at).length;
  const opened = outbound.filter(l => humanOpens(l) > 0).length;
  const rawOpened = outbound.filter(l => (l.open_count ?? 0) > 0).length;
  const botOpened = rawOpened - opened;
  const clicked = outbound.filter(l => (l.click_count ?? 0) > 0).length;
  const uniqueRecipients = new Set(outbound.map(l => l.contact_id)).size;
  const openRate = sentOk ? (opened / sentOk) * 100 : 0;
  const clickRate = sentOk ? (clicked / sentOk) * 100 : 0;
  const ctor = opened ? (clicked / opened) * 100 : 0;
  const bounceRate = totalSent ? (failed / totalSent) * 100 : 0;

  const overTime = useMemo(() => {
    const buckets: Record<string, { date: string; sent: number; opened: number; clicked: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      buckets[d] = { date: d, sent: 0, opened: 0, clicked: 0 };
    }
    outbound.forEach(l => {
      const d = format(startOfDay(parseISO(l.sent_at)), 'yyyy-MM-dd');
      if (buckets[d]) buckets[d].sent++;
      if (l.opened_at && humanOpens(l) > 0) {
        const od = format(startOfDay(parseISO(l.opened_at)), 'yyyy-MM-dd');
        if (buckets[od]) buckets[od].opened++;
      }
      if (l.clicked_at) {
        const cd = format(startOfDay(parseISO(l.clicked_at)), 'yyyy-MM-dd');
        if (buckets[cd]) buckets[cd].clicked++;
      }
    });
    return Object.values(buckets).map(b => ({
      ...b,
      label: format(parseISO(b.date), days > 60 ? 'MMM d' : 'MMM d'),
    }));
  }, [outbound, days]);

  const byHour = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}h`, sent: 0, opened: 0 }));
    outbound.forEach(l => {
      const h = parseISO(l.sent_at).getHours();
      arr[h].sent++;
      if (humanOpens(l) > 0) arr[h].opened++;
    });
    return arr;
  }, [outbound]);

  const bySubject = useMemo(() => {
    const map: Record<string, { subject: string; sent: number; opened: number; clicked: number }> = {};
    outbound.forEach(l => {
      const s = (l.subject || '(no subject)').slice(0, 80);
      if (!map[s]) map[s] = { subject: s, sent: 0, opened: 0, clicked: 0 };
      map[s].sent++;
      if (humanOpens(l) > 0) map[s].opened++;
      if ((l.click_count ?? 0) > 0) map[s].clicked++;
    });
    return Object.values(map)
      .filter(r => r.sent >= 1)
      .map(r => ({ ...r, openRate: r.sent ? (r.opened / r.sent) * 100 : 0, clickRate: r.sent ? (r.clicked / r.sent) * 100 : 0 }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 10);
  }, [outbound]);

  const byAgent = useMemo(() => {
    const map: Record<string, { agent: string; sent: number; opened: number; clicked: number; failed: number }> = {};
    outbound.forEach(l => {
      const k = l.user_id ?? 'unassigned';
      const name = agentMap[k] || 'Unknown';
      if (!map[k]) map[k] = { agent: name, sent: 0, opened: 0, clicked: 0, failed: 0 };
      map[k].sent++;
      if (humanOpens(l) > 0) map[k].opened++;
      if ((l.click_count ?? 0) > 0) map[k].clicked++;
      if (l.status === 'failed' || l.failed_at) map[k].failed++;
    });
    return Object.values(map).sort((a, b) => b.sent - a.sent);
  }, [outbound, agentMap]);

  const funnel = [
    { stage: 'Sent', value: totalSent, color: 'hsl(var(--primary))' },
    { stage: 'Delivered', value: sentOk, color: 'hsl(210 62% 46%)' },
    { stage: 'Opened (human)', value: opened, color: 'hsl(142 71% 45%)' },
    { stage: 'Clicked', value: clicked, color: 'hsl(38 92% 50%)' },
  ];
  const maxF = Math.max(...funnel.map(f => f.value), 1);

  const kpis = [
    { label: 'Sent', value: totalSent.toLocaleString(), icon: Send, sub: `${uniqueRecipients} recipients` },
    { label: 'Open Rate', value: `${openRate.toFixed(1)}%`, icon: Eye, sub: `${opened.toLocaleString()} human opens${botOpened > 0 ? ` · ${botOpened} bot` : ''}` },
    { label: 'Click Rate', value: `${clickRate.toFixed(1)}%`, icon: MousePointerClick, sub: `${clicked.toLocaleString()} clicks` },
    { label: 'CTOR', value: `${ctor.toFixed(1)}%`, icon: Users, sub: 'click-to-open' },
    { label: 'Bounce / Fail', value: `${bounceRate.toFixed(1)}%`, icon: AlertTriangle, sub: `${failed.toLocaleString()} failed` },
    { label: 'Campaigns', value: campaigns.length.toLocaleString(), icon: Mail, sub: 'in range' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Range selector */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {isLoading ? 'Loading…' : `${totalSent.toLocaleString()} emails in last ${days} days`}
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

      {/* Engagement over time */}
      <Card className="rounded-xl">
        <CardHeader><CardTitle className="text-base">Engagement Over Time</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={overTime}>
              <defs>
                <linearGradient id="emSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="emOpen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={Math.max(0, Math.floor(overTime.length / 10))} className="fill-muted-foreground" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="sent" stroke="hsl(var(--primary))" fill="url(#emSent)" strokeWidth={2} name="Sent" />
              <Area type="monotone" dataKey="opened" stroke="hsl(142 71% 45%)" fill="url(#emOpen)" strokeWidth={2} name="Opened" />
              <Line type="monotone" dataKey="clicked" stroke="hsl(38 92% 50%)" strokeWidth={2} dot={false} name="Clicked" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funnel */}
        <Card className="rounded-xl">
          <CardHeader><CardTitle className="text-base">Engagement Funnel</CardTitle></CardHeader>
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
                      <div className="h-full rounded-md transition-all" style={{ width: `${Math.max(pct, 2)}%`, background: f.color, opacity: 0.85 }} />
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

        {/* Best send hour */}
        <Card className="rounded-xl">
          <CardHeader><CardTitle className="text-base">Activity by Hour of Day</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byHour}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} className="fill-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sent" fill="hsl(var(--primary))" name="Sent" radius={[3, 3, 0, 0]} />
                <Bar dataKey="opened" fill="hsl(142 71% 45%)" name="Opened" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top subjects */}
      <Card className="rounded-xl">
        <CardHeader><CardTitle className="text-base">Top Subjects</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Opens</TableHead>
                <TableHead className="text-right">Open %</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Click %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bySubject.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No emails in this range</TableCell></TableRow>
              ) : bySubject.map(r => (
                <TableRow key={r.subject}>
                  <TableCell className="font-medium max-w-[420px] truncate">{r.subject}</TableCell>
                  <TableCell className="text-right">{r.sent}</TableCell>
                  <TableCell className="text-right">{r.opened}</TableCell>
                  <TableCell className="text-right text-primary font-semibold">{r.openRate.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{r.clicked}</TableCell>
                  <TableCell className="text-right text-primary font-semibold">{r.clickRate.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Per-agent */}
      <Card className="rounded-xl">
        <CardHeader><CardTitle className="text-base">Per Agent</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Opens</TableHead>
                <TableHead className="text-right">Open %</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byAgent.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No data</TableCell></TableRow>
              ) : byAgent.map(r => (
                <TableRow key={r.agent}>
                  <TableCell className="font-medium">{r.agent}</TableCell>
                  <TableCell className="text-right">{r.sent}</TableCell>
                  <TableCell className="text-right">{r.opened}</TableCell>
                  <TableCell className="text-right text-primary font-semibold">{r.sent ? ((r.opened / r.sent) * 100).toFixed(1) : '0'}%</TableCell>
                  <TableCell className="text-right">{r.clicked}</TableCell>
                  <TableCell className="text-right text-destructive">{r.failed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Campaigns table */}
      {campaigns.length > 0 && (
        <Card className="rounded-xl">
          <CardHeader><CardTitle className="text-base">Recent Campaigns</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="text-right">Recipients</TableHead>
                  <TableHead className="text-right">Opens</TableHead>
                  <TableHead className="text-right">Open %</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c: any) => {
                  const rec = c.recipients_count ?? 0;
                  const or = rec > 0 ? ((c.opens ?? 0) / rec) * 100 : 0;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium max-w-[360px] truncate">{c.subject}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{c.sent_at ? format(parseISO(c.sent_at), 'MMM d, yyyy') : '—'}</TableCell>
                      <TableCell className="text-right">{rec.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(c.opens ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-primary font-semibold">{or.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{(c.clicks ?? 0).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Bounced / failed addresses — DB hygiene */}
      <Card className="rounded-xl border-destructive/30">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Bounced & Failed Addresses
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {totalBadAddresses.toLocaleString()} unique address{totalBadAddresses === 1 ? '' : 'es'} •{' '}
              {totalBadEvents.toLocaleString()} failure{totalBadEvents === 1 ? '' : 's'} in last {days} days
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={copyAllEmails} disabled={!badAddresses.length}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
            </Button>
            <Button size="sm" variant="outline" onClick={exportBadCsv} disabled={!badAddresses.length}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Failures</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead>Last failed</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {badAddresses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    No bounced or failed addresses in this range — your list is clean.
                  </TableCell>
                </TableRow>
              ) : badAddresses.slice(0, 200).map(r => {
                const tone =
                  r.lastStatus === 'bounced' ? 'destructive' :
                  r.lastStatus === 'complained' ? 'destructive' :
                  r.lastStatus === 'suppressed' ? 'secondary' : 'outline';
                return (
                  <TableRow key={r.email}>
                    <TableCell className="font-mono text-xs">{r.email}</TableCell>
                    <TableCell className="text-sm">{r.name || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={tone as any} className="capitalize text-[10px]">{r.lastStatus}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-destructive">{r.count}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={r.lastError ?? ''}>
                      {r.lastError || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.lastAt ? format(parseISO(r.lastAt), 'MMM d, h:mm a') : '—'}
                    </TableCell>
                    <TableCell>
                      {r.contactId && (
                        <Link to={`/crm/leads/${r.contactId}`} className="text-primary hover:underline inline-flex">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {badAddresses.length > 200 && (
            <p className="text-[11px] text-muted-foreground mt-2 text-center">
              Showing top 200 of {badAddresses.length.toLocaleString()} — export CSV for the full list.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
