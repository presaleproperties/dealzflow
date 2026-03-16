import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame, Thermometer, Snowflake, Trash2, Save, User, DollarSign, Home, Tag, StickyNote, TrendingUp, Radio } from 'lucide-react';
import { PipelineProspect } from '@/hooks/usePipelineProspects';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { formatCurrency } from '@/lib/format';

const LEAD_SOURCES = ['Instagram', 'TikTok', 'Facebook Ads', 'YouTube', 'Referral', 'Team', 'Open House', 'Cold Call', 'Website', 'Past Client', 'Other'];
const HOME_TYPES = ['Presale', 'Condo', 'Townhome', 'Detached', 'Listings'];

// ── Buyer statuses ─────────────────────────────────────────────────
const BUYER_STATUS_OPTIONS = ['active', 'in-contract', 'pending-mortgage', 'closed', 'lost'] as const;
const BUYER_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  'in-contract': 'In Contract',
  'pending-mortgage': 'Pending Mortgage',
  closed: 'Closed',
  lost: 'Lost',
};
const BUYER_STATUS_COLORS: Record<string, string> = {
  active: 'bg-primary/15 text-primary border-primary/30',
  'in-contract': 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  'pending-mortgage': 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  closed: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  lost: 'bg-destructive/15 text-destructive border-destructive/30',
};

// ── Listing statuses ───────────────────────────────────────────────
const LISTING_STATUS_OPTIONS = ['want-to-sell', 'active-listing', 'pending-mortgage', 'in-contract-listing', 'sold', 'listing-lost'] as const;
const LISTING_STATUS_LABELS: Record<string, string> = {
  'want-to-sell': 'Want to Sell',
  'active-listing': 'Active',
  'pending-mortgage': 'Pending Mortgage',
  'in-contract-listing': 'In Contract',
  sold: 'Sold',
  'listing-lost': 'Lost',
};
const LISTING_STATUS_COLORS: Record<string, string> = {
  'want-to-sell': 'bg-violet-500/15 text-violet-500 border-violet-500/30',
  'active-listing': 'bg-violet-500/15 text-violet-600 border-violet-500/30',
  'pending-mortgage': 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  'in-contract-listing': 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  sold: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  'listing-lost': 'bg-destructive/15 text-destructive border-destructive/30',
};

const ALL_STATUS_LABELS = { ...BUYER_STATUS_LABELS, ...LISTING_STATUS_LABELS };
const ALL_STATUS_COLORS = { ...BUYER_STATUS_COLORS, ...LISTING_STATUS_COLORS };

const DEAL_TYPE_OPTIONS = ['buyer', 'seller'] as const;

const TEMP_CONFIG = {
  hot:  { icon: Flame,       color: 'bg-rose-500/15 text-rose-500 border-rose-500/30',   label: 'Hot',  dot: 'bg-rose-500' },
  warm: { icon: Thermometer, color: 'bg-amber-500/15 text-amber-600 border-amber-500/30', label: 'Warm', dot: 'bg-amber-500' },
  cold: { icon: Snowflake,   color: 'bg-sky-500/15 text-sky-500 border-sky-500/30',       label: 'Cold', dot: 'bg-sky-500' },
};

interface Props {
  prospect: PipelineProspect | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<PipelineProspect>) => void;
  onDelete: (id: string) => void;
}

function FieldLabel({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">{label}</span>
    </div>
  );
}

function isListingLead(p: Partial<PipelineProspect>): boolean {
  return p.deal_type === 'seller' || (LISTING_STATUS_OPTIONS as readonly string[]).includes(p.status || '');
}

export function ProspectSheet({ prospect, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<Partial<PipelineProspect>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (prospect) {
      setDraft({ ...prospect });
      setIsDirty(false);
      setConfirmDelete(false);
    }
  }, [prospect]);

  const set = <K extends keyof PipelineProspect>(key: K, value: PipelineProspect[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    if (!prospect) return;
    onSave(prospect.id, draft);
    triggerHaptic('medium');
    onClose();
  };

  const handleDelete = () => {
    if (!prospect) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete(prospect.id);
    triggerHaptic('heavy');
    onClose();
  };

  const tempKey = (draft.temperature || 'warm') as keyof typeof TEMP_CONFIG;
  const tc = TEMP_CONFIG[tempKey] || TEMP_CONFIG.warm;
  const TempIcon = tc.icon;

  const isListing = isListingLead(draft);
  const statusOptions = isListing ? LISTING_STATUS_OPTIONS : BUYER_STATUS_OPTIONS;
  const statusLabels = isListing ? LISTING_STATUS_LABELS : BUYER_STATUS_LABELS;
  const statusColors = isListing ? LISTING_STATUS_COLORS : BUYER_STATUS_COLORS;

  // Default status when switching deal type
  const handleDealTypeChange = (dealType: string) => {
    set('deal_type', dealType as any);
    if (dealType === 'seller') {
      // Switch to listing statuses if current status is a buyer status
      if (!LISTING_STATUS_OPTIONS.includes(draft.status as any)) {
        set('status', 'want-to-sell' as any);
      }
    } else {
      // Switch to buyer statuses if current is a listing status
      if (LISTING_STATUS_OPTIONS.includes(draft.status as any)) {
        set('status', 'active' as any);
      }
    }
  };

  const currentStatus = draft.status || (isListing ? 'want-to-sell' : 'active');
  const statusColor = ALL_STATUS_COLORS[currentStatus] || ALL_STATUS_COLORS.active;
  const statusLabel = ALL_STATUS_LABELS[currentStatus] || currentStatus;

  return (
    <AnimatePresence>
      {prospect && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="fixed bottom-0 left-0 right-0 z-50 md:left-auto md:right-4 md:bottom-4 md:w-[440px] md:rounded-2xl rounded-t-2xl overflow-hidden"
            style={{ boxShadow: '0 -4px 40px hsl(var(--foreground) / 0.12)' }}
          >
            <div
              className="flex flex-col max-h-[88vh] md:max-h-[92vh]"
              style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border) / 0.5)' }}
            >
              {/* Drag handle (mobile) */}
              <div className="flex justify-center pt-3 pb-1 md:hidden">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
              </div>

              {/* Header */}
              <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border/30">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-0.5">
                    {isListing ? 'Listing Profile' : 'Lead Profile'}
                  </p>
                  <h2 className="text-lg font-bold tracking-tight truncate">{draft.client_name || 'Unnamed Lead'}</h2>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border", tc.color)}>
                      <TempIcon className="h-2.5 w-2.5" />
                      {tc.label}
                    </span>
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize", statusColor)}>
                      {statusLabel}
                    </span>
                    {(draft.potential_commission || 0) > 0 && (
                      <span className="text-[11px] font-bold text-primary">{formatCurrency(draft.potential_commission || 0)}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable form */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

                {/* Client name */}
                <div>
                  <FieldLabel icon={User} label="Client Name" />
                  <input
                    value={draft.client_name || ''}
                    onChange={e => set('client_name', e.target.value)}
                    placeholder="Full name..."
                    className="w-full px-3 py-2.5 rounded-xl bg-muted/30 border border-border/40 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all placeholder:text-muted-foreground/30"
                  />
                </div>

                {/* Commission */}
                <div>
                  <FieldLabel icon={DollarSign} label="Estimated Commission" />
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/50 font-medium">$</span>
                    <input
                      type="number"
                      value={draft.potential_commission ?? ''}
                      onChange={e => set('potential_commission', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-muted/30 border border-border/40 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all placeholder:text-muted-foreground/30"
                    />
                  </div>
                </div>

                {/* Home type + Deal type — side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel icon={Home} label="Property Type" />
                    <select
                      value={draft.home_type || 'Detached'}
                      onChange={e => set('home_type', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-muted/30 border border-border/40 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    >
                      {HOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel icon={Tag} label="Deal Type" />
                    <select
                      value={draft.deal_type || 'buyer'}
                      onChange={e => handleDealTypeChange(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-muted/30 border border-border/40 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    >
                      {DEAL_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                </div>

                {/* Temperature */}
                <div>
                  <FieldLabel icon={TempIcon} label="Temperature" />
                  <div className="flex gap-2">
                    {(Object.entries(TEMP_CONFIG) as [string, typeof TEMP_CONFIG.hot][]).map(([key, cfg]) => {
                      const Icon = cfg.icon;
                      const isSelected = (draft.temperature || 'warm') === key;
                      return (
                        <button
                          key={key}
                          onClick={() => { set('temperature', key); triggerHaptic('light'); }}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border transition-all",
                            isSelected ? cfg.color : "bg-muted/20 text-muted-foreground/40 border-border/30 hover:bg-muted/40"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Status — context-aware */}
                <div>
                  <FieldLabel icon={TrendingUp} label="Status" />
                  <div className="grid grid-cols-3 gap-1.5">
                    {statusOptions.map(s => {
                      const isSelected = currentStatus === s;
                      const color = statusColors[s] || statusColors[Object.keys(statusColors)[0]];
                      return (
                        <button
                          key={s}
                          onClick={() => {
                            set('status', s as any);
                            triggerHaptic('light');
                          }}
                          className={cn(
                            "flex items-center justify-center px-2 py-2 rounded-xl text-[11px] font-semibold border transition-all",
                            isSelected ? color : "bg-muted/20 text-muted-foreground/40 border-border/30 hover:bg-muted/40"
                          )}
                        >
                          {statusLabels[s]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Source */}
                <div>
                  <FieldLabel icon={Radio} label="Lead Source" />
                  <div className="flex flex-wrap gap-1.5">
                    {LEAD_SOURCES.map(s => {
                      const isSelected = (draft.source || '') === s;
                      return (
                        <button
                          key={s}
                          onClick={() => { set('source', isSelected ? '' : s); triggerHaptic('light'); }}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all",
                            isSelected
                              ? "bg-primary/15 text-primary border-primary/30"
                              : "bg-muted/20 text-muted-foreground/50 border-border/30 hover:bg-muted/40"
                          )}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Budget / List Price */}
                <div>
                  <FieldLabel icon={DollarSign} label={isListing ? 'List Price' : 'Budget'} />
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/50 font-medium">$</span>
                    <input
                      type="number"
                      value={draft.budget ?? ''}
                      onChange={e => set('budget', parseFloat(e.target.value) || null as any)}
                      placeholder="0"
                      className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-muted/30 border border-border/40 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all placeholder:text-muted-foreground/30"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <FieldLabel icon={StickyNote} label="Notes" />
                  <textarea
                    value={draft.notes || ''}
                    onChange={e => set('notes', e.target.value)}
                    placeholder="Add context, next steps..."
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-xl bg-muted/30 border border-border/40 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all placeholder:text-muted-foreground/30"
                  />
                </div>
              </div>

              {/* Footer actions */}
              <div className="px-5 py-4 border-t border-border/30 flex items-center gap-2.5">
                <button
                  onClick={handleDelete}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all",
                    confirmDelete
                      ? "bg-destructive text-destructive-foreground border-destructive"
                      : "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20"
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {confirmDelete ? 'Confirm Delete' : 'Delete'}
                </button>
                {confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-muted/50 text-muted-foreground border border-border/30"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={!isDirty}
                  className={cn(
                    "ml-auto flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
                    isDirty
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "bg-muted/40 text-muted-foreground/40 cursor-not-allowed"
                  )}
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Changes
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
