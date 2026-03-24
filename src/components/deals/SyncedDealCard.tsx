import { motion } from 'framer-motion';
import { MapPin, Calendar, ChevronRight, Building2, Users } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { SyncedDeal } from '@/hooks/useSyncedDeals';

interface SyncedDealCardProps {
  deal: SyncedDeal;
  index?: number;
  onClick?: () => void;
}

export function SyncedDealCard({ deal, index = 0, onClick }: SyncedDealCardProps) {
  const partMatch = deal.propertyAddress?.match(/Part (\d+\/\d+)/);
  const hasProjectName = !!(deal.rawData?.projectName);
  const isPresale = !!partMatch || hasProjectName;

  const cleanAddress = deal.propertyAddress
    ? deal.propertyAddress.replace(/Part \d+\/\d+\s*-\s*/, '').trim()
    : null;
  const displayAddress = cleanAddress || 'Unknown';

  const lifecycleDisplay = deal.lifecycleState
    ?.split('_')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ') || null;

  const visibleParticipants = deal.participants.filter(
    p => p.participantRole !== 'REAL' && p.participantRole !== 'REAL_ADMIN' && !(p as any).hidden
  );

  const dateLabel = deal.closeDate
    ? format(parseISO(deal.closeDate), 'MMM d, yyyy')
    : deal.firmDate
      ? format(parseISO(deal.firmDate), 'MMM d, yyyy')
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.3), duration: 0.25 }}
      onClick={onClick}
      className="group cursor-pointer"
    >
      <div className={cn(
        "flex items-center gap-4 p-4 rounded-xl border bg-card transition-all duration-200",
        "border-border/50 hover:border-border hover:shadow-md hover:shadow-black/[0.03]",
      )}>
        {/* Status dot */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className={cn(
            "w-2.5 h-2.5 rounded-full",
            deal.isListing ? 'bg-amber-500' :
            deal.status === 'closed' ? 'bg-emerald-500' :
            deal.status === 'active' ? 'bg-primary' :
            'bg-amber-500'
          )} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Address */}
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-sm text-foreground truncate">
              {displayAddress}
            </h3>
            {isPresale && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                {partMatch?.[1]}
              </span>
            )}
            {deal.isListing && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold">
                Listing
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
            {deal.clientName && deal.clientName !== 'Unknown' && (
              <span className="truncate max-w-[130px]">{deal.clientName}</span>
            )}
            {dateLabel && (
              <span className="flex items-center gap-1 shrink-0">
                <Calendar className="h-3 w-3" />
                {dateLabel}
              </span>
            )}
            {lifecycleDisplay && (
              <span className="hidden sm:inline text-muted-foreground/60">· {lifecycleDisplay}</span>
            )}
            {deal.mlsNumber && deal.mlsNumber !== 'N/A' && (
              <span className="hidden md:inline font-mono text-[11px]">· MLS {deal.mlsNumber}</span>
            )}
          </div>

          {/* Participants - compact */}
          {visibleParticipants.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground/70">
              <Users className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {visibleParticipants.slice(0, 2).map(p => {
                  const name = p.firstName && p.lastName
                    ? `${p.firstName} ${p.lastName}`
                    : p.company || 'Unknown';
                  const pct = p.payment?.percent ? ` ${p.payment.percent}%` : '';
                  return name + pct;
                }).join(' · ')}
                {visibleParticipants.length > 2 && ` +${visibleParticipants.length - 2}`}
              </span>
            </div>
          )}
        </div>

        {/* Right side: Amount + Chevron */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className={cn(
              "text-base lg:text-lg font-bold tracking-tight",
              deal.isListing ? 'text-amber-600 dark:text-amber-400' :
              deal.status === 'closed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
            )}>
              {formatCurrency(deal.displayCommission || deal.myNetPayout || 0)}
            </p>
            {deal.salePrice != null && deal.salePrice > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {formatCurrency(deal.salePrice)} sale
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/25 group-hover:text-muted-foreground/60 transition-colors" />
        </div>
      </div>
    </motion.div>
  );
}
