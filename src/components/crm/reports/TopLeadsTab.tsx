import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pill } from '@/components/crm/shared/Pill';
import { Flame, Download, Search, ArrowUpRight, MailOpen, MousePointerClick, MessageSquare, Reply } from 'lucide-react';
import { format, subDays, parseISO, differenceInHours } from 'date-fns';
import { toast } from 'sonner';

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
];

type ChannelFilter = 'all' | 'one_to_one' | 'mass' | 'sms';

// Score weights — opens are light, clicks/replies/inbound are heavy
const W = {
  oneToOneOpen: 1,
  oneToOneClick: 5,
  oneToOneReply: 10,
  massOpen: 1,
  massClick: 5,
  smsInbound: 8,
};

type Row = {
  contact_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  assigned_to: string | null;
  score: number;
  oneToOneSent: number;
  oneToOneOpens: number;
  oneToOneClicks: number;
  oneToOneReplies: number;
  massSent: number;
  massOpens: number;
  massClicks: number;
  smsOut: number;
  smsIn: number;
  lastEngagedAt: string | null;
};

type SortKey = 'score' | 'lastEngagedAt' | 'oneToOneOpens' | 'massOpens' | 'oneToOneClicks' | 'massClicks' | 'smsIn';

async function fetchAll<T>(table: string, select: string, since: string, dateCol = 'sent_at'): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let from = 0;
  let more = true;
  while (more) {
    const { data, error } = await supabase
      .from(table as any)
      .select(select)
      .gte(dateCol, since)
      .order(dateCol, { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    all = all.concat(batch);
    more = batch.length === PAGE;
    from += PAGE;
  }
  return all;
}

export function TopLeadsTab() {
  const [days, setDays] = useState(30);
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [minScore, setMinScore] = useState(0);

  const since = useMemo(() => subDays(new Date(), days).toISOString(), [days]);

  const { data: oneToOne = [] } = useQuery({
    queryKey: ['top-leads-1to1', days],
    queryFn: () => fetchAll<any>(
      'crm_email_log',
      'contact_id,direction,open_count,click_count,opened_at,clicked_at,sent_at,in_reply_to',
      since,
    ),
  });

  const { data: mass = [] } = useQuery({
    queryKey: ['top-leads-mass', days],
    queryFn: () => fetchAll<any>(
      'crm_email_send_log',
      'contact_id,open_count,click_count,opened_at,clicked_at,sent_at,status',
      since,
    ),
  });

  const { data: sms = [] } = useQuery({
    queryKey: ['top-leads-sms', days],
    queryFn: () => fetchAll<any>(
      'crm_sms_log',
      'contact_id,direction,sent_at,delivered_at',
      since,
    ),
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['top-leads-contacts'],
    queryFn: async () => {
      const PAGE = 1000;
      let all: any[] = [];
      let from = 0;
      let more = true;
      while (more) {
        const { data, error } = await supabase
          .from('crm_contacts')
          .select('id,first_name,last_name,email,phone,status,assigned_to')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data ?? [];
        all = all.concat(batch);
        more = batch.length === PAGE;
        from += PAGE;
      }
      return all;
    },
  });

  const contactMap = useMemo(() => {
    const m: Record<string, any> = {};
    contacts.forEach(c => { m[c.id] = c; });
    return m;
  }, [contacts]);

  const rows = useMemo<Row[]>(() => {
    const agg: Record<string, Row> = {};

    const ensure = (id: string): Row => {
      if (!agg[id]) {
        const c = contactMap[id];
        agg[id] = {
          contact_id: id,
          name: c ? [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || '(no name)' : '(unknown)',
          email: c?.email ?? null,
          phone: c?.phone ?? null,
          status: c?.status ?? null,
          assigned_to: c?.assigned_to ?? null,
          score: 0,
          oneToOneSent: 0, oneToOneOpens: 0, oneToOneClicks: 0, oneToOneReplies: 0,
          massSent: 0, massOpens: 0, massClicks: 0,
          smsOut: 0, smsIn: 0,
          lastEngagedAt: null,
        };
      }
      return agg[id];
    };

    const touchEngaged = (r: Row, ts?: string | null) => {
      if (!ts) return;
      if (!r.lastEngagedAt || ts > r.lastEngagedAt) r.lastEngagedAt = ts;
    };

    // 1:1 emails — outbound = sent, inbound = reply
    oneToOne.forEach((e: any) => {
      if (!e.contact_id) return;
      const r = ensure(e.contact_id);
      if (e.direction === 'inbound') {
        r.oneToOneReplies++;
        r.score += W.oneToOneReply;
        touchEngaged(r, e.sent_at);
      } else {
        r.oneToOneSent++;
        const oc = e.open_count ?? 0;
        const cc = e.click_count ?? 0;
        if (oc > 0) { r.oneToOneOpens += oc; r.score += W.oneToOneOpen * oc; touchEngaged(r, e.opened_at); }
        if (cc > 0) { r.oneToOneClicks += cc; r.score += W.oneToOneClick * cc; touchEngaged(r, e.clicked_at); }
      }
    });

    // Mass campaign sends
    mass.forEach((e: any) => {
      if (!e.contact_id) return;
      const r = ensure(e.contact_id);
      r.massSent++;
      const oc = e.open_count ?? 0;
      const cc = e.click_count ?? 0;
      if (oc > 0) { r.massOpens += oc; r.score += W.massOpen * oc; touchEngaged(r, e.opened_at); }
      if (cc > 0) { r.massClicks += cc; r.score += W.massClick * cc; touchEngaged(r, e.clicked_at); }
    });

    // SMS
    sms.forEach((s: any) => {
      if (!s.contact_id) return;
      const r = ensure(s.contact_id);
      if (s.direction === 'inbound') {
        r.smsIn++;
        r.score += W.smsInbound;
        touchEngaged(r, s.sent_at);
      } else {
        r.smsOut++;
      }
    });

    // Recency boost: +50% if engaged in last 7d, +25% if last 30d
    const now = new Date();
    Object.values(agg).forEach(r => {
      if (r.lastEngagedAt) {
        const hrs = differenceInHours(now, parseISO(r.lastEngagedAt));
        if (hrs <= 24 * 7) r.score *= 1.5;
        else if (hrs <= 24 * 30) r.score *= 1.25;
      }
      r.score = Math.round(r.score);
    });

    let list = Object.values(agg);

    // Channel filter — keep contacts with at least one signal in that channel
    if (channel === 'one_to_one') list = list.filter(r => r.oneToOneOpens + r.oneToOneClicks + r.oneToOneReplies > 0);
    else if (channel === 'mass') list = list.filter(r => r.massOpens + r.massClicks > 0);
    else if (channel === 'sms') list = list.filter(r => r.smsIn > 0);
    else list = list.filter(r => r.score > 0);

    if (minScore > 0) list = list.filter(r => r.score >= minScore);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      if (sortKey === 'lastEngagedAt') return (b.lastEngagedAt ?? '').localeCompare(a.lastEngagedAt ?? '');
      return (b as any)[sortKey] - (a as any)[sortKey];
    });

    return list;
  }, [oneToOne, mass, sms, contactMap, channel, search, sortKey, minScore]);

  const topN = rows.slice(0, 200);

  const exportCsv = () => {
    const header = ['Rank', 'Name', 'Email', 'Phone', 'Status', 'Score', '1:1 Opens', '1:1 Clicks', 'Replies', 'Mass Opens', 'Mass Clicks', 'SMS In', 'Last Engaged'];
    const lines = [header.join(',')];
    rows.forEach((r, i) => {
      const cells = [
        i + 1,
        `"${r.name.replace(/"/g, '""')}"`,
        r.email ?? '',
        r.phone ?? '',
        r.status ?? '',
        r.score,
        r.oneToOneOpens,
        r.oneToOneClicks,
        r.oneToOneReplies,
        r.massOpens,
        r.massClicks,
        r.smsIn,
        r.lastEngagedAt ?? '',
      ];
      lines.push(cells.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `top-leads-${days}d-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} leads`);
  };

  // KPI summary
  const totalEngaged = rows.length;
  const hot = rows.filter(r => r.score >= 20).length;
  const repliers = rows.filter(r => r.oneToOneReplies > 0 || r.smsIn > 0).length;
  const massClickers = rows.filter(r => r.massClicks > 0).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <TabsList>
              {RANGES.map(r => (
                <TabsTrigger key={r.days} value={String(r.days)} className="text-xs">{r.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs value={channel} onValueChange={(v) => setChannel(v as ChannelFilter)}>
            <TabsList>
              <TabsTrigger value="all" className="text-xs">All channels</TabsTrigger>
              <TabsTrigger value="one_to_one" className="text-xs">1:1 email</TabsTrigger>
              <TabsTrigger value="mass" className="text-xs">Mass</TabsTrigger>
              <TabsTrigger value="sms" className="text-xs">SMS</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-9 w-44 pl-8 text-sm"
            />
          </div>
          <Input
            type="number"
            value={minScore || ''}
            onChange={(e) => setMinScore(Number(e.target.value) || 0)}
            placeholder="Min score"
            className="h-9 w-24 text-sm"
          />
          <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Engaged leads', value: totalEngaged.toLocaleString(), icon: Flame, color: 'hsl(var(--primary))' },
          { label: 'Hot (score ≥ 20)', value: hot.toLocaleString(), icon: Flame, color: 'hsl(0 72% 51%)' },
          { label: 'Repliers', value: repliers.toLocaleString(), icon: Reply, color: 'hsl(142 71% 45%)' },
          { label: 'Mass clickers', value: massClickers.toLocaleString(), icon: MousePointerClick, color: 'hsl(38 92% 50%)' },
        ].map(k => (
          <Card key={k.label} className="rounded-xl">
            <CardContent className="pt-4 px-3 sm:px-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${k.color}1a` }}>
                <k.icon className="h-4 w-4" style={{ color: k.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{k.label}</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground leading-tight">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leaderboard */}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            Top Engaged Leads
            <span className="text-xs font-normal text-muted-foreground">— showing {topN.length} of {rows.length}</span>
          </CardTitle>
          <Tabs value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <TabsList>
              <TabsTrigger value="score" className="text-[11px]">Score</TabsTrigger>
              <TabsTrigger value="lastEngagedAt" className="text-[11px]">Recent</TabsTrigger>
              <TabsTrigger value="oneToOneClicks" className="text-[11px]">1:1 clicks</TabsTrigger>
              <TabsTrigger value="massClicks" className="text-[11px]">Mass clicks</TabsTrigger>
              <TabsTrigger value="smsIn" className="text-[11px]">SMS in</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="overflow-x-auto px-2 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-center" title="1:1 opens / clicks / replies">
                  <span className="inline-flex items-center gap-1 text-[11px]"><MailOpen className="h-3 w-3" /> 1:1</span>
                </TableHead>
                <TableHead className="text-center" title="Mass opens / clicks">
                  <span className="inline-flex items-center gap-1 text-[11px]"><MousePointerClick className="h-3 w-3" /> Mass</span>
                </TableHead>
                <TableHead className="text-center" title="SMS inbound / outbound">
                  <span className="inline-flex items-center gap-1 text-[11px]"><MessageSquare className="h-3 w-3" /> SMS</span>
                </TableHead>
                <TableHead className="text-right">Last engaged</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topN.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                    No engaged leads in this range. Try widening the time window.
                  </TableCell>
                </TableRow>
              ) : topN.map((r, i) => (
                <TableRow key={r.contact_id} className="group">
                  <TableCell className="text-center text-xs text-muted-foreground font-mono">{i + 1}</TableCell>
                  <TableCell>
                    <Link to={`/crm/leads/${r.contact_id}`} className="block group/link">
                      <p className="font-medium text-foreground group-hover/link:text-primary transition-colors truncate max-w-[240px]">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">{r.email || r.phone || '—'}</p>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1 font-bold text-primary tabular-nums">
                      {r.score >= 20 && <Flame className="h-3.5 w-3.5" />}
                      {r.score}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-xs tabular-nums">
                    <span className="text-foreground">{r.oneToOneOpens}</span>
                    <span className="text-muted-foreground"> / </span>
                    <span className="text-foreground font-semibold">{r.oneToOneClicks}</span>
                    {r.oneToOneReplies > 0 && (
                      <span className="ml-1 text-emerald-600 dark:text-emerald-400 font-semibold">↩{r.oneToOneReplies}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-xs tabular-nums">
                    <span className="text-foreground">{r.massOpens}</span>
                    <span className="text-muted-foreground"> / </span>
                    <span className="text-foreground font-semibold">{r.massClicks}</span>
                  </TableCell>
                  <TableCell className="text-center text-xs tabular-nums">
                    {r.smsIn > 0 ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">↩{r.smsIn}</span> : <span className="text-muted-foreground">—</span>}
                    <span className="text-muted-foreground"> / {r.smsOut}</span>
                  </TableCell>
                  <TableCell className="text-right text-[11px] text-muted-foreground whitespace-nowrap">
                    {r.lastEngagedAt ? format(parseISO(r.lastEngagedAt), 'MMM d, HH:mm') : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status ? <Pill tone="neutral" size="sm">{r.status}</Pill> : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell>
                    <Link to={`/crm/leads/${r.contact_id}`} className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground hover:text-primary" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Scoring legend */}
      <p className="text-[11px] text-muted-foreground text-center">
        Score = opens (×{W.oneToOneOpen}) + clicks (×{W.oneToOneClick}) + email replies (×{W.oneToOneReply}) + SMS replies (×{W.smsInbound}). Recency boost: +50% if engaged in last 7 days, +25% in last 30 days.
      </p>
    </div>
  );
}
