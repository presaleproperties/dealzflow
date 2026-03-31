import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ClientInventoryItem, useUpsertClientInventory, useDeleteClientInventory } from '@/hooks/useClientInventory';
import { useSyncedDeals } from '@/hooks/useSyncedDeals';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import {
  Mail, Phone, MapPin, Calendar, DollarSign, Building2, Home, Layers,
  Edit2, Trash2, AlertTriangle, User, Hash, FileText, Save, X, ExternalLink, Copy,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const PROPERTY_TYPES = ['Condo', 'Townhome', 'Detached Home', 'Presale'] as const;

const formSchema = z.object({
  buyer_name: z.string().min(1, 'Required').max(200),
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

const propertyTypeColor: Record<string, string> = {
  Condo: 'bg-info/10 text-info border-info/20',
  Townhome: 'bg-warning/10 text-warning border-warning/20',
  'Detached Home': 'bg-success/10 text-success border-success/20',
  Detached: 'bg-success/10 text-success border-success/20',
  Presale: 'bg-primary/10 text-primary border-primary/20',
};

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

interface Props {
  open: boolean;
  onClose: () => void;
  item: ClientInventoryItem | null;
}

export function ClientDetailSheet({ open, onClose, item }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const { deals } = useSyncedDeals();
  const upsert = useUpsertClientInventory();
  const deleteItem = useDeleteClientInventory();

  // Count deals for this client
  const clientDealCount = useMemo(() => {
    if (!item) return 0;
    const name = item.buyerName.toLowerCase().trim();
    if (name.length < 3) return 0; // Too short to match reliably
    // Split into parts for matching (first + last name)
    const nameParts = name.split(/\s+/).filter(p => p.length >= 2);
    return deals.filter(d => {
      const clientName = (d.clientName || '').toLowerCase().trim();
      const participants = d.participants.map(p =>
        [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase().trim()
      );
      // Exact or near-exact match only
      const exactMatch = clientName === name || participants.some(p => p === name);
      // Partial: all name parts must appear in clientName or a participant
      const allPartsMatch = nameParts.length >= 2 && (
        nameParts.every(part => clientName.includes(part)) ||
        participants.some(p => nameParts.every(part => p.includes(part)))
      );
      return exactMatch || allPartsMatch;
    }).length;
  }, [item, deals]);

  const { register, handleSubmit, control, formState: { errors }, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: item ? {
      buyer_name: item.buyerName || '',
      project_name: item.projectName || '',
      property_address: item.propertyAddress || '',
      purchase_date: item.purchaseDate || '',
      close_date: item.closeDate || '',
      close_date_est: item.closeDateEst || '',
      purchase_price: item.purchasePrice || '',
      property_type: item.propertyType || '',
      notes: item.notes || '',
    } : undefined,
  });

  const onSubmit = async (values: FormValues) => {
    if (!item) return;
    const isRealId = item.id && !item.id.startsWith('journey-') && !item.id.startsWith('synced-');
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
        synced_transaction_id: item.syncedTransactionId || undefined,
        journey_id: item.journeyId || undefined,
        is_manual: !item.syncedTransactionId,
      },
      existingId: isRealId ? item.id : undefined,
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!item) return;
    const isRealId = item.id && !item.id.startsWith('journey-') && !item.id.startsWith('synced-');
    if (item.isManual && isRealId) {
      deleteItem.mutate(item.id);
      onClose();
    }
  };

  if (!item) return null;

  const isClosed = item.dealStatus === 'closed';
  const isActive = item.dealStatus === 'active';
  const statusLabel = isClosed ? 'Closed' : isActive ? 'Active' : item.isManual ? 'Manual' : 'Pending';
  const statusColor = isClosed
    ? 'bg-success/10 text-success border-success/20'
    : isActive
      ? 'bg-primary/10 text-primary border-primary/20'
      : 'bg-muted text-muted-foreground border-border';
  const typeColor = item.propertyType ? (propertyTypeColor[item.propertyType] || 'bg-muted text-muted-foreground border-border') : '';

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { setIsEditing(false); onClose(); } }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto">
        {/* Hero Section */}
        <div className="relative px-6 pt-6 pb-5 border-b border-border/40">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-lg font-bold tracking-tight text-foreground pr-8">
              {item.buyerName}
            </SheetTitle>
          </SheetHeader>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-lg border", statusColor)}>
              {statusLabel}
            </span>
            {item.propertyType && (
              <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-lg border", typeColor)}>
                {item.propertyType}
              </span>
            )}
            {item.isPresale && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-accent/10 text-accent-foreground border-accent/20">
                Presale
              </span>
            )}
            {item.isPotentialDuplicate && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-warning/10 text-warning border-warning/20 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Duplicate
              </span>
            )}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-muted/30 border border-border/30 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Deals</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{clientDealCount}</p>
            </div>
            <div className="rounded-xl bg-muted/30 border border-border/30 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Price</p>
              <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(item.purchasePrice)}</p>
            </div>
            <div className="rounded-xl bg-muted/30 border border-border/30 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Commission</p>
              <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(item.commissionAmount)}</p>
            </div>
          </div>
        </div>

        {/* Contact Info Section */}
        <div className="px-6 py-4 border-b border-border/40">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact</h4>
          <div className="space-y-2.5">
            {item.clientEmail ? (
              <div className="flex items-center justify-between group">
                <a href={`mailto:${item.clientEmail}`} className="flex items-center gap-3 text-sm text-foreground hover:text-primary transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <span className="truncate">{item.clientEmail}</span>
                </a>
                <button
                  onClick={() => copyToClipboard(item.clientEmail!, 'Email')}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm text-muted-foreground/50">
                <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <span>No email on file</span>
              </div>
            )}

            {item.clientPhone ? (
              <div className="flex items-center justify-between group">
                <a href={`tel:${item.clientPhone}`} className="flex items-center gap-3 text-sm text-foreground hover:text-primary transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-primary" />
                  </div>
                  <span>{item.clientPhone}</span>
                </a>
                <button
                  onClick={() => copyToClipboard(item.clientPhone!, 'Phone')}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm text-muted-foreground/50">
                <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <span>No phone on file</span>
              </div>
            )}
          </div>
        </div>

        {/* Property Details — View or Edit mode */}
        {isEditing ? (
          <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4 space-y-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Edit Details</h4>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Buyer Name *</Label>
                <Input {...register('buyer_name')} />
                {errors.buyer_name && <p className="text-xs text-destructive">{errors.buyer_name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Property Type</Label>
                <Controller
                  control={control}
                  name="property_type"
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                      <SelectContent>
                        {PROPERTY_TYPES.map(pt => <SelectItem key={pt} value={pt}>{pt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Project Name</Label>
                <Input {...register('project_name')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Property Address</Label>
                <Input {...register('property_address')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Purchase / Firm Date</Label>
                  <Input type="date" {...register('purchase_date')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Close Date</Label>
                  <Input type="date" {...register('close_date')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Est. Close Date</Label>
                  <Input type="date" {...register('close_date_est')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Purchase Price</Label>
                  <Input type="number" {...register('purchase_price')} placeholder="0" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea {...register('notes')} rows={3} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => { setIsEditing(false); reset(); }} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={upsert.isPending} className="flex-1 gap-1.5">
                <Save className="w-3.5 h-3.5" />
                {upsert.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="px-6 py-4 border-b border-border/40">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Property Details</h4>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="gap-1.5 h-7 text-xs">
                <Edit2 className="w-3 h-3" />
                Edit
              </Button>
            </div>
            <div className="space-y-3">
              <DetailRow icon={MapPin} label="Address" value={item.propertyAddress} />
              <DetailRow icon={Building2} label="Project" value={item.projectName} />
              <DetailRow icon={DollarSign} label="Purchase Price" value={formatCurrency(item.purchasePrice)} />
              <DetailRow icon={Calendar} label="Purchase Date" value={formatDate(item.purchaseDate)} />
              <DetailRow icon={Calendar} label="Close Date" value={item.closeDate ? formatDate(item.closeDate) : item.closeDateEst ? `Est. ${formatDate(item.closeDateEst)}` : '—'} />
              {item.notes && <DetailRow icon={FileText} label="Notes" value={item.notes} />}
              {item.duplicateReason && (
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-warning/5 border border-warning/15">
                  <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-warning">Duplicate Flag</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.duplicateReason}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {!isEditing && (
          <div className="px-6 py-4 space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setIsEditing(true)}
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit All Details
            </Button>
            {item.isManual && item.id && !item.id.startsWith('journey-') && !item.id.startsWith('synced-') && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Property
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-muted/40 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground mt-0.5 break-words">{value || '—'}</p>
      </div>
    </div>
  );
}
