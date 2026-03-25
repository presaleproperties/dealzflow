import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { CircleDot, ArrowRightLeft, Star, MessageCircle, Zap } from 'lucide-react';

export interface ActivityEntry {
  id: string;
  action_type: string;
  description: string | null;
  created_at: string;
}

function ActivityIcon({ type }: { type: string }) {
  const t = type?.toLowerCase();
  if (t === 'captured') return (
    <span className="w-7 h-7 rounded-full bg-success/15 flex items-center justify-center shrink-0">
      <CircleDot className="w-3.5 h-3.5 text-success" />
    </span>
  );
  if (t === 'synced_to_leads') return (
    <span className="w-7 h-7 rounded-full bg-info/15 flex items-center justify-center shrink-0">
      <ArrowRightLeft className="w-3.5 h-3.5 text-info" />
    </span>
  );
  if (t === 'qualified') return (
    <span className="w-7 h-7 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
      <Star className="w-3.5 h-3.5 text-warning" />
    </span>
  );
  if (t === 'conversation') return (
    <span className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
      <MessageCircle className="w-3.5 h-3.5 text-primary" />
    </span>
  );
  return (
    <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
      <Zap className="w-3.5 h-3.5 text-muted-foreground" />
    </span>
  );
}

interface Props {
  entries: ActivityEntry[];
}

export function ActivityFeed({ entries }: Props) {
  return (
    <div className="card-premium overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-success" />
        <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
        {entries.length > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground">{entries.length} events</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center h-full min-h-[180px]">
            <div className="w-10 h-10 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
              <Zap className="w-5 h-5 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-semibold text-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-[200px]">
              Zara will log captures here automatically
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {entries.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.025, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-start gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors"
              >
                <ActivityIcon type={entry.action_type} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                    {entry.description || entry.action_type.replace(/_/g, ' ')}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
