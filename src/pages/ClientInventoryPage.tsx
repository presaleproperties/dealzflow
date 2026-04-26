import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { AppLayout } from '@/components/layout/AppLayout';
import { useClientInventory, useUpsertClientInventory, useDeleteClientInventory, ClientInventoryItem } from '@/hooks/useClientInventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { Plus, Search, Building2, Home, Layers, MapPin, Calendar, DollarSign, AlertTriangle, ChevronDown, X, Mail, Phone, ChevronRight, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { ClientDetailSheet } from '@/components/inventory/ClientDetailSheet';

const PROPERTY_TYPES = ['Condo', 'Townhome', 'Detached Home', 'Presale'] as const;
const QUICK_TYPES = ['Condo', 'Townhome', 'Detached'] as const;

const propertyTypeColor: Record<string, string> = {
  Condo: 'bg-info/10 text-info border-info/20',
  Townhome: 'bg-warning/10 text-warning border-warning/20',
  'Detached Home': 'bg-success/10 text-success border-success/20',
  Detached: 'bg-success/10 text-success border-success/20',
  Presale: 'bg-primary/10 text-primary border-primary/20',
};

function formatCurrency(val: number | null | undefined): string {
  if (!val) return '—';
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(val);
}

function formatDate(val: string | null | undefined): string {
  if (!val) return '—';
  try { return format(new Date(val), 'MMM d, yyyy'); } catch { return val; }
}

// ─── Quick Type Picker ─────────────────────────────────────────────────────────
function QuickTypePicker({ item }: { item: ClientInventoryItem }) {
  const [open, setOpen] = useState(false);
  const upsert = useUpsertClientInventory();

  const handleSelect = async (e: React.MouseEvent, type: string) => {
    e.stopPropagation();
    setOpen(false);
    await upsert.mutateAsync({
      data: {
        buyer_name: item.buyerName,
        property_type: type,
        synced_transaction_id: item.syncedTransactionId || undefined,
        journey_id: item.journeyId || undefined,
        is_manual: !item.syncedTransactionId,
      },
      existingId: item.id && !item.id.startsWith('journey-') && !item.id.startsWith('synced-') ? item.id : undefined,
    });
  };

  const typeColor = item.propertyType
    ? (propertyTypeColor[item.propertyType] || 'bg-muted/50 text-muted-foreground border-border')
    : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {item.propertyType ? (
          <button className={cn(
            "flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors hover:opacity-80",
            typeColor
          )}>
            {item.propertyType}
            <ChevronDown className="w-2.5 h-2.5 opacity-50" />
          </button>
        ) : (
          <button className="text-[10px] font-medium px-2 py-0.5 rounded-md border border-dashed border-muted-foreground/30 text-muted-foreground/60 hover:text-primary hover:border-primary/40 transition-colors">
            + type
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1.5" align="start" side="bottom">
        <div className="flex gap-1">
          {QUICK_TYPES.map(t => (
            <button
              key={t}
              onClick={(e) => handleSelect(e, t)}
              disabled={upsert.isPending}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                item.propertyType === t || (t === 'Detached' && item.propertyType === 'Detached Home')
                  ? propertyTypeColor[t]
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Inventory Row (Redesigned — clickable, prominent contact) ─────────────────
function InventoryRow({ item, index, onClick }: {
  item: ClientInventoryItem;
  index: number;
  onClick: () => void;
}) {
  const isClosed = item.dealStatus === 'closed';
  const isActive = item.dealStatus === 'active';

  const dateDisplay = item.closeDate
    ? formatDate(item.closeDate)
    : item.closeDateEst
      ? `Est. ${formatDate(item.closeDateEst)}`
      : item.purchaseDate
        ? formatDate(item.purchaseDate)
        : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.3), duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="group"
    >
      <button
        onClick={onClick}
        className={cn(
          "w-full text-left flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-border/40 last:border-b-0",
          "hover:bg-muted/30 active:bg-muted/40 transition-colors duration-150 cursor-pointer",
        )}
      >
        {/* Avatar / Initial */}
        <div className={cn(
          "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold",
          isClosed ? 'bg-success/10 text-success' : isActive ? 'bg-primary/10 text-primary' : 'bg-muted/60 text-muted-foreground',
        )}>
          {item.buyerName.charAt(0).toUpperCase()}
        </div>

        {/* Primary: name + contact + address */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm text-foreground leading-snug truncate">
              {item.buyerName}
            </span>
            {item.isPotentialDuplicate && (
              <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
            )}
          </div>

          {/* Contact + address row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
            {item.clientEmail && (
              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                <Mail className="w-3 h-3 text-primary/60" />
                <span className="truncate max-w-[140px] sm:max-w-[180px]">{item.clientEmail}</span>
              </span>
            )}
            {item.clientPhone && (
              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                <Phone className="w-3 h-3 text-primary/60" />
                {item.clientPhone}
              </span>
            )}
            {(item.propertyAddress || item.projectName) && (
              <span className="text-xs text-muted-foreground/70 flex items-center gap-1 min-w-0 truncate">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{item.propertyAddress || item.projectName}</span>
              </span>
            )}
          </div>

          {/* Date + price on mobile */}
          <div className="flex items-center gap-3 mt-1 sm:hidden">
            {dateDisplay && (
              <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" />
                {dateDisplay}
              </span>
            )}
            {item.purchasePrice ? (
              <span className="text-[11px] font-semibold text-foreground/80 tabular-nums">
                {formatCurrency(item.purchasePrice)}
              </span>
            ) : null}
          </div>
        </div>

        {/* Property type badge — desktop */}
        <div className="shrink-0 hidden sm:block" onClick={(e) => e.stopPropagation()}>
          <QuickTypePicker item={item} />
        </div>

        {/* Date — desktop */}
        <div className="shrink-0 text-right hidden sm:block w-24">
          {dateDisplay ? (
            <span className="text-xs text-muted-foreground">{dateDisplay}</span>
          ) : (
            <span className="text-xs text-muted-foreground/30">No date</span>
          )}
        </div>

        {/* Price — desktop */}
        <div className="shrink-0 text-right hidden sm:block w-24">
          {item.purchasePrice ? (
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {formatCurrency(item.purchasePrice)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/30">No price</span>
          )}
        </div>

        {/* Status badge — desktop */}
        <div className="shrink-0 hidden md:block w-16 text-right">
          {isClosed ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-success/10 text-success border border-success/20">Closed</span>
          ) : isActive ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">Active</span>
          ) : item.isManual ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">Manual</span>
          ) : null}
        </div>

        {/* Arrow */}
        <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0 group-hover:text-muted-foreground transition-colors" />
      </button>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ClientInventoryPage() {
  const { allItems, isLoading } = useClientInventory();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<ClientInventoryItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = useMemo(() => {
    return allItems.filter(item => {
      const q = search.toLowerCase();
      const matchSearch = !q || [
        item.buyerName, item.projectName, item.propertyAddress, item.clientEmail, item.clientPhone,
      ].some(v => v?.toLowerCase().includes(q));
      const matchType = filterType === 'all' || item.propertyType === filterType;
      const matchStatus = filterStatus === 'all' ||
        (filterStatus === 'active' && item.dealStatus === 'active') ||
        (filterStatus === 'closed' && item.dealStatus === 'closed') ||
        (filterStatus === 'manual' && item.isManual) ||
        (filterStatus === 'duplicate' && item.isPotentialDuplicate === true);
      return matchSearch && matchType && matchStatus;
    });
  }, [allItems, search, filterType, filterStatus]);

  const totalCount = allItems.length;
  const closedCount = allItems.filter(i => i.dealStatus === 'closed').length;
  const activeCount = allItems.filter(i => i.dealStatus === 'active').length;
  const totalValue = allItems.reduce((sum, i) => sum + (i.purchasePrice || 0), 0);

  const openDetail = (item: ClientInventoryItem) => {
    setSelectedItem(item);
    setSheetOpen(true);
  };

  const hasActiveFilters = filterType !== 'all' || filterStatus !== 'all' || !!search;
  const clearFilters = () => { setSearch(''); setFilterType('all'); setFilterStatus('all'); };

  return (
    <AppLayout>
      <Header
        title="Client Inventory"
        subtitle="All properties you've helped clients buy"
        showAddDeal={false}
      />

      <div className="p-5 md:p-7 lg:p-6 space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {[
            { label: 'Total', value: totalCount.toString() },
            { label: 'Active', value: activeCount.toString() },
            { label: 'Closed', value: closedCount.toString() },
            { label: 'Portfolio Value', value: formatCurrency(totalValue) },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="card-premium p-3.5 space-y-1"
            >
              <p className="metric-label">{stat.label}</p>
              <p className="text-lg font-bold tracking-tight text-foreground">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Search + Filters */}
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search buyer, email, phone, address…"
                className="pl-9 h-10 rounded-lg bg-card border-border/50 text-sm placeholder:text-muted-foreground/40"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[120px] h-10 rounded-lg bg-card border-border/50 text-sm shrink-0">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="duplicate">⚠ Duplicates</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[110px] h-10 rounded-lg bg-card border-border/50 text-sm shrink-0 hidden sm:flex">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {PROPERTY_TYPES.map(pt => <SelectItem key={pt} value={pt}>{pt}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">{filtered.length} of {totalCount} shown</span>
              <button onClick={clearFilters} className="text-xs text-primary font-medium hover:underline ml-1">Clear filters</button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{totalCount} properties · tap any row to view details</p>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="card-premium overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border/30 last:border-b-0 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-muted shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted/60 rounded w-1/2" />
                </div>
                <div className="h-5 bg-muted rounded w-16 hidden sm:block" />
                <div className="h-4 bg-muted rounded w-20 hidden sm:block" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
              <Home className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-foreground">No properties found</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              {hasActiveFilters ? 'Try adjusting your filters' : 'Properties from your ReZen deals will appear here automatically'}
            </p>
          </div>
        ) : (
          <motion.div
            className="card-premium overflow-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Table header — desktop */}
            <div className="hidden sm:flex items-center gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/20">
              <div className="w-10 shrink-0" />
              <div className="flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Client / Contact</span>
              </div>
              <div className="w-20 shrink-0" />
              <div className="w-24 shrink-0 text-right">
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Date</span>
              </div>
              <div className="w-24 shrink-0 text-right">
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Price</span>
              </div>
              <div className="w-16 shrink-0 hidden md:block text-right">
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Status</span>
              </div>
              <div className="w-4 shrink-0" />
            </div>

            <AnimatePresence>
              {filtered.map((item, index) => (
                <InventoryRow
                  key={item.id}
                  item={item}
                  index={index}
                  onClick={() => openDetail(item)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      <ClientDetailSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setSelectedItem(null); }}
        item={selectedItem}
      />
    </AppLayout>
  );
}
