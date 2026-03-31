import { motion } from 'framer-motion';
import { TrendingUp, Users, Flame, Zap, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

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
  return `$${val.toLocaleString()}`;
}

interface Props {
  data: KPIData;
}

export function HeroKPIs({ data }: Props) {
  const navigate = useNavigate();

  const kpis = [
    { label: 'Pipeline', value: formatMillion(data.pipelineValue), icon: TrendingUp, accentVar: '--primary', to: '/pipeline', isPrimary: true },
    { label: 'Active', value: String(data.activeLeads), icon: Users, accentVar: '--info', to: '/pipeline' },
    { label: 'Hot', value: String(data.hotLeads), icon: Flame, accentVar: '--destructive', to: '/pipeline?temp=hot' },
    { label: 'Zara', value: String(data.zaraCaptures), icon: Zap, accentVar: '--primary', to: '/pipeline' },
    { label: 'Unread', value: String(data.unreadMessages), icon: MessageSquare, accentVar: '--warning', to: '/pipeline' },
  ];

  return (
    <div className="flex items-stretch gap-2">
      {kpis.map((kpi, i) => {
        const Icon = kpi.icon;
        return (
          <motion.button
            key={kpi.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => navigate(kpi.to)}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2.5 rounded-xl border transition-all duration-200 cursor-pointer',
              kpi.isPrimary
                ? 'bg-primary text-primary-foreground border-primary/80 hover:shadow-md hover:shadow-primary/20'
                : 'bg-card border-border/50 hover:border-border hover:shadow-sm',
              kpi.isPrimary ? 'flex-shrink-0' : 'flex-shrink-0'
            )}
          >
            <Icon
              className="w-3.5 h-3.5 flex-shrink-0"
              style={kpi.isPrimary ? undefined : { color: `hsl(var(${kpi.accentVar}))` }}
            />
            <span className={cn(
              'text-sm font-bold tabular-nums leading-none',
              kpi.isPrimary ? '' : (Number(kpi.value) === 0 ? 'text-muted-foreground/40' : 'text-foreground')
            )}>
              {kpi.value}
            </span>
            <span className={cn(
              'text-[10px] font-medium uppercase tracking-wider hidden sm:inline',
              kpi.isPrimary ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}>
              {kpi.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
