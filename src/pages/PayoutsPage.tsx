import { useState, useMemo } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Download, 
  DollarSign,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  ArrowUpRight,
  Timer,
  Wallet,
  Banknote,
  Sparkles,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSyncedTransactions } from '@/hooks/usePlatformConnections';
import { useSyncedPayouts, SyncedPayoutItem } from '@/hooks/useSyncedPayouts';
import { useRefreshData } from '@/hooks/useRefreshData';
import { useDashboardEmptyState } from '@/hooks/useDashboardEmptyState';
import { PageLoader } from '@/components/ui/page-loader';
import { formatCurrency } from '@/lib/format';
import { triggerHaptic, springConfigs } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { CollapsibleSection } from '@/components/deals/CollapsibleSection';

type PayoutTypeFilter = 'Advance' | 'Completion' | 'Commission' | 'ALL';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 15 } }
};

interface PayoutCardProps {
  payout: SyncedPayoutItem;
}

function PayoutCard({ payout }: PayoutCardProps) {
  const now = new Date();
  const tx = payout.rawTransaction;

  const getDueBadge = (closeDate: string | null, status: string) => {
    if (status === 'closed') return { label: '✓ Received', color: 'bg-emerald-500/15 text-emerald-600', urgent: false, barColor: 'bg-gradient-to-b from-emerald-400 to-emerald-600' };
    if (status === 'flagged') return { label: 'Needs Review', color: 'bg-amber-500/15 text-amber-600', urgent: true, barColor: 'bg-amber-500' };
    if (!closeDate) return { label: 'No date', color: 'bg-muted/60 text-muted-foreground', urgent: false, barColor: 'bg-muted-foreground/30' };
    
    const days = differenceInDays(parseISO(closeDate), now);
    if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: 'bg-destructive/15 text-destructive', urgent: true, barColor: 'bg-destructive' };
    if (days === 0) return { label: 'Due today', color: 'bg-destructive/15 text-destructive', urgent: true, barColor: 'bg-destructive' };
    if (days <= 7) return { label: `${days}d left`, color: 'bg-amber-500/15 text-amber-600', urgent: true, barColor: 'bg-amber-500' };
    if (days <= 30) return { label: `${days} days`, color: 'bg-muted/60 text-muted-foreground', urgent: false, barColor: 'bg-primary/40' };
    return { label: format(parseISO(closeDate), 'MMM d, yyyy'), color: 'bg-muted/60 text-muted-foreground', urgent: false, barColor: 'bg-primary/30' };
  };

  const badge = getDueBadge(payout.close_date, payout.status);
  const isReceived = payout.status === 'closed';
  const isFlagged = payout.status === 'flagged';

  const payoutTypeConfig: Record<string, { bg: string; text: string }> = {
    'Advance': { bg: 'bg-blue-500/10', text: 'text-blue-600' },
    'Completion': { bg: 'bg-emerald-500/10', text: 'text-emerald-600' },
    'Commission': { bg: 'bg-violet-500/10', text: 'text-violet-600' },
  };

  const typeStyle = payoutTypeConfig[payout.payoutType] || payoutTypeConfig['Commission'];
  
  // Better deal name: use project name, then client name, then extract from address
  const displayName = payout.projectName || payout.client_name || payout.property_address?.split(' - ')[0] || 'Transaction';
  const displayCity = payout.city || '';
  const mls = tx.mls_number && tx.mls_number !== 'N/A Presale' && tx.mls_number !== 'N/A Presale ' ? tx.mls_number : null;
  const lifecycleState = tx.lifecycle_state ? tx.lifecycle_state.split('_').map((w: string) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ') : null;

  return (
    <Link to={`/deals/${payout.id}`}>
      <motion.div
        className={cn(
          "relative overflow-hidden rounded-2xl border backdrop-blur-sm transition-all group cursor-pointer",
          isReceived 
            ? "bg-gradient-to-br from-emerald-500/5 to-card border-emerald-500/20" 
            : isFlagged
              ? "bg-gradient-to-br from-amber-500/5 via-card to-card border-amber-500/30"
              : badge.urgent 
                ? "bg-gradient-to-br from-amber-500/5 via-card to-card border-amber-500/30" 
                : "bg-card/80 border-border/60 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
        )}
        whileTap={{ scale: 0.985 }}
        whileHover={{ y: -2, transition: { duration: 0.2 } }}
        transition={springConfigs.snappy}
      >
        {/* Status Bar */}
        <div className={cn("absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl", badge.barColor)} />
        
        <div className="p-4 pl-5">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm truncate tracking-[-0.01em]">{displayName}</h4>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap mt-0.5">
                <span>{payout.isPresale ? 'Presale' : 'Resale'}</span>
                {displayCity && (
                  <>
                    <span className="text-border/60">·</span>
                    <span className="truncate">{displayCity}</span>
                  </>
                )}
                {payout.agent_name && (
                  <>
                    <span className="text-border/60">·</span>
                    <span className="truncate">{payout.agent_name}</span>
                  </>
                )}
              </div>

              {/* Deal Details Row */}
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                {payout.sale_price > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    Sale {formatCurrency(payout.sale_price)}
                  </span>
                )}
                {mls && (
                  <>
                    {payout.sale_price > 0 && <span className="text-border/60 text-[11px]">·</span>}
                    <span className="text-[11px] font-mono text-muted-foreground">{mls}</span>
                  </>
                )}
                {lifecycleState && (
                  <>
                    {(payout.sale_price > 0 || mls) && <span className="text-border/60 text-[11px]">·</span>}
                    <span className="text-[11px] text-primary/80">{lifecycleState}</span>
                  </>
                )}
              </div>
            </div>
            
            <div className="text-right shrink-0">
              <p className={cn(
                "font-bold text-xl tracking-tight",
                isReceived ? "text-success" : "text-foreground"
              )}>
                {formatCurrency(payout.netAmount)}
              </p>
              <span className={cn(
                "text-[10px] font-medium inline-block mt-1",
                badge.color.includes('emerald') ? "text-success" :
                badge.color.includes('destructive') ? "text-destructive" :
                badge.color.includes('amber') ? "text-warning" :
                "text-muted-foreground"
              )}>
                {badge.label}
              </span>
            </div>
          </div>
          
          {/* Footer Row */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30 mt-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={cn("text-xs font-medium", typeStyle.text)}>
                {payout.payoutType}
              </span>
              
              {payout.close_date && (
                <span className={cn(
                  "text-xs",
                  isReceived ? "text-success" : "text-muted-foreground"
                )}>
                  {format(parseISO(payout.close_date), 'MMM d, yyyy')}
                </span>
              )}

              {isFlagged && (
                <span className="text-xs text-warning">
                  Past close date, still active
                </span>
              )}
            </div>
            
            {payout.grossAmount !== payout.netAmount && (
              <span className="text-xs text-muted-foreground">
                Gross {formatCurrency(payout.grossAmount)}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ── Grouped by Year → Month ──
function GroupedPayoutsList({ payouts }: { payouts: SyncedPayoutItem[] }) {
  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const yearMap: Record<string, Record<string, SyncedPayoutItem[]>> = {};
    
    payouts.forEach(p => {
      const date = p.close_date ? parseISO(p.close_date) : new Date();
      const year = format(date, 'yyyy');
      const monthKey = format(date, 'yyyy-MM');
      
      if (!yearMap[year]) yearMap[year] = {};
      if (!yearMap[year][monthKey]) yearMap[year][monthKey] = [];
      yearMap[year][monthKey].push(p);
    });

    // Sort years descending, months ascending within year
    return Object.entries(yearMap)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, months]) => ({
        year,
        months: Object.entries(months)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([monthKey, items]) => ({
            monthKey,
            label: format(parseISO(monthKey + '-01'), 'MMMM'),
            items,
            total: items.reduce((s, p) => s + p.netAmount, 0),
          })),
        total: Object.values(months).flat().reduce((s, p) => s + p.netAmount, 0),
        count: Object.values(months).flat().length,
      }));
  }, [payouts]);

  const toggleYear = (year: string) => {
    setCollapsedYears(prev => {
      const next = new Set(prev);
      next.has(year) ? next.delete(year) : next.add(year);
      return next;
    });
    triggerHaptic('light');
  };

  const toggleMonth = (monthKey: string) => {
    setCollapsedMonths(prev => {
      const next = new Set(prev);
      next.has(monthKey) ? next.delete(monthKey) : next.add(monthKey);
      return next;
    });
    triggerHaptic('light');
  };

  return (
    <motion.div className="space-y-3" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={itemVariants} className="flex items-center justify-between px-1">
        <p className="text-sm text-muted-foreground font-medium">
          Showing <span className="text-foreground font-semibold">{payouts.length}</span> payout{payouts.length !== 1 ? 's' : ''}
        </p>
        <p className="text-sm font-semibold">
          {formatCurrency(payouts.reduce((s, p) => s + p.netAmount, 0))}
        </p>
      </motion.div>

      {grouped.map(yearGroup => {
        const yearCollapsed = collapsedYears.has(yearGroup.year);
        return (
          <motion.div key={yearGroup.year} variants={itemVariants} className="space-y-2">
            {/* Year Header */}
            <button
              onClick={() => toggleYear(yearGroup.year)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/40 border border-border/40 hover:border-primary/30 transition-all"
            >
              {yearCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              <span className="text-base font-bold">{yearGroup.year}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {yearGroup.count} payout{yearGroup.count !== 1 ? 's' : ''}
              </span>
              <span className="text-sm font-bold text-primary">{formatCurrency(yearGroup.total)}</span>
            </button>

            <AnimatePresence>
              {!yearCollapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 pl-2"
                >
                  {yearGroup.months.map(monthGroup => {
                    const monthCollapsed = collapsedMonths.has(monthGroup.monthKey);
                    return (
                      <div key={monthGroup.monthKey} className="space-y-2">
                        {/* Month Header */}
                        <button
                          onClick={() => toggleMonth(monthGroup.monthKey)}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-card/60 border border-border/30 hover:border-primary/20 transition-all"
                        >
                          {monthCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className="text-sm font-semibold">{monthGroup.label}</span>
                          <span className="text-[11px] text-muted-foreground ml-auto">
                            {monthGroup.items.length} payout{monthGroup.items.length !== 1 ? 's' : ''}
                          </span>
                          <span className="text-xs font-bold">{formatCurrency(monthGroup.total)}</span>
                        </button>

                        <AnimatePresence>
                          {!monthCollapsed && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="space-y-2 pl-2"
                            >
                              {monthGroup.items.map(payout => (
                                <PayoutCard key={payout.id} payout={payout} />
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export default function PayoutsPage() {
  const { data: syncedTransactions = [], isLoading } = useSyncedTransactions();
  const { payoutItems, stats } = useSyncedPayouts(syncedTransactions);
  const refreshData = useRefreshData();

  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'flagged' | 'thisMonth' | 'received'>('all');
  const [typeFilter, setTypeFilter] = useState<PayoutTypeFilter>('ALL');

  const filteredPayouts = useMemo(() => {
    return payoutItems.filter((payout) => {
      const name = (payout.projectName || payout.client_name || payout.property_address || '').toLowerCase();
      const matchesSearch = !search || name.includes(search.toLowerCase());
      const matchesType = typeFilter === 'ALL' || payout.payoutType === typeFilter;
      
      let matchesFilter = true;
      if (activeFilter === 'pending') matchesFilter = payout.status === 'active';
      else if (activeFilter === 'flagged') matchesFilter = payout.status === 'flagged';
      else if (activeFilter === 'thisMonth') {
        const thisMonth = new Date().toISOString().substring(0, 7);
        matchesFilter = payout.status !== 'closed' && (payout.close_date?.startsWith(thisMonth) || false);
      } else if (activeFilter === 'received') matchesFilter = payout.status === 'closed';

      return matchesSearch && matchesType && matchesFilter;
    });
  }, [payoutItems, search, typeFilter, activeFilter]);

  const handleExportCSV = () => {
    const headers = ['Property', 'Type', 'Payout Type', 'Net Amount', 'Gross Amount', 'Close Date', 'Status', 'City', 'Agent'];
    const rows = filteredPayouts.map((p) => [
      p.projectName || p.property_address || '',
      p.isPresale ? 'Presale' : 'Resale',
      p.payoutType,
      p.netAmount,
      p.grossAmount,
      p.close_date || '',
      p.status,
      p.city || '',
      p.agent_name || '',
    ]);
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payouts-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filterConfig = [
    { id: 'all' as const, label: 'All', count: stats.all.count, icon: Wallet },
    { id: 'pending' as const, label: 'Pending', count: stats.pending.count, icon: Clock },
    { id: 'flagged' as const, label: 'Review', count: stats.flagged.count, icon: AlertTriangle },
    { id: 'thisMonth' as const, label: 'Due Soon', count: stats.dueThisMonth.count, icon: Timer },
    { id: 'received' as const, label: 'Received', count: stats.received.count, icon: CheckCircle2 },
  ];

  const statCards = [
    { 
      label: 'Pending', 
      value: stats.pending.total, 
      count: stats.pending.count,
      valueColor: 'text-foreground'
    },
    { 
      label: 'Needs Review', 
      value: stats.flagged.total, 
      count: stats.flagged.count,
      valueColor: 'text-warning'
    },
    { 
      label: 'Received', 
      value: stats.received.total, 
      count: stats.received.count,
      valueColor: 'text-success'
    },
    { 
      label: 'Total Pipeline', 
      value: stats.all.total, 
      count: stats.all.count,
      valueColor: 'text-primary'
    },
  ];

  return (
    <AppLayout>
      <Header 
        title="Payouts" 
        subtitle="Commission payments from synced transactions"
        action={
          <Button variant="outline" onClick={handleExportCSV} className="gap-2 rounded-xl border-border/60 hover:border-primary/40">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        }
      />

      <PullToRefresh onRefresh={refreshData} className="min-h-[calc(100dvh-56px)]">
        <motion.div 
          className="p-4 sm:p-5 md:p-6 lg:p-6 space-y-4 sm:space-y-5"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
           {/* Mobile-only Export (desktop uses the Header action slot) */}
           <div className="sm:hidden flex justify-end">
             <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2 rounded-lg h-9">
               <Download className="w-3.5 h-3.5" />
               Export CSV
             </Button>
           </div>
           {/* Stats Grid */}
           <CollapsibleSection icon={Wallet} title="Overview" badge={`${stats.all.count} payouts`} defaultOpen={true}>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {statCards.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    className="rounded-xl border border-border/50 bg-card p-4 space-y-1"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05, type: 'spring', stiffness: 200, damping: 25 }}
                  >
                    <p className="metric-label">{stat.label}</p>
                    <AnimatedNumber
                      value={stat.value}
                      className={cn("text-xl sm:text-2xl font-bold tracking-tight", stat.valueColor)}
                      duration={0.8}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {stat.count} {stat.count === 1 ? 'payout' : 'payouts'}
                    </p>
                  </motion.div>
                ))}
             </div>
           </CollapsibleSection>

          {/* Flagged Alert */}
          <AnimatePresence>
            {stats.flagged.count > 0 && activeFilter !== 'received' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                variants={itemVariants}
              >
                <button
                  onClick={() => { triggerHaptic('light'); setActiveFilter('flagged'); }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/25 backdrop-blur-sm text-left"
                >
                  <div className="p-3 rounded-xl bg-amber-500/20 shrink-0">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-amber-600 text-sm">
                      {stats.flagged.count} Payout{stats.flagged.count > 1 ? 's' : ''} Need Review
                    </p>
                    <p className="text-xs text-amber-600/80 truncate">
                      {formatCurrency(stats.flagged.total)} — Close date passed but still active in ReZen
                    </p>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-amber-600 shrink-0" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filter Pills & Search - Collapsible */}
          <CollapsibleSection icon={Search} title="Filters" badge={search || typeFilter !== 'ALL' ? 'Active' : undefined} defaultOpen={true}>
            <div className="space-y-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {filterConfig.map(filter => (
                  <motion.button
                    key={filter.id}
                    onClick={() => {
                      triggerHaptic('light');
                      setActiveFilter(filter.id);
                    }}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 border",
                      activeFilter === filter.id
                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25"
                        : "bg-card/80 text-muted-foreground border-border/50 hover:bg-muted/50 hover:border-primary/30"
                    )}
                    whileTap={{ scale: 0.95 }}
                  >
                    <filter.icon className="w-4 h-4" />
                    {filter.label}
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-lg font-semibold",
                      activeFilter === filter.id ? "bg-white/20" : "bg-muted"
                    )}>
                      {filter.count}
                    </span>
                  </motion.button>
                ))}
              </div>

               <div className="flex gap-2">
                 <div className="relative flex-1">
                   <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                   <Input
                     placeholder="Search by property or client..."
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                     className="pl-10 h-11 rounded-xl bg-card/80 border-border/50 backdrop-blur-sm focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-all"
                   />
                 </div>
                 <DropdownMenu>
                   <DropdownMenuTrigger asChild>
                     <Button variant="outline" className="h-11 px-4 rounded-xl gap-2 border-border/50 hover:border-primary/40 bg-card/80 backdrop-blur-sm hover:bg-card transition-all">
                       <TrendingUp className="w-4 h-4" />
                       <span className="hidden sm:inline text-sm font-medium">{typeFilter === 'ALL' ? 'All Types' : typeFilter}</span>
                     </Button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent align="end" className="w-44 rounded-xl">
                     <DropdownMenuItem onClick={() => setTypeFilter('ALL')} className="rounded-lg">
                       All Types
                     </DropdownMenuItem>
                     {(['Advance', 'Completion', 'Commission'] as const).map((type) => (
                       <DropdownMenuItem key={type} onClick={() => setTypeFilter(type)} className="rounded-lg">
                         {type}
                       </DropdownMenuItem>
                     ))}
                   </DropdownMenuContent>
                 </DropdownMenu>
               </div>
            </div>
          </CollapsibleSection>

          {/* Payouts List - Grouped by Year/Month */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <motion.div 
                  key={i} 
                  className="h-32 bg-gradient-to-br from-muted/50 to-muted/20 animate-pulse rounded-2xl border border-border/30"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                />
              ))}
            </div>
          ) : filteredPayouts.length === 0 ? (
            <motion.div 
              variants={itemVariants}
              className="text-center py-20 landing-card bg-gradient-to-br from-card to-muted/20"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-5 border border-primary/20">
                <Sparkles className="w-10 h-10 text-primary/60" />
              </div>
              <p className="text-xl font-bold text-foreground mb-2">No payouts found</p>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
                {search ? 'Try adjusting your search or filters' : 'Sync your platform to see commission payouts here'}
              </p>
            </motion.div>
          ) : (
            <GroupedPayoutsList payouts={filteredPayouts} />
          )}
        </motion.div>
      </PullToRefresh>
    </AppLayout>
  );
}
