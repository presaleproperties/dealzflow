import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { AppLayout } from '@/components/layout/AppLayout';
import { useClientInventory, useUpsertClientInventory, useDeleteClientInventory, ClientInventoryItem } from '@/hooks/useClientInventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { Plus, Search, Building2, Home, Layers, Edit2, Trash2, MapPin, Calendar, DollarSign, AlertTriangle, ChevronDown, X, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';

const PROPERTY_TYPES = ['Condo', 'Townhome', 'Detached Home', 'Presale'] as const;
const QUICK_TYPES = ['Condo', 'Townhome', 'Detached'] as const;

const propertyTypeIcon = {
  Condo: Building2,
  Townhome: Layers,
  'Detached Home': Home,
  Detached: Home,
  Presale: Building2,
};

const propertyTypeColor: Record<string, string> = {
  Condo: 'bg-info/10 text-info border-info/20',
  Townhome: 'bg-warning/10 text-warning border-warning/20',
  'Detached Home': 'bg-success/10 text-success border-success/20',
  Detached: 'bg-success/10 text-success border-success/20',
  Presale: 'bg-primary/10 text-primary border-primary/20',
};

const formSchema = z.object({
  buyer_name: z.string().min(1, 'Buyer name is required').max(200),
  project_name: z.string().max(200).optional(),
  property_address: z.string().max(500).optional(),
  purchase_date: z.string().optional(),
  close_date: z.string().optional(),
  close_date_est: z.string().optional(),
  purchase_price: z.coerce.number().positive().optional().or(z.literal('')),
  property_type: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

type FormValues = z.infer<typeof formSchema>;

function formatCurrency(val: number | null | undefined): string {
  if (!val) return '—';
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(val);
}

function formatDate(val: string | null | undefined): string {
  if (!val) return '—';
  try { return format(new Date(val), 'MMM d, yyyy'); } catch { return val; }
}

// ─── Add/Edit Dialog ───────────────────────────────────────────────────────────
function InventoryDialog({
  open,
  onClose,
  item,
  syncedTransactionId,
  journeyId,
}: {
  open: boolean;
  onClose: () => void;
  item?: ClientInventoryItem | null;
  syncedTransactionId?: string | null;
  journeyId?: string | null;
}) {
  const upsert = useUpsertClientInventory();
  const isEditing = !!item?.id && !item.id.startsWith('journey-') && !item.id.startsWith('synced-');

  const { register, handleSubmit, control, formState: { errors }, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      buyer_name: item?.buyerName || '',
      project_name: item?.projectName || '',
      property_address: item?.propertyAddress || '',
      purchase_date: item?.purchaseDate || '',
      close_date: item?.closeDate || '',
      close_date_est: item?.closeDateEst || '',
      purchase_price: item?.purchasePrice || '',
      property_type: item?.propertyType || '',
      notes: item?.notes || '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    await upsert.mutateAsync({
      data: {
        buyer_name: values.buyer_name,
        project_name: values.project_name || undefined,
        property_address: values.property_address || undefined,
        purchase_date: values.purchase_date || undefined,
        close_date: values.close_date || undefined,
        close_date_est: values.close_date_est || undefined,
        purchase_price: values.purchase_price ? Number(values.purchase_price) : undefined,
        property_type: values.property_type || undefined,
        notes: values.notes || undefined,
        synced_transaction_id: syncedTransactionId || item?.syncedTransactionId || undefined,
        journey_id: journeyId || item?.journeyId || undefined,
        is_manual: !syncedTransactionId && !item?.syncedTransactionId,
      },
      existingId: isEditing ? item!.id : undefined,
    });
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {isEditing ? 'Edit Property' : syncedTransactionId ? 'Set Property Type' : 'Add Property'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label>Buyer Name *</Label>
              <Input {...register('buyer_name')} placeholder="e.g. John Smith" />
              {errors.buyer_name && <p className="text-xs text-destructive">{errors.buyer_name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Property Type</Label>
              <Controller
                control={control}
                name="property_type"
                render={({ field }) => (
                  <Select value={field.value || ''} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROPERTY_TYPES.map(pt => (
                        <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Project Name</Label>
              <Input {...register('project_name')} placeholder="e.g. The Pacific" />
            </div>

            <div className="space-y-1.5">
              <Label>Property Address</Label>
              <Input {...register('property_address')} placeholder="123 Main St, Vancouver" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Purchase / Firm Date</Label>
                <Input type="date" {...register('purchase_date')} />
              </div>
              <div className="space-y-1.5">
                <Label>Close Date</Label>
                <Input type="date" {...register('close_date')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Est. Close Date</Label>
                <Input type="date" {...register('close_date_est')} />
              </div>
              <div className="space-y-1.5">
                <Label>Purchase Price</Label>
                <Input type="number" {...register('purchase_price')} placeholder="0" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea {...register('notes')} placeholder="Any notes…" rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Property'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Quick Type Picker ─────────────────────────────────────────────────────────
function QuickTypePicker({ item }: { item: ClientInventoryItem }) {
  const [open, setOpen] = useState(false);
  const upsert = useUpsertClientInventory();

  const handleSelect = async (type: string) => {
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
      <PopoverTrigger asChild>
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
              onClick={() => handleSelect(t)}
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

// ─── Inventory Row ─────────────────────────────────────────────────────────────
function InventoryRow({ item, index, onEdit, onDelete }: {
  item: ClientInventoryItem;
  index: number;
  onEdit: () => void;
  onDelete?: () => void;
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
      <div className={cn(
        "flex items-center gap-4 px-5 py-4 border-b border-border/40 last:border-b-0",
        "hover:bg-muted/25 transition-colors duration-150",
      )}>

        {/* Status dot */}
        <div className="shrink-0 w-2 h-2 rounded-full mt-0.5" style={{
          backgroundColor: isClosed
            ? 'hsl(var(--success))'
            : isActive
              ? 'hsl(var(--primary))'
              : 'hsl(var(--muted-foreground) / 0.4)',
        }} />

        {/* Primary: name + address */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm text-foreground leading-snug">
              {item.buyerName}
            </span>
            {item.isPotentialDuplicate && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    <p className="font-semibold text-warning mb-0.5">Potential Duplicate</p>
                    <p>{item.duplicateReason || 'This entry may already exist in your ReZen sync.'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
            {(item.propertyAddress || item.projectName) && (
              <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-0 truncate">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{item.propertyAddress || item.projectName}</span>
              </span>
            )}
            {dateDisplay && (
              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                <Calendar className="w-3 h-3" />
                {dateDisplay}
              </span>
            )}
          </div>
        </div>

        {/* Property type badge */}
        <div className="shrink-0 hidden sm:block">
          <QuickTypePicker item={item} />
        </div>

        {/* Price */}
        <div className="shrink-0 text-right hidden sm:block w-28">
          {item.purchasePrice ? (
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {formatCurrency(item.purchasePrice)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/40">No price</span>
          )}
        </div>

        {/* Status badge */}
        <div className="shrink-0 hidden md:block w-16 text-right">
          {isClosed ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-success/10 text-success border border-success/20">
              Closed
            </span>
          ) : isActive ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
              Active
            </span>
          ) : item.isManual ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
              Manual
            </span>
          ) : null}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          {item.isManual && onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ClientInventoryPage() {
  const { allItems, isLoading } = useClientInventory();
  const deleteItem = useDeleteClientInventory();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ClientInventoryItem | null>(null);

  const filtered = useMemo(() => {
    return allItems.filter(item => {
      const q = search.toLowerCase();
      const matchSearch = !q || [
        item.buyerName,
        item.projectName,
        item.propertyAddress,
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

  const openEdit = (item: ClientInventoryItem) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const openAdd = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };

  const hasActiveFilters = filterType !== 'all' || filterStatus !== 'all' || !!search;

  const clearFilters = () => {
    setSearch('');
    setFilterType('all');
    setFilterStatus('all');
  };

  return (
    <AppLayout>
      <Header
        title="Client Inventory"
        subtitle="All properties you've helped clients buy"
        showAddDeal={false}
        action={
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Property</span>
          </Button>
        }
      />

      <div className="p-5 md:p-7 lg:p-6 space-y-5 pb-24 lg:pb-8">

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
                placeholder="Search buyer, address, project…"
                className="pl-9 h-10 rounded-lg bg-card border-border/50 text-sm placeholder:text-muted-foreground/40"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
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

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {filtered.length} of {totalCount} shown
              </span>
              <button
                onClick={clearFilters}
                className="text-xs text-primary font-medium hover:underline ml-1"
              >
                Clear filters
              </button>
            </div>
          )}
          {!hasActiveFilters && (
            <p className="text-xs text-muted-foreground">{totalCount} properties</p>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="card-premium overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border/30 last:border-b-0 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-muted shrink-0" />
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
              {hasActiveFilters
                ? 'Try adjusting your filters'
                : 'Properties from your ReZen deals will appear here automatically'}
            </p>
            {!hasActiveFilters && (
              <Button size="sm" onClick={openAdd} variant="outline" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Add manually
              </Button>
            )}
          </div>
        ) : (
          <motion.div
            className="card-premium overflow-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Table header — desktop only */}
            <div className="hidden md:flex items-center gap-4 px-5 py-2.5 border-b border-border/40 bg-muted/20">
              <div className="w-2 shrink-0" />
              <div className="flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Buyer / Property
                </span>
              </div>
              <div className="w-20 shrink-0 hidden sm:block" />
              <div className="w-28 shrink-0 hidden sm:block text-right">
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Price
                </span>
              </div>
              <div className="w-16 shrink-0 hidden md:block text-right">
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Status
                </span>
              </div>
              <div className="w-14 shrink-0" />
            </div>

            <AnimatePresence>
              {filtered.map((item, index) => (
                <InventoryRow
                  key={item.id}
                  item={item}
                  index={index}
                  onEdit={() => openEdit(item)}
                  onDelete={item.isManual ? () => {
                    if (!item.id.startsWith('journey-') && !item.id.startsWith('synced-'))
                      deleteItem.mutate(item.id);
                  } : undefined}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      <InventoryDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingItem(null); }}
        item={editingItem}
      />
    </AppLayout>
  );
}
