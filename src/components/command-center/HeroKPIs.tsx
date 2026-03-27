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

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {/* Pipeline Value — hero card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="col-span-2 lg:col-span-1 cursor-pointer"
        onClick={() => navigate('/pipeline')}
      >
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 h-full min-h-[110px] flex flex-col justify-between hover:shadow-lg hover:shadow-primary/20 transition-shadow duration-200">
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -left-4 -bottom-4 w-16 h-16 rounded-full bg-white/5 blur-xl" />
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary-foreground/70" />
            <span className="text-[11px] font-medium text-primary-foreground/70 uppercase tracking-wider">Pipeline</span>
          </div>
          <p className="text-3xl font-bold text-primary-foreground tracking-tight tabular-nums leading-none">
            {formatMillion(data.pipelineValue)}
          </p>
        </div>
      </motion.div>

      {/* Secondary KPIs */}
      {[
        { label: 'Active Leads', value: data.activeLeads, icon: Users, accentVar: '--info', to: '/leads' },
        { label: 'Hot Leads', value: data.hotLeads, icon: Flame, accentVar: '--destructive', to: '/leads?temp=hot' },
        { label: 'Zara Captures', value: data.zaraCaptures, icon: Zap, accentVar: '--primary', to: null },
        { label: 'Unread', value: data.unreadMessages, icon: MessageSquare, accentVar: '--warning', to: '/leads' },
      ].map((card, i) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 + i * 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className={card.to ? 'cursor-pointer' : ''}
            onClick={() => card.to && navigate(card.to)}
          >
            <div className={cn(
              "rounded-2xl border border-border/60 bg-card p-4 h-full min-h-[110px] flex flex-col justify-between relative overflow-hidden group transition-all duration-200",
              card.to ? "hover:border-border hover:shadow-md" : "hover:border-border"
            )}>
              <div
                className="absolute -right-3 -top-3 w-16 h-16 rounded-full opacity-[0.08] blur-xl pointer-events-none transition-opacity group-hover:opacity-[0.14]"
                style={{ background: `hsl(var(${card.accentVar}))` }}
              />
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5" style={{ color: `hsl(var(${card.accentVar}))` }} />
                <span className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</span>
              </div>
              <p className={cn(
                'text-2xl font-bold tracking-tight tabular-nums leading-none mt-auto',
                card.value === 0 ? 'text-muted-foreground/40' : 'text-foreground'
              )}>
                {card.value}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
