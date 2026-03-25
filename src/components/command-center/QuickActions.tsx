import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Users, MessageSquare, Briefcase, Package, TrendingUp, Settings } from 'lucide-react';

const ACTIONS = [
  { label: 'All Leads',        to: '/dashboard',      icon: Users,         color: 'hsl(var(--info))' },
  { label: 'Conversations',    to: '/conversations',  icon: MessageSquare, color: 'hsl(var(--primary))' },
  { label: 'Deals',            to: '/deals',          icon: Briefcase,     color: 'hsl(var(--success))' },
  { label: 'Client Inventory', to: '/inventory',      icon: Package,       color: 'hsl(var(--warning))' },
  { label: 'Forecast',         to: '/forecast',       icon: TrendingUp,    color: 'hsl(var(--destructive))' },
  { label: 'Settings',         to: '/settings',       icon: Settings,      color: 'hsl(var(--muted-foreground))' },
];

export function QuickActions() {
  return (
    <div className="card-premium overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
      </div>

      <div className="p-4 flex-1 flex items-start">
        <div className="grid grid-cols-2 gap-3 w-full">
          {ACTIONS.map((action, i) => {
            const Icon = action.icon;
            return (
              <motion.div
                key={action.to}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link
                  to={action.to}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-3 rounded-xl',
                    'border border-border/50 bg-card/60',
                    'hover:border-border hover:bg-card',
                    'hover:shadow-[0_4px_16px_-4px_hsl(0_0%_0%/0.1)]',
                    'transition-all duration-200 group w-full',
                  )}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110"
                    style={{ background: `${action.color}15` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: action.color }} />
                  </div>
                  <span className="text-xs font-semibold text-foreground leading-tight">{action.label}</span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
