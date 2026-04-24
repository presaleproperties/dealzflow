import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, Eye, MousePointerClick, Send, RefreshCw, Mail } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
}

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export default function CrmEmailAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const since = subDays(new Date(), days).toISOString();
    const { data, error } = await supabase
      .from("crm_email_send_log")
      .select("id, email_to, subject, status, sent_at, template_type, template_id, campaign_id, open_count, click_count, opened_at, clicked_at, tracking_id")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(5000);
    if (error) { console.error(error); setRows([]); }
    else {
      // Dedupe by tracking_id (latest row wins) per email-send guidelines
      const map = new Map<string, Row>();
      for (const r of (data ?? []) as Row[]) {
        const key = r.tracking_id ?? r.id;
        const existing = map.get(key);
        if (!existing || new Date(r.sent_at) > new Date(existing.sent_at)) map.set(key, r);
      }
      setRows(Array.from(map.values()));
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [days]);

  const stats = useMemo(() => {
    const sent = rows.filter(r => r.status === "sent").length;
    const failed = rows.filter(r => r.status === "failed").length;
    const opened = rows.filter(r => r.opened_at).length;
    const clicked = rows.filter(r => r.clicked_at).length;
    return {
      sent, failed, opened, clicked,
      openRate: sent ? Math.round((opened / sent) * 100) : 0,
      clickRate: sent ? Math.round((clicked / sent) * 100) : 0,
      ctor: opened ? Math.round((clicked / opened) * 100) : 0,
    };
  }, [rows]);

  const timeline = useMemo(() => {
    const buckets = new Map<string, { date: string; sent: number; opened: number; clicked: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "MMM d");
      buckets.set(d, { date: d, sent: 0, opened: 0, clicked: 0 });
    }
    for (const r of rows) {
      const d = format(startOfDay(new Date(r.sent_at)), "MMM d");
      const b = buckets.get(d);
      if (!b) continue;
      if (r.status === "sent") b.sent += 1;
      if (r.opened_at) b.opened += 1;
      if (r.clicked_at) b.clicked += 1;
    }
    return Array.from(buckets.values());
  }, [rows, days]);

  const byTemplate = useMemo(() => {
    const map = new Map<string, { name: string; sent: number; opened: number; clicked: number }>();
    for (const r of rows) {
      const key = r.template_type || "ad-hoc";
      const e = map.get(key) ?? { name: key, sent: 0, opened: 0, clicked: 0 };
      if (r.status === "sent") e.sent += 1;
      if (r.opened_at) e.opened += 1;
      if (r.clicked_at) e.clicked += 1;
      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) => b.sent - a.sent).slice(0, 8);
  }, [rows]);

  const topRecipients = useMemo(() => {
    const map = new Map<string, { email: string; opens: number; clicks: number; sent: number }>();
    for (const r of rows) {
      const e = map.get(r.email_to) ?? { email: r.email_to, opens: 0, clicks: 0, sent: 0 };
      e.sent += r.status === "sent" ? 1 : 0;
      e.opens += r.open_count ?? 0;
      e.clicks += r.click_count ?? 0;
      map.set(r.email_to, e);
    }
    return Array.from(map.values()).sort((a, b) => (b.opens + b.clicks * 2) - (a.opens + a.clicks * 2)).slice(0, 10);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Email Analytics</h2>
          <p className="text-xs text-muted-foreground">Deduped by tracking ID — latest status per email.</p>
        </div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <Button key={r.label} size="sm" variant={days === r.days ? "default" : "outline"} onClick={() => setDays(r.days)}>{r.label}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={refresh}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat icon={<Send className="h-3.5 w-3.5" />} label="Sent" value={stats.sent} sub={`${stats.failed} failed`} />
        <Stat icon={<Eye className="h-3.5 w-3.5" />} label="Open rate" value={`${stats.openRate}%`} sub={`${stats.opened} opens`} />
        <Stat icon={<MousePointerClick className="h-3.5 w-3.5" />} label="Click rate" value={`${stats.clickRate}%`} sub={`${stats.clicked} clicks`} />
        <Stat icon={<Mail className="h-3.5 w-3.5" />} label="CTOR" value={`${stats.ctor}%`} sub="clicks ÷ opens" />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Activity over time</CardTitle></CardHeader>
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
          <CardHeader className="pb-2"><CardTitle className="text-sm">Most engaged recipients</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Opens</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topRecipients.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">No engagement yet.</TableCell></TableRow>
                ) : topRecipients.map(r => (
                  <TableRow key={r.email}>
                    <TableCell className="font-medium text-xs">{r.email}</TableCell>
                    <TableCell className="text-right">{r.sent}</TableCell>
                    <TableCell className="text-right">{r.opens}</TableCell>
                    <TableCell className="text-right">{r.clicks}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
