import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Users, CalendarDays, Target, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useCrmContacts, LEAD_STATUSES } from '@/hooks/useCrmContacts';
import { useContactsByPipeline } from '@/hooks/useContactsByPipeline';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, parseISO, startOfMonth, differenceInDays } from 'date-fns';
import { useCrmAccess } from '@/contexts/CrmAccessContext';
import { EmailReportTab } from '@/components/crm/reports/EmailReportTab';
import { SmsReportTab } from '@/components/crm/reports/SmsReportTab';
import { TopLeadsTab } from '@/components/crm/reports/TopLeadsTab';
import { contactMatchesSegment } from '@/lib/segmentMatching';

export default function CrmReportsPage() {
  const { role, isLoading: accessLoading } = useCrmAccess();
  const { data: contacts = [] } = useCrmContacts();

  const { data: showings = [] } = useQuery({
    queryKey: ['crm-reports-showings'],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: batch } = await supabase.from('crm_showings').select('*').range(from, from + PAGE_SIZE - 1);
        if (batch && batch.length > 0) { all = all.concat(batch); from += PAGE_SIZE; hasMore = batch.length === PAGE_SIZE; } else { hasMore = false; }
      }
      return all;
    },
  });

  const { data: emails = [] } = useQuery({
    queryKey: ['crm-reports-emails-by-agent'],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let all: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: batch } = await supabase
          .from('crm_email_log')
          .select('user_id, direction')
          .eq('direction', 'outbound')
          .range(from, from + PAGE_SIZE - 1);
        if (batch && batch.length > 0) { all = all.concat(batch); from += PAGE_SIZE; hasMore = batch.length === PAGE_SIZE; } else { hasMore = false; }
      }
      return all;
    },
  });

  // Owner-only — team members are redirected to the leads list
  if (!accessLoading && role !== 'owner') {
    return <Navigate to="/crm/leads" replace />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground">Reports</h1>
      <Tabs defaultValue="top-leads">
        <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:grid-cols-5 sm:flex">
          <TabsTrigger value="top-leads" className="text-[12px] sm:text-sm min-h-[44px] sm:min-h-0">🔥 Top Leads</TabsTrigger>
          <TabsTrigger value="email" className="text-[12px] sm:text-sm min-h-[44px] sm:min-h-0">Email</TabsTrigger>
          <TabsTrigger value="sms" className="text-[12px] sm:text-sm min-h-[44px] sm:min-h-0">SMS</TabsTrigger>
          <TabsTrigger value="agents" className="text-[12px] sm:text-sm min-h-[44px] sm:min-h-0">Agents</TabsTrigger>
          <TabsTrigger value="funnel" className="text-[12px] sm:text-sm min-h-[44px] sm:min-h-0">Funnel</TabsTrigger>
        </TabsList>

        <TabsContent value="top-leads">
          <TopLeadsTab />
        </TabsContent>
        <TabsContent value="email">
          <EmailReportTab />
        </TabsContent>
        <TabsContent value="sms">
          <SmsReportTab />
        </TabsContent>
        <TabsContent value="agents">
          <AgentPerformanceTab contacts={contacts} showings={showings} emails={emails} />
        </TabsContent>
        <TabsContent value="funnel">
          <FunnelTab contacts={contacts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Agent Performance ── */
function AgentPerformanceTab({ contacts, showings, emails }: { contacts: any[]; showings: any[]; emails: any[] }) {
  const rows = useMemo(() => {
    const agents = new Set<string>();
    contacts.forEach(c => { if (c.assigned_to) agents.add(c.assigned_to); });

    return Array.from(agents).map(agent => {
      const assigned = contacts.filter(c => c.assigned_to === agent);
      const emailsSent = emails.filter(m => m.user_id === agent).length;
      const showingsBooked = showings.filter(s => s.assigned_agent === agent).length;
      const closed = assigned.filter(c => c.status === 'Closed').length;
      const rate = assigned.length > 0 ? ((closed / assigned.length) * 100).toFixed(1) : '0';
      return { agent, leads: assigned.length, emailsSent, showingsBooked, closed, rate };
    }).sort((a, b) => b.leads - a.leads);
  }, [contacts, showings, emails]);

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardContent className="pt-4 sm:pt-6 overflow-auto px-2 sm:px-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10 min-w-[120px]">Agent</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Emails</TableHead>
                <TableHead className="text-right">Showings</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">No agent data yet</TableCell></TableRow>
              )}
              {rows.map(r => (
                <TableRow key={r.agent}>
                  <TableCell className="font-medium sticky left-0 bg-card z-10">{r.agent}</TableCell>
                  <TableCell className="text-right">{r.leads}</TableCell>
                  <TableCell className="text-right hidden sm:table-cell">{r.emailsSent}</TableCell>
                  <TableCell className="text-right">{r.showingsBooked}</TableCell>
                  <TableCell className="text-right">{r.closed}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{r.rate}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
        for (let i = 0; i <= idx; i++) map[FUNNEL_STAGES[i]]++;
      }
    });
    return map;
  }, [contacts]);

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
    <div className="space-y-4 sm:space-y-6">
      {/* Funnel */}
      <Card className="rounded-[10px] lg:rounded-xl">
        <CardHeader className="px-3 sm:px-6"><CardTitle className="text-base">Lead Funnel</CardTitle></CardHeader>
        <CardContent className="space-y-2 px-3 sm:px-6">
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
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-[11px] sm:text-sm w-24 sm:w-32 shrink-0 text-right text-muted-foreground truncate">{stage}</span>
                  <div className="flex-1 h-8 sm:h-9 bg-muted/40 rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-primary/80 rounded-md transition-all duration-500"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm font-semibold text-foreground">
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
      <Card className="rounded-[10px] lg:rounded-xl">
        <CardHeader className="px-3 sm:px-6"><CardTitle className="text-base">Average Days in Stage</CardTitle></CardHeader>
        <CardContent className="px-2 sm:px-6">
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
                  <TableCell className="text-sm">{r.stage}</TableCell>
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
