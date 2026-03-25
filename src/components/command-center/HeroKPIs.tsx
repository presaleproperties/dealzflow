import { motion } from 'framer-motion';
import { Users, Flame, Zap, MessageSquare, TrendingUp, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPIData {
  pipelineValue: number;
  activeLeads: number;
  hotLeads: number;
  zaraCaptures: number;
  unreadMessages: number;
}

function formatMillion(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val}`;
}

const CARDS = (data: KPIData) => [
  {
    label: 'Pipeline Value',
    value: formatMillion(data.pipelineValue),
    icon: TrendingUp,
    accent: 'hsl(var(--success))',
    bg: 'hsl(var(--success) / 0.1)',
  },
  {
    label: 'Active Leads',
    value: data.activeLeads,
    icon: Users,
    accent: 'hsl(var(--info))',
    bg: 'hsl(var(--info) / 0.1)',
  },
  {
    label: 'Hot Leads',
    value: data.hotLeads,
    icon: Flame,
    accent: 'hsl(var(--destructive))',
    bg: 'hsl(var(--destructive) / 0.1)',
  },
  {
    label: 'Zara Captures (7d)',
    value: data.zaraCaptures,
    icon: Zap,
    accent: 'hsl(var(--primary))',
    bg: 'hsl(var(--primary) / 0.1)',
  },
  {
    label: 'Unread Messages',
    value: data.unreadMessages,
    icon: MessageSquare,
    accent: 'hsl(var(--warning))',
    bg: 'hsl(var(--warning) / 0.1)',
  },
  {
    label: 'Avg Response',
    value: 'No data',
    valueAmber: true,
    icon: Clock,
    accent: 'hsl(var(--muted-foreground))',
    bg: 'hsl(var(--muted) / 0.5)',
  },
];

interface Props {
  data: KPIData;
}

export function HeroKPIs({ data }: Props) {
  const cards = CARDS(data);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.055, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="card-premium p-3.5 flex items-start gap-3 h-full relative overflow-hidden"
              style={{ borderLeft: `3px solid ${card.accent}` }}
            >
              {/* Glow blob */}
              <div
                className="absolute -right-3 -top-3 w-14 h-14 rounded-full opacity-20 blur-xl pointer-events-none"
                style={{ background: card.accent }}
              />
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: card.bg }}
              >
                <Icon className="w-4 h-4" style={{ color: card.accent }} />
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-xl font-bold tracking-tight tabular-nums leading-none mb-1',
                    (card as any).valueAmber ? 'text-warning text-sm mt-1' : 'text-foreground',
                  )}
                >
                  {card.value}
                </p>
                <p className="text-[10.5px] text-muted-foreground leading-snug">{card.label}</p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
