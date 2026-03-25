import { motion } from 'framer-motion';

export interface StatusCount {
  status: string;
  count: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; textColor: string }> = {
  new:       { label: 'New',       color: 'hsl(var(--muted-foreground) / 0.5)', textColor: 'hsl(var(--muted-foreground))' },
  contacted: { label: 'Contacted', color: 'hsl(var(--info))',                   textColor: 'hsl(var(--info))' },
  warm:      { label: 'Warm',      color: 'hsl(var(--warning))',                textColor: 'hsl(var(--warning))' },
  hot:       { label: 'Hot',       color: 'hsl(var(--destructive))',            textColor: 'hsl(var(--destructive))' },
  booked:    { label: 'Booked',    color: 'hsl(var(--primary))',                textColor: 'hsl(var(--primary))' },
  qualified: { label: 'Qualified', color: 'hsl(var(--success))',                textColor: 'hsl(var(--success))' },
  closed:    { label: 'Closed',    color: 'hsl(152 60% 28%)',                   textColor: 'hsl(152 69% 40%)' },
  active:    { label: 'Active',    color: 'hsl(var(--info))',                   textColor: 'hsl(var(--info))' },
};

interface Props {
  data: StatusCount[];
}

export function PipelineStatus({ data }: Props) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="card-premium overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-warning" />
        <h2 className="text-sm font-semibold text-foreground">Pipeline by Status</h2>
        {total > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{total} leads</span>
        )}
      </div>

      <div className="flex-1 p-5 flex flex-col justify-center">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">No pipeline data yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((item, i) => {
              const cfg = STATUS_CONFIG[item.status?.toLowerCase()] ?? {
                label: item.status,
                color: 'hsl(var(--primary))',
                textColor: 'hsl(var(--primary))',
              };
              const pct = Math.max((item.count / max) * 100, item.count > 0 ? 5 : 0);

              return (
                <motion.div
                  key={item.status}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.38 + i * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-2.5"
                >
                  <span className="text-[11px] text-muted-foreground w-16 shrink-0 text-right font-medium">
                    {cfg.label}
                  </span>
                  <div className="flex-1 h-6 rounded-lg bg-muted/30 overflow-hidden relative flex items-center">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.42 + i * 0.06, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-lg absolute left-0 top-0 opacity-75"
                      style={{ background: cfg.color }}
                    />
                    {item.count > 0 && (
                      <span
                        className="relative z-10 text-[10px] font-bold pl-2.5"
                        style={{ color: cfg.textColor }}
                      >
                        {item.count}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
