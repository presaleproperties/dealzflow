import { useState, useMemo, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, X, ChevronDown, ChevronRight, AlertTriangle, ArrowUpDown, SlidersHorizontal, Filter, Building2, Home, MapPin,
} from 'lucide-react';
import { format, parseISO, isBefore, isAfter, addDays, startOfDay } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSyncedDeals, SyncedDeal } from '@/hooks/useSyncedDeals';
import { useSyncedTransactions } from '@/hooks/usePlatformConnections';
import { useRefreshData } from '@/hooks/useRefreshData';
import { formatCurrency, formatCurrencyCompact } from '@/lib/format';
import { triggerHaptic } from '@/lib/haptics';
import { SyncedDealCard } from '@/components/deals/SyncedDealCard';
import { MissingInfoDialog, getDealsWithMissingInfo } from '@/components/deals/MissingInfoDialog';
import { cn } from '@/lib/utils';

type SortKey = 'close-desc' | 'close-asc' | 'amount-desc' | 'amount-asc' | 'address-asc' | 'address-desc';
type TabKey = 'active' | 'closed' | 'listings';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'close-desc', label: 'Close Date ↓' },
  { value: 'close-asc', label: 'Close Date ↑' },
  { value: 'amount-desc', label: 'Highest $' },
  { value: 'amount-asc', label: 'Lowest $' },
  { value: 'address-asc', label: 'A → Z' },
  { value: 'address-desc', label: 'Z → A' },
];

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'closed', label: 'Closed' },
  { key: 'listings', label: 'Listings' },
];

function getSortFn(key: SortKey) {
  return (a: SyncedDeal, b: SyncedDeal) => {
    switch (key) {
      case 'close-desc': {
        const dA = a.closeDate || a.firmDate || '';
        const dB = b.closeDate || b.firmDate || '';
        if (!dA && !dB) return 0;
        if (!dA) return 1;
        if (!dB) return -1;
        return dB.localeCompare(dA);
      }
      case 'close-asc': {
        const dA = a.closeDate || a.firmDate || '';
        const dB = b.closeDate || b.firmDate || '';
        if (!dA && !dB) return 0;
        if (!dA) return 1;
        if (!dB) return -1;
        return dA.localeCompare(dB);
      }
      case 'amount-desc':
        return (b.displayCommission || b.myNetPayout || 0) - (a.displayCommission || a.myNetPayout || 0);
      case 'amount-asc':
        return (a.displayCommission || a.myNetPayout || 0) - (b.displayCommission || b.myNetPayout || 0);
      case 'address-asc':
        return (a.propertyAddress || '').localeCompare(b.propertyAddress || '');
      case 'address-desc':
        return (b.propertyAddress || '').localeCompare(a.propertyAddress || '');
    }
  };
}

export default function DealsPage() {
  const { activeDeals, closedDeals, listings } = useSyncedDeals();
  const { data: syncedTransactions = [] } = useSyncedTransactions();
  const refreshData = useRefreshData();
  const location = useLocation();

  // Read ?month=yyyy-MM from URL (from dashboard month card clicks)
  const monthParam = new URLSearchParams(location.search).get('month');
  const filterParam = new URLSearchParams(location.search).get('filter');

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [sortKey, setSortKey] = useState<SortKey>('close-desc');
  const [showFilters, setShowFilters] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [showMissingInfo, setShowMissingInfo] = useState(false);

  const dealsWithMissingInfo = useMemo(
    () => getDealsWithMissingInfo(syncedTransactions),
    [syncedTransactions]
  );

  // Show dialog when returning from new deal page or on first load with missing info
  useEffect(() => {
    if (dealsWithMissingInfo.length > 0 && location.state?.fromNewDeal) {
      setShowMissingInfo(true);
      // Clear the state so it doesn't re-trigger
      window.history.replaceState({}, '');
    }
  }, [dealsWithMissingInfo, location.state]);

  const hasActiveFilters = !!minAmount || !!maxAmount;

  const filteredDeals = useMemo(() => {
    let deals = activeTab === 'active' ? activeDeals : activeTab === 'closed' ? closedDeals : listings;

    // Filter to specific month if coming from dashboard
    if (monthParam) {
      deals = deals.filter(d => {
        const dateStr = d.closeDate || d.firmDate || d.listingDate;
        if (!dateStr) return false;
        return format(parseISO(dateStr), 'yyyy-MM') === monthParam;
      });
    }

    // Filter by overdue/this-week from Needs Attention
    if (filterParam === 'overdue') {
      const today = startOfDay(new Date());
      deals = deals.filter(d => d.status === 'active' && d.closeDate && isBefore(new Date(d.closeDate), today));
    } else if (filterParam === 'this-week') {
      const today = startOfDay(new Date());
      const weekOut = addDays(today, 7);
      deals = deals.filter(d => d.closeDate && isAfter(new Date(d.closeDate), today) && isBefore(new Date(d.closeDate), weekOut));
    }

    if (search) {
      const q = search.toLowerCase();
      deals = deals.filter(d =>
        (d.propertyAddress || '').toLowerCase().includes(q) ||
        d.clientName.toLowerCase().includes(q) ||
        d.mlsNumber?.toLowerCase().includes(q)
      );
    }

    const min = minAmount ? Number(minAmount) : null;
    const max = maxAmount ? Number(maxAmount) : null;
    if (min !== null) deals = deals.filter(d => (d.displayCommission || d.myNetPayout || 0) >= min);
    if (max !== null) deals = deals.filter(d => (d.displayCommission || d.myNetPayout || 0) <= max);

    return [...deals].sort(getSortFn(sortKey));
  }, [activeTab, activeDeals, closedDeals, listings, search, sortKey, minAmount, maxAmount, monthParam, filterParam]);

  const monthGroups = useMemo(() => {
    const groups = new Map<string, { label: string; deals: SyncedDeal[] }>();
    filteredDeals.forEach(deal => {
      const dateStr = deal.closeDate || deal.firmDate || deal.listingDate;
      const key = dateStr ? format(parseISO(dateStr), 'yyyy-MM') : 'no-date';
      const label = dateStr ? format(parseISO(dateStr), 'MMMM yyyy') : 'No Date';
      if (!groups.has(key)) groups.set(key, { label, deals: [] });
      groups.get(key)!.deals.push(deal);
    });
    return Array.from(groups.entries()).map(([key, { label, deals }]) => ({
      key,
      label,
      deals,
      totalPayout: deals.reduce((s, d) => s + (d.displayCommission || d.myNetPayout || 0), 0),
    }));
  }, [filteredDeals]);

  const stats = useMemo(() => {
    const allDeals = [...activeDeals, ...closedDeals];
    const closedListings = listings.filter(d => d.status === 'closed');
    const closedNet = closedDeals.reduce((sum, d) => sum + (d.displayCommission || d.myNetPayout || 0), 0);
    const activeNet = activeDeals.reduce((sum, d) => sum + (d.displayCommission || d.myNetPayout || 0), 0);
    const listingsNet = listings.reduce((sum, d) => sum + (d.displayCommission || d.myNetPayout || 0), 0);
    return {
      active: activeDeals.length,
      closed: closedDeals.length,
      listings: listings.length,
      closedListings: closedListings.length,
      totalDeals: allDeals.length,
      closedNet,
      activeNet,
      listingsNet,
      totalVolume: allDeals.reduce((sum, d) => sum + (d.salePrice || 0), 0),
    };
  }, [activeDeals, closedDeals, listings]);

  const tabCounts: Record<TabKey, number> = {
    active: stats.active,
    closed: stats.closed,
    listings: stats.listings,
  };

  const handleTabChange = (tab: TabKey) => {
    triggerHaptic('light');
    setActiveTab(tab);
  };

  const clearFilters = () => {
    setMinAmount('');
    setMaxAmount('');
    setShowFilters(false);
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <Header title="Deals" />

        <PullToRefresh onRefresh={refreshData}>
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 md:p-7 lg:p-6 space-y-5 pb-24 md:pb-24 lg:pb-6">

              {/* ── Filter banner ── */}
              {(monthParam || filterParam) && (
                <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm ${filterParam === 'overdue' ? 'bg-destructive/10 border-destructive/25' : filterParam === 'this-week' ? 'bg-amber-500/10 border-amber-500/25' : 'bg-primary/10 border-primary/25'}`}>
                  <span className={`font-medium ${filterParam === 'overdue' ? 'text-destructive' : filterParam === 'this-week' ? 'text-amber-500' : 'text-primary'}`}>
                    {monthParam
                      ? `Showing deals closing in ${format(parseISO(`${monthParam}-01`), 'MMMM yyyy')}`
                      : filterParam === 'overdue'
                        ? 'Showing overdue active deals (past close date)'
                        : 'Showing deals closing this week'}
                  </span>
                  <button
                    onClick={() => window.history.replaceState({}, '', '/deals')}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear ×
                  </button>
                </div>
              )}

              {/* ── Stats Row ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
                {[
                  { label: 'Total', value: stats.totalDeals.toString(), sub: `${stats.active} active · ${stats.closed} closed` },
                  { label: 'Earned', value: formatCurrencyCompact(stats.closedNet), sub: `${stats.closed} closed deals` },
                  { label: 'Pipeline', value: formatCurrencyCompact(stats.activeNet), sub: `${stats.active} pending` },
                  { label: 'Listings', value: formatCurrencyCompact(stats.listingsNet), sub: `${stats.listings} total` },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, type: 'spring', stiffness: 240, damping: 28 }}
                    className="card-premium p-3.5 md:p-4 space-y-1 overflow-hidden"
                  >
                    <p className="metric-label">{stat.label}</p>
                    <p className="text-lg md:text-xl font-bold tracking-tight text-foreground leading-none">{stat.value}</p>
                    <p className="text-[10px] md:text-[11px] text-muted-foreground leading-tight line-clamp-2">{stat.sub}</p>
                  </motion.div>
                ))}
              </div>

              {/* ── Missing Info Banner ── */}
              {dealsWithMissingInfo.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => { triggerHaptic('light'); setShowMissingInfo(true); }}
                  className="w-full flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-left transition-colors hover:bg-amber-500/10"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {dealsWithMissingInfo.length} deal{dealsWithMissingInfo.length > 1 ? 's' : ''} missing info
                    </p>
                    <p className="text-xs text-muted-foreground">Tap to update lead source & buyer type</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                </motion.button>
              )}

              {/* ── Toolbar: Tabs + Search + Sort + Filter ── */}
              <div className="space-y-3">
                {/* Segmented Tabs */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border/40 w-fit">
                  {TABS.map(tab => {
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key)}
                        className={cn(
                          "relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 touch-manipulation",
                          isActive
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <span>{tab.label}</span>
                        <span className={cn(
                          "text-[10px] font-bold ml-0.5 min-w-[16px] text-center",
                          isActive ? "text-primary" : "text-muted-foreground/50"
                        )}>
                          {tabCounts[tab.key]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Search + Controls */}
                <div className="flex gap-2 items-center">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <Input
                      placeholder="Search address, client, MLS..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 h-10 rounded-lg bg-card border-border/50 text-sm placeholder:text-muted-foreground/40"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                    <SelectTrigger className="w-[110px] h-10 rounded-lg bg-card border-border/50 text-sm">
                      <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground/50" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg">
                      {SORT_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="text-sm">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      'h-10 w-10 rounded-lg border-border/50 bg-card',
                      hasActiveFilters && 'border-primary/40 bg-primary/5 text-primary'
                    )}
                    onClick={() => {
                      triggerHaptic('light');
                      setShowFilters(!showFilters);
                    }}
                  >
                    <Filter className="h-4 w-4" />
                  </Button>

                  <Link to="/deals/new">
                    <Button
                      size="sm"
                      className="h-10 rounded-lg gap-1.5 px-4 font-medium shadow-sm"
                      onClick={() => triggerHaptic('light')}
                    >
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">Add Deal</span>
                    </Button>
                  </Link>
                </div>

                {/* Filter Panel */}
                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-lg border border-border/50 bg-card p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-muted-foreground">Amount Range</span>
                          {hasActiveFilters && (
                            <button onClick={clearFilters} className="text-xs text-primary font-medium hover:underline">
                              Clear
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50">$</span>
                            <Input
                              type="number"
                              placeholder="Min"
                              value={minAmount}
                              onChange={(e) => setMinAmount(e.target.value)}
                              className="pl-7 h-9 text-sm rounded-lg"
                            />
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/50">$</span>
                            <Input
                              type="number"
                              placeholder="Max"
                              value={maxAmount}
                              onChange={(e) => setMaxAmount(e.target.value)}
                              className="pl-7 h-9 text-sm rounded-lg"
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Active filter chips */}
                {hasActiveFilters && !showFilters && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {minAmount && (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-primary/8 text-primary font-medium border border-primary/15">
                        Min: {formatCurrency(Number(minAmount))}
                        <button onClick={() => setMinAmount('')}><X className="h-3 w-3" /></button>
                      </span>
                    )}
                    {maxAmount && (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-primary/8 text-primary font-medium border border-primary/15">
                        Max: {formatCurrency(Number(maxAmount))}
                        <button onClick={() => setMaxAmount('')}><X className="h-3 w-3" /></button>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Results Header ── */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium">
                  {filteredDeals.length} {filteredDeals.length === 1 ? 'deal' : 'deals'}
                  {(search || hasActiveFilters) && ' found'}
                </p>
              </div>

              {/* ── Deal List grouped by month ── */}
              {filteredDeals.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest px-1">Grouped by Close Date</p>
                  {monthGroups.map(({ key, label, deals: groupDeals, totalPayout }) => {
                    const isCollapsed = collapsedMonths.has(key);
                    return (
                      <div key={key}>
                        <button
                          onClick={() => {
                            triggerHaptic('light');
                            setCollapsedMonths(prev => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            });
                          }}
                          className="w-full flex items-center justify-between px-1 py-2 group touch-manipulation"
                        >
                          <div className="flex items-center gap-2">
                            <motion.div
                              animate={{ rotate: isCollapsed ? -90 : 0 }}
                              transition={{ duration: 0.15 }}
                            >
                              <ChevronDown className="h-4 w-4 text-muted-foreground/60" />
                            </motion.div>
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              {label}
                            </span>
                            <span className="text-[10px] text-muted-foreground/50 font-medium">
                              {groupDeals.length} {groupDeals.length === 1 ? 'deal' : 'deals'}
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground">
                            {formatCurrency(totalPayout)}
                          </span>
                        </button>
                        <AnimatePresence initial={false}>
                          {!isCollapsed && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: 'easeInOut' }}
                              className="overflow-hidden"
                            >
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                {groupDeals.map((deal, idx) => (
                                  <Link key={deal.id} to={`/deals/${deal.id}`}>
                                    <SyncedDealCard deal={deal} index={idx} />
                                  </Link>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-20"
                >
                  <div className="w-12 h-12 rounded-xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                    {activeTab === 'active' ? <Building2 className="h-5 w-5 text-muted-foreground/40" /> :
                     activeTab === 'closed' ? <Home className="h-5 w-5 text-muted-foreground/40" /> :
                     <MapPin className="h-5 w-5 text-muted-foreground/40" />}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {search || hasActiveFilters ? 'No deals matching your filters' : `No ${activeTab} deals yet`}
                  </p>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" className="mt-2 text-primary text-xs" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </PullToRefresh>
      </div>
      <MissingInfoDialog
        open={showMissingInfo}
        onOpenChange={setShowMissingInfo}
        deals={dealsWithMissingInfo}
      />
    </AppLayout>
  );
}
