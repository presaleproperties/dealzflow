import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LeadDetailSheet } from './LeadDetailSheet';

export interface ProspectRow {
  id: string;
  client_name: string;
  source: string | null;
  temperature: string;
  budget: number | null;
  created_at: string;
  updated_at: string;
  status: string;
}

const SOURCE_COLORS: Record<string, string> = {
  tiktok:    'hsl(180 100% 47%)',
  instagram: 'hsl(340 80% 58%)',
  facebook:  'hsl(214 89% 52%)',
  referral:  'hsl(152 69% 40%)',
  whatsapp:  'hsl(142 70% 49%)',
  sms:       'hsl(220 9% 46%)',
  manychat:  'hsl(214 100% 50%)',
};

function getSourceColor(source: string | null) {
  if (!source) return 'hsl(var(--muted-foreground))';
  const key = source.toLowerCase().trim();
  return SOURCE_COLORS[key] ?? 'hsl(var(--muted-foreground))';
}

function TempBadge({ temp }: { temp: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    hot:  { label: '🔥 Hot',  cls: 'bg-destructive/12 text-destructive' },
    warm: { label: '☀️ Warm', cls: 'bg-warning/12 text-warning' },
    cold: { label: '❄️ Cold', cls: 'bg-info/12 text-info' },
  };
  const t = map[temp?.toLowerCase()] ?? { label: temp, cls: 'bg-muted/50 text-muted-foreground' };
  return (
    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0', t.cls)}>
      {t.label}
    </span>
  );
}

function UrgencyDot({ created_at, updated_at }: { created_at: string; updated_at: string }) {
  const now = Date.now();
  const updatedMs = new Date(updated_at).getTime();
  const hoursAgo = (now - updatedMs) / 3_600_000;
  if (hoursAgo > 48) return <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />;
  if (hoursAgo > 24) return <span className="w-2 h-2 rounded-full bg-warning shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-success shrink-0" />;
}

function formatBudget(budget: number | null): string {
  if (!budget) return '—';
  if (budget >= 1_000_000) return `$${(budget / 1_000_000).toFixed(1)}M`;
  return `$${(budget / 1_000).toFixed(0)}K`;
}

interface Props {
  prospects: ProspectRow[];
}

export function NeedsAttention({ prospects }: Props) {
  const count = prospects.length;
  const display = prospects.slice(0, 10);

  return (
    <div className="card-premium overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2.5 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
        <h2 className="text-sm font-semibold text-foreground flex-1">Needs Attention</h2>
        {count > 0 ? (
          <span className="text-xs font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
            {count} lead{count !== 1 ? 's' : ''} waiting
          </span>
        ) : (
          <span className="text-xs text-success bg-success/10 px-2 py-0.5 rounded-full font-semibold">All caught up ✓</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {display.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-10 h-10 rounded-2xl bg-success/10 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5 text-success" />
            </div>
            <p className="text-sm font-semibold text-foreground">All leads are engaged</p>
            <p className="text-xs text-muted-foreground mt-1">No one waiting for more than 48 hours</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {display.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.28 + i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="px-4 py-3 hover:bg-muted/20 transition-colors"
              >
                {/* Mobile: stacked, Desktop: row */}
                <div className="flex items-start gap-2.5">
                  <UrgencyDot created_at={p.created_at} updated_at={p.updated_at} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                        {p.client_name}
                      </span>
                      <TempBadge temp={p.temperature} />
                      {p.source && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{
                            color: getSourceColor(p.source),
                            background: `${getSourceColor(p.source)}18`,
                          }}
                        >
                          {p.source}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10.5px] text-muted-foreground">
                        Budget: <span className="font-medium text-foreground/80">{formatBudget(p.budget)}</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">·</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <a
                    href={`https://wa.me/${p.client_name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors"
                  >
                    Contact
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {count > 0 && (
        <div className="px-5 py-3 border-t border-border/40 shrink-0">
          <Link
            to="/pipeline"
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            View all leads <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
