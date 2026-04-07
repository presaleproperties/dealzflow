import { useMemo } from 'react';
import { Mail, Eye, MousePointerClick } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, subDays, isAfter, parseISO } from 'date-fns';
import { useCrmCampaigns } from '@/hooks/useCrmEmail';
import { useCrmContacts } from '@/hooks/useCrmContacts';

export function AnalyticsTab() {
  const { data: campaigns = [] } = useCrmCampaigns();

  const sentCampaigns = useMemo(
    () => campaigns.filter(c => c.status === 'sent' && c.sent_at && isAfter(new Date(c.sent_at), subDays(new Date(), 30))),
    [campaigns]
  );

  const totalSent = sentCampaigns.reduce((s, c) => s + (c.recipients_count ?? 0), 0);
  const totalOpens = sentCampaigns.reduce((s, c) => s + (c.opens ?? 0), 0);
  const totalClicks = sentCampaigns.reduce((s, c) => s + (c.clicks ?? 0), 0);
  const openRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : '0';
  const clickRate = totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(1) : '0';

  // Opens over time (last 30 days)
  const opensOverTime = useMemo(() => {
    const days: { date: string; opens: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayOpens = sentCampaigns
        .filter(c => c.sent_at && format(new Date(c.sent_at), 'yyyy-MM-dd') === dateStr)
        .reduce((s, c) => s + (c.opens ?? 0), 0);
      days.push({ date: format(d, 'MMM d'), opens: dayOpens });
    }
    return days;
  }, [sentCampaigns]);

  // Top campaigns by open rate
  const topCampaigns = useMemo(() =>
    [...sentCampaigns]
      .filter(c => (c.recipients_count ?? 0) > 0)
      .map(c => ({ ...c, openRate: ((c.opens ?? 0) / (c.recipients_count ?? 1)) * 100 }))
      .sort((a, b) => b.openRate - a.openRate)
      .slice(0, 5),
    [sentCampaigns]
  );

  // Engagement by project (from segment_filter)
  const byProject = useMemo(() => {
    const map: Record<string, { opens: number; clicks: number }> = {};
    sentCampaigns.forEach(c => {
      const sf = c.segment_filter as Record<string, unknown> | null;
      const project = sf?.type === 'project' ? String(sf.value ?? 'Other') : 'General';
      if (!map[project]) map[project] = { opens: 0, clicks: 0 };
      map[project].opens += c.opens ?? 0;
      map[project].clicks += c.clicks ?? 0;
    });
    return Object.entries(map).map(([name, v]) => ({ name, ...v }));
  }, [sentCampaigns]);

  const kpis = [
    { label: 'Emails Sent (30d)', value: totalSent, icon: Mail, color: 'hsl(39 67% 55%)' },
    { label: 'Open Rate', value: `${openRate}%`, icon: Eye, color: 'hsl(142 71% 45%)' },
    { label: 'Click Rate', value: `${clickRate}%`, icon: MousePointerClick, color: 'hsl(210 62% 46%)' },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ background: k.color + ' / 0.12)'.replace(')', '') }}>
              <k.icon className="w-5 h-5" style={{ color: k.color }} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Opens over time */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Opens Over Time</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={opensOverTime}>
            <defs>
              <linearGradient id="emailOpenGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(39 67% 55%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(39 67% 55%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
            <Area type="monotone" dataKey="opens" stroke="hsl(39 67% 55%)" fill="url(#emailOpenGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top campaigns */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Top Performing Campaigns</h3>
          {topCampaigns.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No campaigns yet</p>
          ) : (
            <div className="space-y-2">
              {topCampaigns.map(c => (
                <div key={c.id} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-foreground truncate flex-1">{c.subject}</span>
                  <span className="text-sm font-semibold ml-2" style={{ color: 'hsl(39 67% 55%)' }}>{c.openRate.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Engagement by project */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Engagement by Project</h3>
          {byProject.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byProject} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} className="text-muted-foreground" />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                <Bar dataKey="opens" fill="hsl(39 67% 55%)" radius={[0, 4, 4, 0]} name="Opens" />
                <Bar dataKey="clicks" fill="hsl(210 62% 46%)" radius={[0, 4, 4, 0]} name="Clicks" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
