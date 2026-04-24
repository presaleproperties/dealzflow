import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';

export interface SourceEntry {
  source: string;
  count: number;
}

const SOURCE_PALETTE: Record<string, string> = {
  tiktok:    '#00f2ea',
  instagram: '#E4405F',
  facebook:  '#1877F2',
  referral:  '#10B981',
  whatsapp:  '#25D366',
  sms:       '#6B7280',
  manychat:  '#0084FF',
};

const LEAD_SOURCE_NORMALIZE: Record<string, string> = {
  tiktok: 'TikTok', tik_tok: 'TikTok', 'tik tok': 'TikTok',
  instagram: 'Instagram', ig: 'Instagram', insta: 'Instagram',
  facebook: 'Facebook', 'facebook ads': 'Facebook Ads', fb: 'Facebook',
  google: 'Google', 'google ads': 'Google Ads',
  referral: 'Referral', ref: 'Referral',
  youtube: 'YouTube', yt: 'YouTube',
  whatsapp: 'WhatsApp', sms: 'SMS', manychat: 'ManyChat',
  team: 'Team', 'past client': 'Past Client',
};

function normalizeSource(source: string): string {
  return LEAD_SOURCE_NORMALIZE[source.toLowerCase().trim()] || source;
}

function getColor(source: string, idx: number): string {
  const key = source?.toLowerCase()?.trim() ?? '';
  if (SOURCE_PALETTE[key]) return SOURCE_PALETTE[key];
  const fallbacks = ['#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];
  return fallbacks[idx % fallbacks.length];
}

interface Props {
  data: SourceEntry[];
}

export function LeadSources({ data }: Props) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const chartData = data.map((d, i) => ({
    ...d,
    color: getColor(d.source, i),
    displayName: normalizeSource(d.source) || 'Unknown',
  }));

  return (
    <div className="card-premium overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-info" />
        <h2 className="text-sm font-semibold text-foreground">Lead Sources</h2>
        {total > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{total} total</span>
        )}
      </div>

      <div className="flex-1 p-4 flex flex-col">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 py-8 text-center">
            <p className="text-sm text-muted-foreground">No lead source data yet</p>
          </div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.35, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="h-[160px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="count"
                    nameKey="displayName"
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={70}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {chartData.map((entry, idx) => (
                      <Cell key={entry.source + idx} fill={entry.color} opacity={0.9} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '10px',
                      fontSize: '11px',
                      color: 'hsl(var(--popover-foreground))',
                    }}
                    labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    formatter={(val: number, name: string) => [val, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>

            <div className="mt-3 space-y-2">
              {chartData.slice(0, 6).map((entry, i) => (
                <motion.div
                  key={entry.source + i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.45 + i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-2"
                >
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: entry.color }} />
                  <span className="text-xs text-muted-foreground flex-1 truncate capitalize">
                    {entry.displayName}
                  </span>
                  <span className="text-xs font-semibold text-foreground tabular-nums">{entry.count}</span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {Math.round((entry.count / total) * 100)}%
                  </span>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
