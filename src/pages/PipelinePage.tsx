import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useRefreshData } from '@/hooks/useRefreshData';
import { usePipelineProspects, useAddProspect, useUpdateProspect, useDeleteProspect, PipelineProspect } from '@/hooks/usePipelineProspects';
import { formatCurrency } from '@/lib/format';
import { Plus, Trash2, ChevronRight, GripVertical, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { ProspectSheet } from '@/components/pipeline/ProspectSheet';

const HOME_TYPES = ['Condo', 'Townhome', 'Detached House', 'Semi-Detached', 'Duplex', 'Pre-Sale Condo', 'Pre-Sale Townhome', 'Land', 'Commercial', 'Listings'];
const LEAD_SOURCES = ['Instagram', 'TikTok', 'Facebook Ads', 'YouTube', 'Referral', 'Team', 'Past Client'];

const BUYER_STATUS_OPTIONS = ['active', 'in-contract', 'pending-mortgage', 'closed', 'lost'] as const;
const BUYER_STATUS_LABELS: Record<string, string> = {
  active: 'Active', 'in-contract': 'In Contract', 'pending-mortgage': 'Pending Mortgage', closed: 'Closed', lost: 'Lost',
};

const LISTING_STATUS_OPTIONS = ['want-to-sell', 'active-listing', 'in-contract-listing', 'sold', 'listing-lost'] as const;
const LISTING_STATUS_LABELS: Record<string, string> = {
  'want-to-sell': 'Want to Sell', 'active-listing': 'Active', 'in-contract-listing': 'In Contract', sold: 'Sold', 'listing-lost': 'Lost',
};

const STATUS_LABELS: Record<string, string> = { ...BUYER_STATUS_LABELS, ...LISTING_STATUS_LABELS };

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-primary/[0.12] text-primary',
  'in-contract': 'bg-amber-500/[0.12] text-amber-600 dark:text-amber-400',
  'pending-mortgage': 'bg-orange-500/[0.12] text-orange-600 dark:text-orange-400',
  closed: 'bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400',
  lost: 'bg-destructive/[0.12] text-destructive',
  'want-to-sell': 'bg-violet-500/[0.12] text-violet-600 dark:text-violet-400',
  'active-listing': 'bg-violet-500/[0.15] text-violet-600 dark:text-violet-400',
  'in-contract-listing': 'bg-amber-500/[0.12] text-amber-600 dark:text-amber-400',
  sold: 'bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400',
  'listing-lost': 'bg-destructive/[0.12] text-destructive',
};

const TEMP_OPTIONS = ['hot', 'warm', 'cold'];
const TEMP_LABELS: Record<string, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };

type SortField = 'temperature' | 'potential_commission' | 'created_at' | null;
type SortDir = 'asc' | 'desc';
type PipelineCategory = 'presale' | 'resale' | 'buyer' | 'closed' | 'lost';

const TEMP_ORDER: Record<string, number> = { hot: 0, warm: 1, cold: 2 };

const PIPELINE_PILLS: { key: PipelineCategory; label: string }[] = [
  { key: 'presale', label: 'Pre-Sale' },
  { key: 'resale', label: 'Re-Sale' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'closed', label: 'Closed Deals' },
  { key: 'lost', label: 'Lost Deals' },
];

function isPresale(p: PipelineProspect) {
  const ht = (p.home_type || '').toLowerCase();
  return ht.includes('pre-sale') || ht === 'presale';
}

function isListingProspect(p: PipelineProspect) {
  return (p.deal_type === 'seller') || (LISTING_STATUS_OPTIONS as readonly string[]).includes(p.status);
}

function filterByCategory(prospects: PipelineProspect[], cat: PipelineCategory): PipelineProspect[] {
  switch (cat) {
    case 'presale':
      return prospects.filter(p => isPresale(p) && !['closed', 'lost', 'sold', 'listing-lost'].includes(p.status));
    case 'resale':
      return prospects.filter(p => !isPresale(p) && !isListingProspect(p) && !['closed', 'lost'].includes(p.status));
    case 'buyer':
      return prospects.filter(p => !['closed', 'lost', 'sold', 'listing-lost'].includes(p.status));
    case 'closed':
      return prospects.filter(p => ['closed', 'sold'].includes(p.status));
    case 'lost':
      return prospects.filter(p => ['lost', 'listing-lost'].includes(p.status));
  }
}

function sortProspects(items: PipelineProspect[], field: SortField, dir: SortDir): PipelineProspect[] {
  if (!field) return items;
  return [...items].sort((a, b) => {
    let cmp = 0;
    if (field === 'temperature') cmp = (TEMP_ORDER[a.temperature || 'warm'] ?? 1) - (TEMP_ORDER[b.temperature || 'warm'] ?? 1);
    else if (field === 'potential_commission') cmp = Number(a.potential_commission) - Number(b.potential_commission);
    else if (field === 'created_at') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return dir === 'asc' ? cmp : -cmp;
  });
}

// ── Inline editable cell ─────────────────────────────────────────────
function InlineCell({
  value, isEditing, onStartEdit, onSave, type = 'text', options, optionLabels, className, placeholder,
}: {
  value: string | number | null; isEditing: boolean; onStartEdit: () => void;
  onSave: (val: string) => void; type?: 'text' | 'number' | 'select';
  options?: string[]; optionLabels?: Record<string, string>; className?: string; placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const [draft, setDraft] = useState(String(value ?? ''));

  useEffect(() => {
    if (isEditing) { setDraft(String(value ?? '')); setTimeout(() => ref.current?.focus(), 0); }
  }, [isEditing, value]);

  const commit = () => onSave(draft);

  if (isEditing) {
    if (type === 'select' && options) {
      return (
        <select ref={ref as React.RefObject<HTMLSelectElement>} value={draft}
          onChange={(e) => { const v = e.target.value; setDraft(v); requestAnimationFrame(() => onSave(v)); }}
          className="w-full h-full bg-card border-0 outline-none ring-2 ring-primary/40 rounded-lg px-3 py-2 text-sm font-medium" >
          {options.map(o => <option key={o} value={o}>{optionLabels?.[o] || o}</option>)}
        </select>
      );
    }
    return (
      <input ref={ref as React.RefObject<HTMLInputElement>} type={type} value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onSave(String(value ?? '')); }}
        placeholder={placeholder}
        className="w-full h-full bg-card border-0 outline-none ring-2 ring-primary/40 rounded-lg px-3 py-2 text-sm" />
    );
  }

  return (
    <div onClick={onStartEdit} className={cn("px-3 py-2.5 text-sm cursor-text truncate min-h-[40px] flex items-center", className)}>
      {value != null && value !== '' ? value : <span className="text-muted-foreground/30 italic text-xs">{placeholder || '—'}</span>}
    </div>
  );
}

// ── Quick-add row ────────────────────────────────────────────────────
function QuickAddRow({ onAdd, activeCategory }: {
  onAdd: (data: { client_name: string; home_type: string; potential_commission: number; temperature: string; deal_type: string; status: string }) => void;
  activeCategory: PipelineCategory;
}) {
  const [name, setName] = useState('');
  const [commission, setCommission] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const defaults = useMemo(() => {
    switch (activeCategory) {
      case 'presale': return { home_type: 'Pre-Sale Condo', deal_type: 'buyer', status: 'active' };
      case 'resale': return { home_type: 'Detached House', deal_type: 'buyer', status: 'active' };
      default: return { home_type: 'Detached House', deal_type: 'buyer', status: 'active' };
    }
  }, [activeCategory]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({
      client_name: name.trim(),
      home_type: defaults.home_type,
      potential_commission: parseFloat(commission) || 0,
      temperature: 'warm',
      deal_type: defaults.deal_type,
      status: defaults.status,
    });
    setName(''); setCommission('');
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  if (activeCategory === 'closed' || activeCategory === 'lost') return null;

  return (
    <div className="flex items-center gap-2.5 px-4 py-3 border-t border-dashed border-border/20">
      <span className="text-[10px] font-semibold text-muted-foreground/20 uppercase tracking-wider shrink-0">+</span>
      <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        placeholder="Add a lead..."
        className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground/20 min-w-0" />
      <input type="number" value={commission} onChange={(e) => setCommission(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        placeholder="$0" className="hidden sm:block w-20 bg-transparent border-0 outline-none text-sm text-right placeholder:text-muted-foreground/20" />
      <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs text-primary font-semibold shrink-0" onClick={handleSubmit} disabled={!name.trim()}>Add</Button>
    </div>
  );
}

// ── Sort column header ───────────────────────────────────────────────
function SortHeader({ label, field, sortField, sortDir, onSort, className }: {
  label: string; field: SortField; sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void; className?: string;
}) {
  const active = sortField === field;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button onClick={() => onSort(field)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
        active ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground/60", className
      )}>
      {label}
      <Icon className={cn("h-2.5 w-2.5 shrink-0", active ? "opacity-100" : "opacity-40")} />
    </button>
  );
}

// ── Mobile prospect card ─────────────────────────────────────────────
function MobileProspectCard({ p, idx, handleSave, onOpen, isArchived, restoreStatus }: {
  p: PipelineProspect; idx: number;
  handleSave: (id: string, field: string, value: string) => void;
  onOpen: (p: PipelineProspect) => void;
  isArchived?: boolean;
  restoreStatus?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-4 border-b border-border/15 transition-colors cursor-pointer active:bg-primary/[0.04]",
        idx % 2 === 0 ? 'bg-card' : 'bg-card/60',
      )}
      onClick={() => { onOpen(p); triggerHaptic('light'); }}
    >
      <div className="flex-1 min-w-0">
        <p className={cn("text-[15px] font-bold truncate leading-snug", isArchived ? "text-muted-foreground/50 line-through" : "text-foreground")}>
          {p.client_name}
        </p>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground/50 font-medium">{p.home_type}</span>
          <span className="w-px h-3 bg-border/30 shrink-0" />
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap", STATUS_COLORS[p.status] || STATUS_COLORS.active)}>
            {STATUS_LABELS[p.status] || p.status}
          </span>
          {p.source && (
            <>
              <span className="w-px h-3 bg-border/30 shrink-0" />
              <span className="text-[10px] text-muted-foreground/35 truncate max-w-[80px]">{p.source}</span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className={cn("text-[15px] font-bold tabular-nums", p.potential_commission > 0 ? "text-primary" : "text-muted-foreground/25")}>
          {p.potential_commission > 0 ? formatCurrency(p.potential_commission) : '—'}
        </p>
      </div>

      {isArchived && restoreStatus ? (
        <button
          onClick={(e) => { e.stopPropagation(); handleSave(p.id, 'status', restoreStatus); triggerHaptic('light'); }}
          className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
      ) : (
        <ChevronRight className="shrink-0 h-4 w-4 text-muted-foreground/15 ml-1" />
      )}
    </div>
  );
}

// ── Desktop table row ────────────────────────────────────────────────
function DesktopProspectRow({ p, idx, isEditing, setEditingCell, handleSave, deleteProspect, onOpen, isArchived, restoreStatus }: {
  p: PipelineProspect; idx: number;
  isEditing: (id: string, field: string) => boolean;
  setEditingCell: (cell: { id: string; field: string } | null) => void;
  handleSave: (id: string, field: string, value: string) => void;
  deleteProspect: { mutate: (id: string) => void };
  onOpen: (p: PipelineProspect) => void;
  isArchived?: boolean;
  restoreStatus?: string;
}) {
  const statusOpts = isListingProspect(p) ? LISTING_STATUS_OPTIONS : BUYER_STATUS_OPTIONS;
  const statusLabels = isListingProspect(p) ? LISTING_STATUS_LABELS : BUYER_STATUS_LABELS;

  return (
    <div
      className={cn(
        "hidden lg:grid items-stretch border-b border-border/20 group transition-colors cursor-default",
        "grid-cols-[minmax(160px,2.5fr)_minmax(100px,1.2fr)_minmax(100px,1fr)_100px_minmax(90px,1fr)_minmax(80px,1fr)_minmax(100px,1.5fr)_36px]",
        idx % 2 === 0 ? 'bg-card' : 'bg-card/60',
        'hover:bg-primary/[0.03]'
      )}
    >
      <div className="cursor-pointer hover:bg-primary/[0.02] transition-colors" onClick={() => { onOpen(p); triggerHaptic('light'); }}>
        <div className="px-4 py-3.5 text-[13px] font-semibold truncate flex items-center gap-2.5 min-h-[48px] leading-tight">
          {isArchived && <span className="text-muted-foreground/40 line-through">{p.client_name}</span>}
          {!isArchived && (p.client_name || <span className="text-muted-foreground/25 italic font-normal">Unnamed</span>)}
        </div>
      </div>

      <div className="border-l border-border/10" onClick={(e) => e.stopPropagation()}>
        {isEditing(p.id, 'home_type') ? (
          <InlineCell value={p.home_type} isEditing onStartEdit={() => {}} onSave={(v) => handleSave(p.id, 'home_type', v)} type="select" options={HOME_TYPES} />
        ) : (
          <div onClick={() => setEditingCell({ id: p.id, field: 'home_type' })} className="px-3 py-3.5 text-[12px] font-medium text-muted-foreground/60 cursor-pointer min-h-[48px] flex items-center hover:text-foreground/80 transition-colors">{p.home_type}</div>
        )}
      </div>

      <div className="border-l border-border/10" onClick={(e) => e.stopPropagation()}>
        {isEditing(p.id, 'potential_commission') ? (
          <InlineCell value={p.potential_commission} isEditing onStartEdit={() => {}} onSave={(v) => handleSave(p.id, 'potential_commission', v)} type="number" />
        ) : (
          <div onClick={() => setEditingCell({ id: p.id, field: 'potential_commission' })} className="px-3 py-3.5 text-[13px] font-bold text-primary tabular-nums cursor-text min-h-[48px] flex items-center">{formatCurrency(p.potential_commission)}</div>
        )}
      </div>

      <div className="border-l border-border/10" onClick={(e) => e.stopPropagation()}>
        {isEditing(p.id, 'status') ? (
          <InlineCell value={p.status} isEditing onStartEdit={() => {}} onSave={(v) => handleSave(p.id, 'status', v)} type="select" options={[...statusOpts]} optionLabels={statusLabels} />
        ) : (
          <div onClick={() => setEditingCell({ id: p.id, field: 'status' })} className="px-2.5 py-3.5 cursor-pointer flex items-center min-h-[48px]">
            <span className={cn("text-[10px] font-bold px-2 py-1 rounded-md capitalize whitespace-nowrap", STATUS_COLORS[p.status] || STATUS_COLORS.active)}>
              {STATUS_LABELS[p.status] || p.status}
            </span>
          </div>
        )}
      </div>

      <div className="border-l border-border/10" onClick={(e) => e.stopPropagation()}>
        <InlineCell value={p.source} isEditing={isEditing(p.id, 'source')} onStartEdit={() => setEditingCell({ id: p.id, field: 'source' })} onSave={(v) => handleSave(p.id, 'source', v)} type="select" options={['', ...LEAD_SOURCES]} optionLabels={{ '': '—' }} placeholder="—" className="text-[12px] text-muted-foreground/50" />
      </div>

      <div className="border-l border-border/10" onClick={(e) => e.stopPropagation()}>
        <InlineCell value={p.budget != null ? formatCurrency(p.budget) : null} isEditing={isEditing(p.id, 'budget')} onStartEdit={() => setEditingCell({ id: p.id, field: 'budget' })} onSave={(v) => handleSave(p.id, 'budget', v)} type="number" placeholder="—" className="text-[12px] font-semibold tabular-nums" />
      </div>

      <div className="border-l border-border/10" onClick={(e) => e.stopPropagation()}>
        <InlineCell value={p.notes} isEditing={isEditing(p.id, 'notes')} onStartEdit={() => setEditingCell({ id: p.id, field: 'notes' })} onSave={(v) => handleSave(p.id, 'notes', v)} placeholder="Add notes…" className="text-[12px] text-muted-foreground/40" />
      </div>

      <div className="border-l border-border/10 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {isArchived && restoreStatus ? (
          <button onClick={() => { handleSave(p.id, 'status', restoreStatus); triggerHaptic('light'); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20">
            <Undo2 className="h-3 w-3" />
          </button>
        ) : (
          <button onClick={() => deleteProspect.mutate(p.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground/20 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ── Main Page ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
export default function PipelinePage() {
  const { data: prospects = [], isLoading } = usePipelineProspects();
  const addProspect = useAddProspect();
  const updateProspect = useUpdateProspect();
  const deleteProspect = useDeleteProspect();
  const refreshData = useRefreshData();
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [activeCategory, setActiveCategory] = useState<PipelineCategory>(() =>
    (localStorage.getItem('pipeline-category') as PipelineCategory) || 'buyer'
  );
  const [selectedProspect, setSelectedProspect] = useState<PipelineProspect | null>(null);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = useCallback((field: SortField) => {
    triggerHaptic('light');
    setSortField(prev => { if (prev === field) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); return field; } setSortDir('desc'); return field; });
  }, []);

  const handleSheetSave = useCallback((id: string, updates: Partial<PipelineProspect>) => { updateProspect.mutate({ id, ...updates } as any); }, [updateProspect]);
  const handleSheetDelete = useCallback((id: string) => { deleteProspect.mutate(id); }, [deleteProspect]);

  // Pill counts
  const pillCounts = useMemo(() => {
    const counts: Record<PipelineCategory, number> = { presale: 0, resale: 0, buyer: 0, closed: 0, lost: 0 };
    PIPELINE_PILLS.forEach(pill => { counts[pill.key] = filterByCategory(prospects, pill.key).length; });
    return counts;
  }, [prospects]);

  // Filtered & sorted list
  const filteredProspects = useMemo(() => {
    const list = filterByCategory(prospects, activeCategory);
    return sortProspects([...list].reverse(), sortField, sortDir);
  }, [prospects, activeCategory, sortField, sortDir]);

  const totalGCI = useMemo(() => filteredProspects.reduce((s, p) => s + Number(p.potential_commission), 0), [filteredProspects]);

  const handleSave = useCallback((id: string, field: string, value: string) => {
    setEditingCell(null);
    const prospect = prospects.find(p => p.id === id);
    if (!prospect) return;
    let parsed: any = value;
    if (field === 'potential_commission') parsed = parseFloat(value) || 0;
    if (field === 'budget') parsed = parseFloat(value) || null;
    if (String((prospect as any)[field]) === String(parsed)) return;
    requestAnimationFrame(() => { updateProspect.mutate({ id, [field]: parsed } as any); });
  }, [prospects, updateProspect]);

  const handleAdd = (data: any) => { addProspect.mutate(data as any); };
  const isEditing = (id: string, field: string) => editingCell?.id === id && editingCell?.field === field;
  const isArchived = activeCategory === 'closed' || activeCategory === 'lost';
  const restoreStatus = activeCategory === 'closed' ? 'active' : activeCategory === 'lost' ? 'active' : undefined;

  const switchCategory = (cat: PipelineCategory) => {
    triggerHaptic('light');
    setActiveCategory(cat);
    localStorage.setItem('pipeline-category', cat);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <Header title="Pipeline" showAddDeal={false} />
        <div className="p-5 lg:p-6 space-y-5">
          <div className="flex gap-2">{[1,2,3,4,5].map(i => <div key={i} className="h-10 w-24 bg-muted/20 rounded-xl animate-pulse" />)}</div>
          <div className="rounded-2xl border border-border/15 bg-card p-5 animate-pulse">
            <div className="space-y-2"><div className="h-3 w-24 bg-muted/30 rounded" /><div className="h-7 w-32 bg-muted/30 rounded-lg" /></div>
          </div>
          {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-muted/10 animate-pulse" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Pipeline" subtitle={`${filteredProspects.length} leads`} showAddDeal={false} />
      <PullToRefresh onRefresh={refreshData} className="min-h-[calc(100vh-56px)]">
        <div className="p-5 lg:p-6 space-y-5">

          {/* ── Category Pills ── */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {PIPELINE_PILLS.map(pill => {
              const isActive = activeCategory === pill.key;
              return (
                <button
                  key={pill.key}
                  onClick={() => switchCategory(pill.key)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap shrink-0",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "bg-card border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/50"
                  )}
                >
                  {pill.label}
                  <span className={cn(
                    "text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md min-w-[20px] text-center",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted/40 text-muted-foreground/50"
                  )}>
                    {pillCounts[pill.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Stats Bar ── */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/40 mb-1">
                {isArchived ? 'Total Value' : 'Pipeline GCI'}
              </p>
              <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground">{formatCurrency(totalGCI)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/40 mb-1">Leads</p>
              <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground">{filteredProspects.length}</p>
            </div>
          </div>

          {/* ── List Container ── */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="rounded-2xl border border-border/20 bg-card overflow-hidden shadow-sm"
            >
              {/* Column headers — desktop */}
              <div className="hidden lg:grid bg-muted/30 border-b border-border/20 grid-cols-[minmax(160px,2.5fr)_minmax(100px,1.2fr)_minmax(100px,1fr)_100px_minmax(90px,1fr)_minmax(80px,1fr)_minmax(100px,1.5fr)_36px]">
                <div className="px-4 py-3 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.08em]">Client</div>
                <div className="px-3 py-3 border-l border-border/10 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.08em]">Property</div>
                <div className="px-3 py-3 border-l border-border/10 flex items-center">
                  <SortHeader label="Est. GCI" field="potential_commission" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                </div>
                <div className="px-3 py-3 border-l border-border/10 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.08em]">Status</div>
                <div className="px-3 py-3 border-l border-border/10 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.08em]">Source</div>
                <div className="px-3 py-3 border-l border-border/10 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.08em]">Budget</div>
                <div className="px-3 py-3 border-l border-border/10 flex items-center">
                  <SortHeader label="Notes" field="created_at" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                </div>
                <div />
              </div>

              {filteredProspects.length === 0 ? (
                <div className="px-4 py-16 text-center">
                  <p className="text-sm text-muted-foreground/30 font-medium">
                    {isArchived ? `No ${activeCategory} deals yet` : 'No leads in this category'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile */}
                  <div className="lg:hidden">
                    {filteredProspects.map((p, idx) => (
                      <MobileProspectCard key={p.id} p={p} idx={idx} handleSave={handleSave} onOpen={setSelectedProspect}
                        isArchived={isArchived} restoreStatus={restoreStatus} />
                    ))}
                  </div>
                  {/* Desktop */}
                  <AnimatePresence mode="popLayout">
                    {filteredProspects.map((p, idx) => (
                      <motion.div key={p.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.12 }}>
                        <DesktopProspectRow p={p} idx={idx} isEditing={isEditing} setEditingCell={setEditingCell}
                          handleSave={handleSave} deleteProspect={deleteProspect} onOpen={setSelectedProspect}
                          isArchived={isArchived} restoreStatus={restoreStatus} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </>
              )}

              <QuickAddRow onAdd={handleAdd} activeCategory={activeCategory} />
            </motion.div>
          </AnimatePresence>
        </div>
      </PullToRefresh>

      <ProspectSheet prospect={selectedProspect} onClose={() => setSelectedProspect(null)} onSave={handleSheetSave} onDelete={handleSheetDelete} />
    </AppLayout>
  );
}
