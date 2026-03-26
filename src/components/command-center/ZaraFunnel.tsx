import { motion } from 'framer-motion';
import { Zap, MessageCircle, TrendingUp, Users } from 'lucide-react';

export interface FunnelData {
  widgetCaptures: number;
  hasContactInfo: number;
  syncedToLeads: number;
  qualified: number;
}

const STEPS = [
  { key: 'widgetCaptures', label: 'Widget Captures',   color: 'hsl(152 69% 45%)' },
  { key: 'hasContactInfo', label: 'Has Contact Info',  color: 'hsl(214 89% 55%)' },
  { key: 'syncedToLeads',  label: 'Synced to Leads',   color: 'hsl(270 70% 60%)' },
  { key: 'qualified',      label: 'Qualified',         color: 'hsl(45 93% 55%)' },
];

interface Props {
  data: FunnelData;
}

const EMPTY_TIPS = [
  { icon: MessageCircle, text: 'Zara can follow up with leads via WhatsApp & Instagram' },
  { icon: TrendingUp,    text: 'Track conversion rates from capture to qualified' },
  { icon: Users,         text: 'Leads are auto-synced to your pipeline' },
];

export function ZaraFunnel({ data }: Props) {
  const values = STEPS.map(s => ({
    ...s,
    count: data[s.key as keyof FunnelData] ?? 0,
  }));

  const top = values[0].count || 1;
  const hasData = values.some(v => v.count > 0);

  return (
    <div className="card-premium overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        <h2 className="text-sm font-semibold text-foreground">Zara Conversion Funnel</h2>
      </div>

      <div className="flex-1 p-5 flex flex-col justify-center">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <Zap className="w-6 h-6 text-primary/50" />
            </div>
            <p className="text-sm font-semibold text-foreground">No captures yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px] leading-relaxed">
              Zara will log captures and conversions here automatically
            </p>
            <div className="mt-5 space-y-2.5 w-full max-w-[260px]">
              {EMPTY_TIPS.map((tip, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="flex items-start gap-2.5 text-left p-2.5 rounded-xl bg-muted/30 border border-border/30"
                >
                  <tip.icon className="w-3.5 h-3.5 text-primary/60 mt-0.5 shrink-0" />
                  <span className="text-[11px] text-muted-foreground leading-snug">{tip.text}</span>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {values.map((step, i) => {
              const pct = Math.max((step.count / top) * 100, step.count > 0 ? 8 : 0);
              const prevCount = i > 0 ? values[i - 1].count : null;
              const convPct = prevCount && prevCount > 0
                ? Math.round((step.count / prevCount) * 100)
                : null;

              return (
                <motion.div
                  key={step.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.07, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{step.label}</span>
                    <div className="flex items-center gap-2">
                      {convPct !== null && (
                        <span className="text-[10px] text-muted-foreground/70">{convPct}% conv.</span>
                      )}
                      <span className="text-xs font-bold tabular-nums" style={{ color: step.color }}>
                        {step.count.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="h-6 rounded-lg bg-muted/30 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.35 + i * 0.07, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-lg"
                      style={{ background: `linear-gradient(90deg, ${step.color} 0%, ${step.color}bb 100%)` }}
                    />
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
