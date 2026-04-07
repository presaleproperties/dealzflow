import { useMemo, useState } from 'react';
import { Users, CalendarDays, Target, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { useCrmContacts, LEAD_STATUSES } from '@/hooks/useCrmContacts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, parseISO, startOfMonth, differenceInDays } from 'date-fns';

const FUNNEL_STAGES = [
  'New Lead', 'Contacted', 'Nurturing', 'Hot / Engaged',
  'Showing Booked', 'Offer Made', 'Closed',
] as const;

export default function CrmReportsPage() {
  const { data: contacts = [] } = useCrmContacts();

  const { data: showings = [] } = useQuery({
    queryKey: ['crm-reports-showings'],
    queryFn: async () => {
      const { data } = await supabase.from('crm_showings').select('*');
      return data ?? [];
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['crm-reports-messages'],
    queryFn: async () => {
      const { data } = await supabase.from('crm_messages').select('sent_by, direction');
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Reports</h1>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agents">Agent Performance</TabsTrigger>
          <TabsTrigger value="funnel">Funnel Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab contacts={contacts} showings={showings} />
        </TabsContent>
        <TabsContent value="agents">
          <AgentPerformanceTab contacts={contacts} showings={showings} messages={messages} />
        </TabsContent>
        <TabsContent value="funnel">
          <FunnelTab contacts={contacts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Overview ── */
function OverviewTab({ contacts, showings }: { contacts: any[]; showings: any[] }) {
  const now = new Date();
  const monthStart = startOfMonth(now);

  const leadsThisMonth = contacts.filter(c => c.created_at && new Date(c.created_at) >= monthStart).length;
  const showingsThisMonth = showings.filter(s => s.showing_date && new Date(s.showing_date) >= monthStart).length;
  const closed = contacts.filter(c => c.status === 'Closed').length;
  const closeRate = contacts.length > 0 ? ((closed / contacts.length) * 100).toFixed(1) : '0';

  // Leads over time (last 90 days)
  const leadsOverTime = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (let i = 89; i >= 0; i--) {
      buckets[format(subDays(now, i), 'yyyy-MM-dd')] = 0;
    }
    contacts.forEach(c => {
      if (!c.created_at) return;
      const d = format(new Date(c.created_at), 'yyyy-MM-dd');
      if (d in buckets) buckets[d]++;
    });
    return Object.entries(buckets).map(([date, count]) => ({
      date: format(parseISO(date), 'MMM d'),
      leads: count,
    }));
  }, [contacts]);

  // By source
  const bySource = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach(c => {
      const s = c.source || 'Unknown';
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [contacts]);

  // By project
  const byProject = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach(c => {
      const p = c.project || 'Unassigned';
      map[p] = (map[p] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [contacts]);

  const kpis = [
    { label: 'Total Leads', value: contacts.length, icon: Users },
    { label: 'Leads This Month', value: leadsThisMonth, icon: TrendingUp },
    { label: 'Showings This Month', value: showingsThisMonth, icon: CalendarDays },
    { label: 'Close Rate', value: `${closeRate}%`, icon: Target },
  ];

  const lineConfig = { leads: { label: 'Leads', color: 'hsl(var(--primary))' } };
  const barConfig = { count: { label: 'Count', color: 'hsl(var(--primary))' } };

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="pt-6 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><k.icon className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-bold text-foreground">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leads over time */}
      <Card>
        <CardHeader><CardTitle className="text-base">Leads Over Time (90 Days)</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={lineConfig} className="h-[280px] w-full">
            <LineChart data={leadsOverTime}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={13} className="fill-muted-foreground" />
              <YAxis allowDecimals={false} className="fill-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="leads" stroke="var(--color-leads)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Two-column bar charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Leads by Source</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={barConfig} className="h-[260px] w-full">
              <BarChart data={bySource} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis type="number" allowDecimals={false} className="fill-muted-foreground" />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Leads by Project</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={barConfig} className="h-[260px] w-full">
              <BarChart data={byProject} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis type="number" allowDecimals={false} className="fill-muted-foreground" />
                <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── Agent Performance ── */
function AgentPerformanceTab({ contacts, showings, messages }: { contacts: any[]; showings: any[]; messages: any[] }) {
  const rows = useMemo(() => {
    const agents = new Set<string>();
    contacts.forEach(c => { if (c.assigned_to) agents.add(c.assigned_to); });

    return Array.from(agents).map(agent => {
      const assigned = contacts.filter(c => c.assigned_to === agent);
      const emailsSent = messages.filter(m => m.sent_by === agent && m.direction === 'outbound').length;
      const showingsBooked = showings.filter(s => s.assigned_agent === agent).length;
      const closed = assigned.filter(c => c.status === 'Closed').length;
      const rate = assigned.length > 0 ? ((closed / assigned.length) * 100).toFixed(1) : '0';
      return { agent, leads: assigned.length, emailsSent, showingsBooked, closed, rate };
    }).sort((a, b) => b.leads - a.leads);
  }, [contacts, showings, messages]);

  return (
    <Card>
      <CardContent className="pt-6 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Emails Sent</TableHead>
              <TableHead className="text-right">Showings</TableHead>
              <TableHead className="text-right">Closed</TableHead>
              <TableHead className="text-right">Conversion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No agent data yet</TableCell></TableRow>
            )}
            {rows.map(r => (
              <TableRow key={r.agent}>
                <TableCell className="font-medium">{r.agent}</TableCell>
                <TableCell className="text-right">{r.leads}</TableCell>
                <TableCell className="text-right">{r.emailsSent}</TableCell>
                <TableCell className="text-right">{r.showingsBooked}</TableCell>
                <TableCell className="text-right">{r.closed}</TableCell>
                <TableCell className="text-right font-semibold text-primary">{r.rate}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ── Funnel ── */
function FunnelTab({ contacts }: { contacts: any[] }) {
  const stageCounts = useMemo(() => {
    const map: Record<string, number> = {};
    FUNNEL_STAGES.forEach(s => (map[s] = 0));
    contacts.forEach(c => {
      const idx = FUNNEL_STAGES.indexOf(c.status as any);
      if (idx >= 0) {
        // Count leads at or past this stage
        for (let i = 0; i <= idx; i++) map[FUNNEL_STAGES[i]]++;
      }
    });
    return map;
  }, [contacts]);

  // Avg days in stage (approx using status_changed_at vs created_at)
  const avgDays = useMemo(() => {
    const stageDays: Record<string, number[]> = {};
    FUNNEL_STAGES.forEach(s => (stageDays[s] = []));
    contacts.forEach(c => {
      if (!c.status || !c.created_at) return;
      const created = new Date(c.created_at);
      const changed = c.status_changed_at ? new Date(c.status_changed_at) : new Date();
      const days = Math.max(0, differenceInDays(changed, created));
      if (c.status in stageDays) stageDays[c.status].push(days);
    });
    return FUNNEL_STAGES.map(s => {
      const arr = stageDays[s];
      const avg = arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '—';
      return { stage: s, avg };
    });
  }, [contacts]);

  const maxCount = Math.max(...Object.values(stageCounts), 1);

  return (
    <div className="space-y-6">
      {/* Funnel */}
      <Card>
        <CardHeader><CardTitle className="text-base">Lead Funnel</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {FUNNEL_STAGES.map((stage, i) => {
            const count = stageCounts[stage];
            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const prev = i > 0 ? stageCounts[FUNNEL_STAGES[i - 1]] : null;
            const convRate = prev && prev > 0 ? ((count / prev) * 100).toFixed(0) : null;

            return (
              <div key={stage}>
                {i > 0 && convRate && (
                  <div className="text-xs text-muted-foreground text-center py-0.5">↓ {convRate}%</div>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-sm w-32 shrink-0 text-right text-muted-foreground">{stage}</span>
                  <div className="flex-1 h-9 bg-muted/40 rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-primary/80 rounded-md transition-all duration-500"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground">
                      {count}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Avg days table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Average Days in Stage</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Avg. Days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {avgDays.map(r => (
                <TableRow key={r.stage}>
                  <TableCell>{r.stage}</TableCell>
                  <TableCell className="text-right font-medium">{r.avg}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
