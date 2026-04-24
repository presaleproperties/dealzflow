import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface SourceEntry { source: string; count: number }
export interface StatusCount { status: string; count: number }

// ─── Source colors & normalization ─────────────────────────────────────────────
const SOURCE_PALETTE: Record<string, string> = {
  tiktok: '#00f2ea', instagram: '#E4405F', facebook: '#1877F2',
  referral: '#10B981', whatsapp: '#25D366', sms: '#6B7280',
  manychat: '#0084FF', google: '#FBBC04', youtube: '#FF0000',
};

const FALLBACK_COLORS = ['#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6', '#6366F1', '#F97316'];

function getSourceColor(source: string, idx: number): string {
  return SOURCE_PALETTE[source?.toLowerCase()?.trim()] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'hsl(var(--muted-foreground))' },
  new_lead: { label: 'New Lead', color: 'hsl(var(--muted-foreground))' },
  contacted: { label: 'Contacted', color: 'hsl(var(--info))' },
  warm: { label: 'Warm', color: 'hsl(var(--warning))' },
  hot: { label: 'Hot', color: 'hsl(var(--destructive))' },
  booked: { label: 'Booked', color: 'hsl(var(--primary))' },
  qualified: { label: 'Qualified', color: 'hsl(var(--success))' },
  active: { label: 'Active', color: 'hsl(var(--info))' },
  'in-contract': { label: 'In Contract', color: 'hsl(38 92% 50%)' },
  in_contract: { label: 'In Contract', color: 'hsl(38 92% 50%)' },
  closed: { label: 'Closed', color: 'hsl(152 60% 28%)' },
  lost: { label: 'Lost', color: 'hsl(var(--destructive))' },
};

function getStatusConfig(raw: string) {
  const key = raw?.toLowerCase()?.replace(/\s+/g, '_');
  return STATUS_CONFIG[key] ?? {
    label: raw?.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown',
    color: 'hsl(var(--primary))',
  };
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = 'sources' | 'status';

interface Props {
  sourceData: SourceEntry[];
  statusData: StatusCount[];
}

export function PipelineInsights({ sourceData, statusData }: Props) {
  const [tab, setTab] = useState<Tab>('sources');

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden flex flex-col h-full">
      {/* Header with tabs */}
      <div className="px-5 py-3.5 border-b border-border/40 flex items-center gap-4 shrink-0">
        <h2 className="text-sm font-semibold text-foreground mr-auto">Pipeline Insights</h2>
        <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">
          {(['sources', 'status'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'text-[11px] font-medium px-3 py-1.5 rounded-md transition-all duration-200',
                tab === t
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'sources' ? 'Sources' : 'By Status'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-5">
        <AnimatePresence mode="wait">
          {tab === 'sources' ? (
            <motion.div
              key="sources"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
            >
              <SourcesView data={sourceData} />
            </motion.div>
          ) : (
            <motion.div
              key="status"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
            >
              <StatusView data={statusData} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Sources sub-view ──────────────────────────────────────────────────────────
function SourcesView({ data }: { data: SourceEntry[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <p className="text-sm text-muted-foreground">No lead source data yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Sources will populate as leads come in</p>
      </div>
    );
  }

  const chartData = data.map((d, i) => ({
    ...d,
    color: getSourceColor(d.source, i),
  }));

  return (
    <div className="flex items-start gap-5">
      {/* Donut */}
      <div className="w-[140px] h-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="source"
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={65}
              paddingAngle={2}
              strokeWidth={0}
            >
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} opacity={0.85} />
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
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex-1 space-y-2.5 min-w-0">
        {chartData.slice(0, 6).map((entry, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
            <span className="text-xs text-muted-foreground flex-1 truncate">{entry.source}</span>
            <span className="text-xs font-semibold text-foreground tabular-nums">{entry.count}</span>
            <span className="text-[10px] text-muted-foreground/50 tabular-nums w-7 text-right">
              {Math.round((entry.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Status sub-view ───────────────────────────────────────────────────────────
function StatusView({ data }: { data: StatusCount[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const total = data.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <p className="text-sm text-muted-foreground">No pipeline data yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {data.map((item, i) => {
        const cfg = getStatusConfig(item.status);
        const pct = Math.max((item.count / max) * 100, item.count > 0 ? 6 : 0);
        return (
          <motion.div
            key={item.status}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className="flex items-center gap-3"
          >
            <span className="text-[11px] text-muted-foreground w-20 shrink-0 text-right font-medium truncate">
              {cfg.label}
            </span>
            <div className="flex-1 h-7 rounded-lg bg-muted/25 overflow-hidden relative flex items-center">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ delay: 0.1 + i * 0.04, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-lg absolute left-0 top-0 opacity-70"
                style={{ background: cfg.color }}
              />
              {item.count > 0 && (
                <span className="relative z-10 text-[10px] font-bold pl-2.5" style={{ color: cfg.color }}>
                  {item.count}
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
