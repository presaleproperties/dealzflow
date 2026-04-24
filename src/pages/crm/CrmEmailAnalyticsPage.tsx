import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BarChart3, Eye, MousePointerClick, Send, RefreshCw, Mail, AlertTriangle, TrendingUp, Megaphone } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Row {
  id: string;
  email_to: string;
  subject: string;
  status: string;
  sent_at: string;
  template_type: string | null;
  template_id: string | null;
  campaign_id: string | null;
  open_count: number;
  click_count: number;
  opened_at: string | null;
  clicked_at: string | null;
  tracking_id: string | null;
  error_message: string | null;
}

interface Campaign {
  id: string;
  subject: string;
  status: string;
  sent_at: string | null;
}

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const BOUNCE_STATUSES = new Set(["bounced", "bounce", "hard_bounce", "soft_bounce"]);
const FAIL_STATUSES = new Set(["failed", "dlq", "error"]);

export default function CrmEmailAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const since = subDays(new Date(), days).toISOString();
    const [logRes, campRes] = await Promise.all([
      supabase
        .from("crm_email_send_log")
        .select("id, email_to, subject, status, sent_at, template_type, template_id, campaign_id, open_count, click_count, opened_at, clicked_at, tracking_id, error_message")
        .gte("sent_at", since)
        .order("sent_at", { ascending: false })
        .limit(5000),
      supabase
        .from("crm_email_campaigns")
        .select("id, subject, status, sent_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (logRes.error) { console.error(logRes.error); setRows([]); }
    else {
      const map = new Map<string, Row>();
      for (const r of (logRes.data ?? []) as Row[]) {
        const key = r.tracking_id ?? r.id;
        const existing = map.get(key);
        if (!existing || new Date(r.sent_at) > new Date(existing.sent_at)) map.set(key, r);
      }
      setRows(Array.from(map.values()));
    }
    setCampaigns((campRes.data ?? []) as Campaign[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [days]);

  const filteredRows = useMemo(() => {
    if (campaignFilter === "all") return rows;
    if (campaignFilter === "none") return rows.filter(r => !r.campaign_id);
    return rows.filter(r => r.campaign_id === campaignFilter);
  }, [rows, campaignFilter]);

  const stats = useMemo(() => {
    const total = filteredRows.length;
    const sent = filteredRows.filter(r => r.status === "sent").length;
    const failed = filteredRows.filter(r => FAIL_STATUSES.has(r.status)).length;
    const bounced = filteredRows.filter(r => BOUNCE_STATUSES.has(r.status)).length;
    const opened = filteredRows.filter(r => r.opened_at).length;
    const clicked = filteredRows.filter(r => r.clicked_at).length;
    const delivered = sent; // Treat 'sent' as delivered (Presale proxy confirms delivery)
    return {
      total, sent, failed, bounced, opened, clicked, delivered,
      openRate: delivered ? Math.round((opened / delivered) * 1000) / 10 : 0,
      clickRate: delivered ? Math.round((clicked / delivered) * 1000) / 10 : 0,
      bounceRate: total ? Math.round((bounced / total) * 1000) / 10 : 0,
      errorRate: total ? Math.round(((failed + bounced) / total) * 1000) / 10 : 0,
      ctor: opened ? Math.round((clicked / opened) * 1000) / 10 : 0,
    };
  }, [filteredRows]);

  const timeline = useMemo(() => {
    const buckets = new Map<string, { date: string; sent: number; opened: number; clicked: number; bounced: number; failed: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "MMM d");
      buckets.set(d, { date: d, sent: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 });
    }
    for (const r of filteredRows) {
      const d = format(startOfDay(new Date(r.sent_at)), "MMM d");
      const b = buckets.get(d);
      if (!b) continue;
      if (r.status === "sent") b.sent += 1;
      if (BOUNCE_STATUSES.has(r.status)) b.bounced += 1;
      if (FAIL_STATUSES.has(r.status)) b.failed += 1;
      if (r.opened_at) b.opened += 1;
      if (r.clicked_at) b.clicked += 1;
    }
    return Array.from(buckets.values());
  }, [filteredRows, days]);

  const errorRateTimeline = useMemo(() => {
    return timeline.map(t => {
      const total = t.sent + t.bounced + t.failed;
      return {
        date: t.date,
        bounceRate: total ? Math.round((t.bounced / total) * 1000) / 10 : 0,
        errorRate: total ? Math.round((t.failed / total) * 1000) / 10 : 0,
      };
    });
  }, [timeline]);

  const byCampaign = useMemo(() => {
    const map = new Map<string, { id: string; subject: string; sent: number; opened: number; clicked: number; bounced: number; failed: number }>();
    const campaignMap = new Map(campaigns.map(c => [c.id, c]));
    for (const r of rows) {
      if (!r.campaign_id) continue;
      const c = campaignMap.get(r.campaign_id);
      const subject = c?.subject ?? r.subject ?? "(unknown)";
      const e = map.get(r.campaign_id) ?? { id: r.campaign_id, subject, sent: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 };
      if (r.status === "sent") e.sent += 1;
      if (BOUNCE_STATUSES.has(r.status)) e.bounced += 1;
      if (FAIL_STATUSES.has(r.status)) e.failed += 1;
      if (r.opened_at) e.opened += 1;
      if (r.clicked_at) e.clicked += 1;
      map.set(r.campaign_id, e);
    }
    return Array.from(map.values())
      .map(c => ({
        ...c,
        openRate: c.sent ? Math.round((c.opened / c.sent) * 1000) / 10 : 0,
        clickRate: c.sent ? Math.round((c.clicked / c.sent) * 1000) / 10 : 0,
        bounceRate: (c.sent + c.bounced + c.failed) ? Math.round((c.bounced / (c.sent + c.bounced + c.failed)) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.sent - a.sent);
  }, [rows, campaigns]);

  const byTemplate = useMemo(() => {
    const map = new Map<string, { name: string; sent: number; opened: number; clicked: number }>();
    for (const r of filteredRows) {
      const key = r.template_type || "ad-hoc";
      const e = map.get(key) ?? { name: key, sent: 0, opened: 0, clicked: 0 };
      if (r.status === "sent") e.sent += 1;
      if (r.opened_at) e.opened += 1;
      if (r.clicked_at) e.clicked += 1;
      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) => b.sent - a.sent).slice(0, 8);
  }, [filteredRows]);

  const topErrors = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredRows) {
      if (!r.error_message) continue;
      const key = r.error_message.slice(0, 120);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filteredRows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Email Analytics</h2>
          <p className="text-xs text-muted-foreground">Opens, clicks, bounces &amp; per-campaign performance — deduped by tracking ID.</p>
        </div>
        <div className="flex gap-1 items-center">
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sends</SelectItem>
              <SelectItem value="none">Ad-hoc only</SelectItem>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.subject.slice(0, 40)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {RANGES.map(r => (
            <Button key={r.label} size="sm" variant={days === r.days ? "default" : "outline"} onClick={() => setDays(r.days)}>{r.label}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={refresh}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat icon={<Send className="h-3.5 w-3.5" />} label="Delivered" value={stats.delivered} sub={`of ${stats.total} sends`} />
        <Stat icon={<Eye className="h-3.5 w-3.5" />} label="Open rate" value={`${stats.openRate}%`} sub={`${stats.opened} opens`} />
        <Stat icon={<MousePointerClick className="h-3.5 w-3.5" />} label="Click rate" value={`${stats.clickRate}%`} sub={`${stats.clicked} clicks`} />
        <Stat icon={<Mail className="h-3.5 w-3.5" />} label="CTOR" value={`${stats.ctor}%`} sub="clicks ÷ opens" />
        <Stat icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Bounce rate" value={`${stats.bounceRate}%`} sub={`${stats.bounced} bounced`} tone={stats.bounceRate > 2 ? "warn" : undefined} />
        <Stat icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Error rate" value={`${stats.errorRate}%`} sub={`${stats.failed} failed`} tone={stats.errorRate > 5 ? "warn" : undefined} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Engagement over time</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : (
              <ChartContainer config={{
                sent:    { label: "Sent",    color: "hsl(var(--primary))" },
                opened:  { label: "Opened",  color: "hsl(var(--accent))" },
                clicked: { label: "Clicked", color: "hsl(142 71% 45%)" },
              }} className="h-[260px] w-full">
                <ResponsiveContainer>
                  <LineChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="sent" stroke="var(--color-sent)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="opened" stroke="var(--color-opened)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="clicked" stroke="var(--color-clicked)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Bounce &amp; error rate trend</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{
              bounceRate: { label: "Bounce %", color: "hsl(38 92% 50%)" },
              errorRate:  { label: "Error %",  color: "hsl(0 72% 51%)" },
            }} className="h-[260px] w-full">
              <ResponsiveContainer>
                <AreaChart data={errorRateTimeline}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="bounceRate" stroke="var(--color-bounceRate)" fill="var(--color-bounceRate)" fillOpacity={0.2} strokeWidth={2} />
                  <Area type="monotone" dataKey="errorRate" stroke="var(--color-errorRate)" fill="var(--color-errorRate)" fillOpacity={0.2} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Megaphone className="h-4 w-4" /> Per-campaign performance</CardTitle></CardHeader>
        <CardContent>
          {byCampaign.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No campaign sends in this range.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Opens</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Open %</TableHead>
                  <TableHead className="text-right">Click %</TableHead>
                  <TableHead className="text-right">Bounce %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCampaign.map(c => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setCampaignFilter(c.id)}>
                    <TableCell className="font-medium text-xs max-w-[280px] truncate">{c.subject}</TableCell>
                    <TableCell className="text-right text-xs">{c.sent}</TableCell>
                    <TableCell className="text-right text-xs">{c.opened}</TableCell>
                    <TableCell className="text-right text-xs">{c.clicked}</TableCell>
                    <TableCell className="text-right text-xs">{c.openRate}%</TableCell>
                    <TableCell className="text-right text-xs">{c.clickRate}%</TableCell>
                    <TableCell className="text-right text-xs">
                      <Badge variant={c.bounceRate > 2 ? "destructive" : "secondary"} className="text-[10px]">{c.bounceRate}%</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">By template type</CardTitle></CardHeader>
          <CardContent>
            {byTemplate.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No data yet.</p>
            ) : (
              <ChartContainer config={{
                sent: { label: "Sent", color: "hsl(var(--primary))" },
                opened: { label: "Opened", color: "hsl(var(--accent))" },
                clicked: { label: "Clicked", color: "hsl(142 71% 45%)" },
              }} className="h-[240px] w-full">
                <ResponsiveContainer>
                  <BarChart data={byTemplate}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="sent" fill="var(--color-sent)" />
                    <Bar dataKey="opened" fill="var(--color-opened)" />
                    <Bar dataKey="clicked" fill="var(--color-clicked)" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Top error reasons</CardTitle></CardHeader>
          <CardContent>
            {topErrors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No errors recorded — nice work.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Error message</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topErrors.map(([msg, count]) => (
                    <TableRow key={msg}>
                      <TableCell className="text-xs font-mono">{msg}</TableCell>
                      <TableCell className="text-right text-xs">{count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; tone?: "warn" }) {
  return (
    <Card className={tone === "warn" ? "border-destructive/40" : ""}>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
        <div className={`text-xl font-semibold mt-1 ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
