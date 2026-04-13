import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useRefreshData } from '@/hooks/useRefreshData';
import { usePipelineProspects, useAddProspect, useUpdateProspect, useDeleteProspect, PipelineProspect } from '@/hooks/usePipelineProspects';
import { formatCurrency } from '@/lib/format';
import { Plus, Trash2, List, LayoutGrid, ChevronRight, GripVertical, ChevronDown, X, ArrowUpDown, ArrowUp, ArrowDown, Undo2 } from 'lucide-react';
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

const STATUS_OPTIONS = [...BUYER_STATUS_OPTIONS, ...LISTING_STATUS_OPTIONS] as const;
const STATUS_LABELS: Record<string, string> = { ...BUYER_STATUS_LABELS, ...LISTING_STATUS_LABELS };

const STATUS_DOT_COLORS: Record<string, string> = {
  active: 'bg-primary', 'in-contract': 'bg-amber-500', 'pending-mortgage': 'bg-orange-500',
  closed: 'bg-emerald-500', lost: 'bg-destructive',
  'want-to-sell': 'bg-violet-400', 'active-listing': 'bg-violet-500',
  'in-contract-listing': 'bg-amber-500', sold: 'bg-emerald-500', 'listing-lost': 'bg-destructive',
};

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

const TEMP_CONFIG: Record<string, { label: string; text: string; border: string }> = {
  hot:  { label: 'Hot',  text: 'text-foreground', border: 'border-l-border' },
  warm: { label: 'Warm', text: 'text-foreground', border: 'border-l-border' },
  cold: { label: 'Cold', text: 'text-foreground', border: 'border-l-border' },
};
const TEMP_OPTIONS = ['hot', 'warm', 'cold'];

type ViewMode = 'list' | 'board';
type PageTab = 'buyers' | 'listings';
type SortField = 'temperature' | 'potential_commission' | 'created_at' | null;
type SortDir = 'asc' | 'desc';

const TEMP_ORDER: Record<string, number> = { hot: 0, warm: 1, cold: 2 };

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

function isListingProspect(p: PipelineProspect) {
  return (p.deal_type === 'seller') || (LISTING_STATUS_OPTIONS as readonly string[]).includes(p.status);
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
function QuickAddRow({ onAdd, defaultDealType, defaultHomeType, defaultStatus }: {
  onAdd: (data: { client_name: string; home_type: string; potential_commission: number; temperature: string; deal_type: string; status: string }) => void;
  defaultDealType?: string; defaultHomeType?: string; defaultStatus?: string;
}) {
  const [name, setName] = useState('');
  const [commission, setCommission] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({
      client_name: name.trim(), home_type: defaultHomeType || 'Detached',
      potential_commission: parseFloat(commission) || 0, temperature: 'warm',
      deal_type: defaultDealType || 'buyer', status: defaultStatus || (defaultDealType === 'seller' ? 'want-to-sell' : 'active'),
    });
    setName(''); setCommission('');
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  return (
    <div className="flex items-center gap-2.5 px-4 py-3 bg-muted/5 border-t border-dashed border-border/30">
      <span className="text-[10px] font-semibold text-muted-foreground/25 uppercase tracking-wider shrink-0">+</span>
      <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        placeholder="Add a lead..."
        className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground/25 min-w-0" />
      <input type="number" value={commission} onChange={(e) => setCommission(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        placeholder="$0" className="hidden sm:block w-20 bg-transparent border-0 outline-none text-sm text-right placeholder:text-muted-foreground/25" />
      <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs text-primary font-semibold shrink-0" onClick={handleSubmit} disabled={!name.trim()}>Add</Button>
    </div>
  );
}

// ── Temperature dot indicator ────────────────────────────────────────
function TempDot({ temp, size = 'sm', interactive, onToggle }: {
  temp: string; size?: 'sm' | 'md'; interactive?: boolean; onToggle?: () => void;
}) {
  const cfg = TEMP_CONFIG[temp] || TEMP_CONFIG.warm;
  const sizeClass = size === 'md' ? 'w-8 h-8' : 'w-7 h-7';
  const dotSize = size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2';

  if (interactive) {
    return (
      <button onClick={onToggle} className={cn(sizeClass, "rounded-lg flex items-center justify-center transition-all hover:scale-110", cfg.bg)}>
        <span className={cn(dotSize, "rounded-full", cfg.dot)} />
      </button>
    );
  }
  return (
    <div className={cn(sizeClass, "rounded-lg flex items-center justify-center shrink-0", cfg.bg)}>
      <span className={cn(dotSize, "rounded-full", cfg.dot)} />
    </div>
  );
}

// ── Mobile prospect card ─────────────────────────────────────────────
function MobileProspectCard({ p, idx, handleSave, onOpen }: {
  p: PipelineProspect; idx: number;
  handleSave: (id: string, field: string, value: string) => void;
  onOpen: (p: PipelineProspect) => void;
}) {
  const tc = TEMP_CONFIG[p.temperature || 'warm'] || TEMP_CONFIG.warm;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-4 border-b border-border/30 border-l-[3px] transition-colors cursor-pointer active:bg-primary/[0.04]",
        tc.border, idx % 2 === 0 ? 'bg-card' : 'bg-muted/[0.04]',
      )}
      onClick={() => { onOpen(p); triggerHaptic('light'); }}
    >
      <TempDot temp={p.temperature || 'warm'} interactive onToggle={() => {
        const next = TEMP_OPTIONS[(TEMP_OPTIONS.indexOf(p.temperature || 'warm') + 1) % TEMP_OPTIONS.length];
        handleSave(p.id, 'temperature', next);
        triggerHaptic('light');
      }} />

      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold truncate leading-snug text-foreground">{p.client_name}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-[11px] text-muted-foreground/60 font-medium">{p.home_type}</span>
          <span className="w-px h-3 bg-border/40 shrink-0" />
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap", STATUS_COLORS[p.status] || STATUS_COLORS.active)}>
            {STATUS_LABELS[p.status] || p.status}
          </span>
          {p.source && (
            <>
              <span className="w-px h-3 bg-border/40 shrink-0" />
              <span className="text-[10px] text-muted-foreground/40 truncate max-w-[80px]">{p.source}</span>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className={cn("text-[15px] font-bold tabular-nums", p.potential_commission > 0 ? "text-primary" : "text-muted-foreground/30")}>
          {p.potential_commission > 0 ? formatCurrency(p.potential_commission) : '—'}
        </p>
        {p.budget != null && p.budget > 0 && (
          <p className="text-[10px] text-muted-foreground/40 mt-0.5 tabular-nums">{formatCurrency(p.budget)}</p>
        )}
      </div>
      <ChevronRight className="shrink-0 h-4 w-4 text-muted-foreground/20 ml-1" />
    </div>
  );
}

// ── Desktop table row ────────────────────────────────────────────────
function DesktopProspectRow({ p, idx, isEditing, setEditingCell, handleSave, deleteProspect, onOpen, showBudgetAsListPrice, statusOptions, statusLabels }: {
  p: PipelineProspect; idx: number;
  isEditing: (id: string, field: string) => boolean;
  setEditingCell: (cell: { id: string; field: string } | null) => void;
  handleSave: (id: string, field: string, value: string) => void;
  deleteProspect: { mutate: (id: string) => void };
  onOpen: (p: PipelineProspect) => void;
  showBudgetAsListPrice?: boolean;
  statusOptions?: readonly string[];
  statusLabels?: Record<string, string>;
}) {
  const tc = TEMP_CONFIG[p.temperature || 'warm'] || TEMP_CONFIG.warm;
  const sOpts = statusOptions || BUYER_STATUS_OPTIONS;
  const sLabels = statusLabels || BUYER_STATUS_LABELS;

  return (
    <div
      draggable
      onDragStart={(e: any) => { e.dataTransfer?.setData('prospect-id', p.id); e.currentTarget.style.opacity = '0.4'; }}
      onDragEnd={(e: any) => { e.currentTarget.style.opacity = '1'; }}
      className={cn(
        "hidden lg:grid items-stretch border-b border-border/40 group transition-colors cursor-default",
        "grid-cols-[28px_minmax(140px,2fr)_48px_minmax(80px,1fr)_minmax(90px,1fr)_96px_minmax(80px,1fr)_minmax(80px,1fr)_minmax(100px,1.2fr)_34px]",
        "border-l-[3px]", tc.border,
        idx % 2 === 0 ? 'bg-card' : 'bg-muted/20',
        'hover:bg-primary/[0.04]'
      )}
    >
      <div className="flex items-center justify-center text-muted-foreground/15 group-hover:text-muted-foreground/40 cursor-grab active:cursor-grabbing transition-colors" onClick={(e) => e.stopPropagation()}>
        <GripVertical className="h-3.5 w-3.5" />
      </div>

      <div className="border-l border-border/20 cursor-pointer hover:bg-primary/[0.02] transition-colors" onClick={() => { onOpen(p); triggerHaptic('light'); }}>
        <div className="px-3 py-3.5 text-[13px] font-semibold truncate flex items-center gap-2 min-h-[48px] leading-tight">
          {p.client_name || <span className="text-muted-foreground/30 italic font-normal">Unnamed</span>}
        </div>
      </div>

      <div className="border-l border-border/20 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <TempDot temp={p.temperature || 'warm'} interactive onToggle={() => {
          const next = TEMP_OPTIONS[(TEMP_OPTIONS.indexOf(p.temperature || 'warm') + 1) % TEMP_OPTIONS.length];
          handleSave(p.id, 'temperature', next);
          triggerHaptic('light');
        }} />
      </div>

      <div className="border-l border-border/20" onClick={(e) => e.stopPropagation()}>
        {isEditing(p.id, 'home_type') ? (
          <InlineCell value={p.home_type} isEditing onStartEdit={() => {}} onSave={(v) => handleSave(p.id, 'home_type', v)} type="select" options={HOME_TYPES} />
        ) : (
          <div onClick={() => setEditingCell({ id: p.id, field: 'home_type' })} className="px-3 py-3.5 text-[12px] font-medium text-muted-foreground/70 cursor-pointer min-h-[48px] flex items-center hover:text-foreground transition-colors">{p.home_type}</div>
        )}
      </div>

      <div className="border-l border-border/20" onClick={(e) => e.stopPropagation()}>
        {isEditing(p.id, 'potential_commission') ? (
          <InlineCell value={p.potential_commission} isEditing onStartEdit={() => {}} onSave={(v) => handleSave(p.id, 'potential_commission', v)} type="number" />
        ) : (
          <div onClick={() => setEditingCell({ id: p.id, field: 'potential_commission' })} className="px-3 py-3.5 text-[13px] font-bold text-primary tabular-nums cursor-text min-h-[48px] flex items-center">{formatCurrency(p.potential_commission)}</div>
        )}
      </div>

      <div className="border-l border-border/20" onClick={(e) => e.stopPropagation()}>
        {isEditing(p.id, 'status') ? (
          <InlineCell value={p.status} isEditing onStartEdit={() => {}} onSave={(v) => handleSave(p.id, 'status', v)} type="select" options={[...sOpts]} optionLabels={sLabels} />
        ) : (
          <div onClick={() => setEditingCell({ id: p.id, field: 'status' })} className="px-2.5 py-3.5 cursor-pointer flex items-center min-h-[48px]">
            <span className={cn("text-[10px] font-bold px-2 py-1 rounded-md capitalize whitespace-nowrap", STATUS_COLORS[p.status] || STATUS_COLORS.active)}>
              {STATUS_LABELS[p.status] || p.status}
            </span>
          </div>
        )}
      </div>

      <div className="border-l border-border/20" onClick={(e) => e.stopPropagation()}>
        <InlineCell value={p.source} isEditing={isEditing(p.id, 'source')} onStartEdit={() => setEditingCell({ id: p.id, field: 'source' })} onSave={(v) => handleSave(p.id, 'source', v)} type="select" options={['', ...LEAD_SOURCES]} optionLabels={{ '': '—' }} placeholder="—" className="text-[12px] text-muted-foreground/60" />
      </div>

      <div className="border-l border-border/20" onClick={(e) => e.stopPropagation()}>
        <InlineCell value={p.budget != null ? formatCurrency(p.budget) : null} isEditing={isEditing(p.id, 'budget')} onStartEdit={() => setEditingCell({ id: p.id, field: 'budget' })} onSave={(v) => handleSave(p.id, 'budget', v)} type="number" placeholder="—" className="text-[12px] font-semibold tabular-nums" />
      </div>

      <div className="border-l border-border/20" onClick={(e) => e.stopPropagation()}>
        <InlineCell value={p.notes} isEditing={isEditing(p.id, 'notes')} onStartEdit={() => setEditingCell({ id: p.id, field: 'notes' })} onSave={(v) => handleSave(p.id, 'notes', v)} placeholder="Add notes…" className="text-[12px] text-muted-foreground/50" />
      </div>

      <div className="border-l border-border/20 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => deleteProspect.mutate(p.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground/30 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
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
        active ? "text-primary" : "text-muted-foreground/35 hover:text-muted-foreground/60", className
      )}>
      {label}
      <Icon className={cn("h-2.5 w-2.5 shrink-0", active ? "opacity-100" : "opacity-40")} />
    </button>
  );
}

// ── Section with collapsible temp groups ─────────────────────────────
function PipelineSection({ group, prospects, tempFilter, sortField, sortDir, onSort, isEditing, setEditingCell, handleSave, handleAdd, deleteProspect, onOpen, statusOptions, statusLabels }: {
  group: { key: string; label: string; defaultDealType: string; defaultHomeType: string; accentColor: string; dotColor: string; filter: (p: PipelineProspect) => boolean; defaultStatus?: string };
  prospects: PipelineProspect[]; tempFilter: string | null; sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void;
  isEditing: (id: string, field: string) => boolean;
  setEditingCell: (cell: { id: string; field: string } | null) => void;
  handleSave: (id: string, field: string, value: string) => void;
  handleAdd: (data: any) => void;
  deleteProspect: { mutate: (id: string) => void };
  onOpen: (p: PipelineProspect) => void;
  statusOptions?: readonly string[];
  statusLabels?: Record<string, string>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const baseItems = [...prospects].reverse().filter(group.filter);
  const filteredItems = tempFilter ? baseItems.filter(p => (p.temperature || 'warm') === tempFilter) : baseItems;
  const sortedItems = sortProspects(filteredItems, sortField, sortDir);
  const groupGCI = sortedItems.reduce((s, p) => s + Number(p.potential_commission), 0);

  const useTempGroups = !sortField;
  const tempGroups = useTempGroups ? [
    { temp: 'hot', items: sortedItems.filter(p => (p.temperature || 'warm') === 'hot') },
    { temp: 'warm', items: sortedItems.filter(p => (p.temperature || 'warm') === 'warm') },
    { temp: 'cold', items: sortedItems.filter(p => (p.temperature || 'warm') === 'cold') },
  ].filter(tg => tg.items.length > 0) : [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className="rounded-2xl border border-border/40 bg-card overflow-hidden">
      <button onClick={() => setCollapsed(c => !c)} className="w-full flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/5">
        <div className={cn("w-2 h-2 rounded-full shrink-0", group.dotColor)} />
        <h3 className="text-[14px] font-bold tracking-tight">{group.label}</h3>
        <span className="text-[11px] text-muted-foreground/40 font-medium tabular-nums">
          {sortedItems.length}{tempFilter && baseItems.length !== sortedItems.length ? ` / ${baseItems.length}` : ''}
        </span>
        <div className="flex-1" />
        <span className="text-sm font-bold text-primary tabular-nums">{formatCurrency(groupGCI)}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground/30 transition-transform duration-200", collapsed && "-rotate-90")} />
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            {/* Column headers — desktop */}
            <div className="hidden lg:grid bg-muted/40 border-t border-b border-border/40 grid-cols-[28px_minmax(140px,2fr)_48px_minmax(80px,1fr)_minmax(90px,1fr)_96px_minmax(80px,1fr)_minmax(80px,1fr)_minmax(100px,1.2fr)_34px]">
              <div className="px-2 py-3" />
              <div className="px-3 py-3 border-l border-border/20 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.08em]">Client</div>
              <div className="px-2 py-3 border-l border-border/20 flex items-center justify-center">
                <SortHeader label="" field="temperature" sortField={sortField} sortDir={sortDir} onSort={onSort} />
              </div>
              <div className="px-3 py-3 border-l border-border/20 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.08em]">Property</div>
              <div className="px-3 py-3 border-l border-border/20 flex items-center">
                <SortHeader label="Est. GCI" field="potential_commission" sortField={sortField} sortDir={sortDir} onSort={onSort} />
              </div>
              <div className="px-3 py-3 border-l border-border/20 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.08em]">Status</div>
              <div className="px-3 py-3 border-l border-border/20 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.08em]">Source</div>
              <div className="px-3 py-3 border-l border-border/20 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.08em]">{group.defaultDealType === 'seller' ? 'List Price' : 'Budget'}</div>
              <div className="px-3 py-3 border-l border-border/20 flex items-center">
                <SortHeader label="Added" field="created_at" sortField={sortField} sortDir={sortDir} onSort={onSort} />
              </div>
              <div />
            </div>

            {sortedItems.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-xs text-muted-foreground/25">No leads{tempFilter ? ` matching "${TEMP_CONFIG[tempFilter]?.label}" filter` : ''}</p>
              </div>
            ) : sortField ? (
              <>
                <div className="lg:hidden">
                  {sortedItems.map((p, idx) => <MobileProspectCard key={p.id} p={p} idx={idx} handleSave={handleSave} onOpen={onOpen} />)}
                </div>
                <AnimatePresence mode="popLayout">
                  {sortedItems.map((p, idx) => (
                    <motion.div key={p.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.12 }}>
                      <DesktopProspectRow p={p} idx={idx} isEditing={isEditing} setEditingCell={setEditingCell}
                        handleSave={handleSave} deleteProspect={deleteProspect} onOpen={onOpen}
                        showBudgetAsListPrice={group.defaultDealType === 'seller'} statusOptions={statusOptions} statusLabels={statusLabels} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </>
            ) : (
              tempGroups.map(tg => {
                const cfg = TEMP_CONFIG[tg.temp] || TEMP_CONFIG.warm;
                return (
                  <div key={tg.temp}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData('prospect-id');
                      if (id) { handleSave(id, 'temperature', tg.temp); triggerHaptic('light'); }
                    }}>
                    <div className="flex items-center gap-2.5 px-4 py-2.5 border-t border-border/30 bg-muted/20">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dot)} />
                      <span className={cn("text-[10px] font-bold uppercase tracking-[0.1em]", cfg.text)}>{cfg.label}</span>
                      <div className="flex-1 h-px bg-border/30" />
                      <span className="text-[10px] font-medium text-muted-foreground/40 tabular-nums">{tg.items.length}</span>
                    </div>
                    <div className="lg:hidden">
                      {tg.items.map((p, idx) => <MobileProspectCard key={p.id} p={p} idx={idx} handleSave={handleSave} onOpen={onOpen} />)}
                    </div>
                    <AnimatePresence mode="popLayout">
                      {tg.items.map((p, idx) => (
                        <motion.div key={p.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.12 }}>
                          <DesktopProspectRow p={p} idx={idx} isEditing={isEditing} setEditingCell={setEditingCell}
                            handleSave={handleSave} deleteProspect={deleteProspect} onOpen={onOpen}
                            showBudgetAsListPrice={group.defaultDealType === 'seller'} statusOptions={statusOptions} statusLabels={statusLabels} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                );
              })
            )}

            <QuickAddRow onAdd={handleAdd} defaultDealType={group.defaultDealType} defaultHomeType={group.defaultHomeType} defaultStatus={group.defaultStatus} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

let _activeDragCardId: string | null = null;

// ── Board Card ──────────────────────────────────────────────────────
function BoardCard({ prospect, onOpen, isDragOver, isBeingDragged }: {
  prospect: PipelineProspect; onOpen: (p: PipelineProspect) => void;
  isDragOver?: boolean; isBeingDragged?: boolean;
}) {
  const tc = TEMP_CONFIG[prospect.temperature || 'warm'] || TEMP_CONFIG.warm;

  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.13 }}
      draggable
      onDragStart={(e: any) => {
        _activeDragCardId = prospect.id;
        e.dataTransfer?.setData('board-card-id', prospect.id);
        e.dataTransfer?.setData('text/plain', prospect.id);
        setTimeout(() => { if (e.currentTarget) e.currentTarget.style.opacity = '0.3'; }, 0);
      }}
      onDragEnd={(e: any) => { _activeDragCardId = null; if (e.currentTarget) e.currentTarget.style.opacity = '1'; }}
      onClick={() => { onOpen(prospect); triggerHaptic('light'); }}
      className={cn(
        "rounded-xl border-l-[3px] border border-border/30 bg-card p-3.5 group cursor-grab active:cursor-grabbing transition-all select-none",
        tc.border,
        isBeingDragged && "opacity-30",
        isDragOver
          ? "ring-2 ring-primary/30 shadow-[0_0_0_2px_hsl(var(--primary)/0.1)] -translate-y-0.5"
          : "hover:border-border/50 hover:shadow-sm"
      )}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <p className="text-[13px] font-bold truncate leading-tight text-foreground">{prospect.client_name}</p>
        <div className={cn("shrink-0 w-5 h-5 rounded-md flex items-center justify-center", tc.bg)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", tc.dot)} />
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-2.5">
        {prospect.home_type && (
          <span className="text-[10px] font-medium text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded-md">{prospect.home_type}</span>
        )}
        {prospect.source && (
          <span className="text-[10px] text-muted-foreground/40 truncate">{prospect.source}</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border/20">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">GCI</span>
          <span className={cn("text-[12px] font-bold tabular-nums", prospect.potential_commission > 0 ? "text-primary" : "text-muted-foreground/30")}>
            {prospect.potential_commission > 0 ? formatCurrency(prospect.potential_commission) : '—'}
          </span>
        </div>
        {prospect.budget != null && prospect.budget > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/30">
              {isListingProspect(prospect) ? 'List' : 'Budget'}
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground/50 tabular-nums">{formatCurrency(prospect.budget)}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Board Quick Add ──────────────────────────────────────────────────
function BoardQuickAdd({ status, dealType, onAdd }: { status: string; dealType?: string; onAdd: (data: any) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [commission, setCommission] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({ client_name: name.trim(), home_type: 'Detached', potential_commission: parseFloat(commission) || 0, temperature: 'warm', status, deal_type: dealType || 'buyer' });
    setName(''); setCommission(''); setOpen(false);
    triggerHaptic('light');
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-xl border border-dashed border-border/20 hover:border-primary/30 p-2.5 text-xs text-muted-foreground/30 hover:text-primary transition-all flex items-center justify-center gap-1.5 mt-1">
        <Plus className="h-3.5 w-3.5" /> Add lead
      </button>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-primary/20 bg-card p-3 space-y-2 mt-1">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} placeholder="Client name"
        className="w-full bg-transparent border-b border-border/20 outline-none text-sm py-1.5 placeholder:text-muted-foreground/25 focus:border-primary/30" />
      <input value={commission} onChange={(e) => setCommission(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} placeholder="Est. GCI $" type="number"
        className="w-full bg-transparent border-b border-border/20 outline-none text-sm py-1.5 placeholder:text-muted-foreground/25 focus:border-primary/30" />
      <div className="flex gap-2 pt-1">
        <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs text-muted-foreground" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleSubmit} disabled={!name.trim()}>Add</Button>
      </div>
    </motion.div>
  );
}

// ── Board Column ─────────────────────────────────────────────────────
function BoardColumn({ status, label, items, total, dealType, onMoveStatus, onAdd, onOpen }: {
  status: string; label: string; items: PipelineProspect[]; total: number; dealType: string;
  onMoveStatus: (id: string, status: string) => void; onAdd: (data: any) => void; onOpen: (p: PipelineProspect) => void;
}) {
  const [isDragOverCol, setIsDragOverCol] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[]>(() => items.map(p => p.id));
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  useEffect(() => {
    setLocalOrder(prev => {
      const incoming = items.map(p => p.id);
      const incomingSet = new Set(incoming);
      const kept = prev.filter(id => incomingSet.has(id));
      const added = incoming.filter(id => !new Set(kept).has(id));
      return [...kept, ...added];
    });
  }, [items]);

  const orderedItems = localOrder.map(id => items.find(p => p.id === id)).filter(Boolean) as PipelineProspect[];

  const handleCardDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOverCol(true); setDropTargetId(overId);
    const dragId = _activeDragCardId;
    if (!dragId || dragId === overId) return;
    setLocalOrder(prev => {
      const from = prev.indexOf(dragId);
      const to = prev.indexOf(overId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev]; next.splice(from, 1); next.splice(to, 0, dragId);
      return next;
    });
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-card/40 shrink-0 overflow-hidden transition-all snap-start",
        "w-[calc(85vw)] sm:w-[calc(50%-6px)] lg:w-[calc(25%-9px)]",
        isDragOverCol ? "border-primary/30 bg-primary/[0.02]" : "border-border/30"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragOverCol(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setIsDragOverCol(false); setDropTargetId(null); } }}
      onDrop={(e) => {
        e.preventDefault(); setIsDragOverCol(false); setDropTargetId(null);
        const id = e.dataTransfer.getData('board-card-id') || e.dataTransfer.getData('text/plain');
        if (id && !localOrder.includes(id)) { triggerHaptic('light'); onMoveStatus(id, status); }
        else if (id) triggerHaptic('light');
      }}>
      <div className={cn("flex items-center justify-between px-3.5 py-3 border-b border-border/30", isDragOverCol ? "bg-primary/[0.03]" : "bg-muted/10")}>
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT_COLORS[status])} />
          <span className="text-[13px] font-bold tracking-tight">{label}</span>
          <span className="text-[10px] font-bold tabular-nums text-muted-foreground/40 px-1.5 py-0.5 rounded-md bg-muted/30">{items.length}</span>
        </div>
        {total > 0 && <span className="text-[11px] font-bold text-primary tabular-nums">{formatCurrency(total)}</span>}
      </div>

      <div className="flex-1 p-2.5 space-y-1.5 min-h-[120px] overflow-y-auto max-h-[calc(100vh-280px)]">
        {orderedItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/15 p-6 text-center">
            <p className="text-[10px] text-muted-foreground/25">Drop leads here</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {orderedItems.map(p => (
              <div key={p.id} className="relative" onDragOver={(e) => handleCardDragOver(e, p.id)}>
                {dropTargetId === p.id && _activeDragCardId && _activeDragCardId !== p.id && (
                  <div className="absolute -top-1 left-2 right-2 h-0.5 rounded-full bg-primary z-10 pointer-events-none" />
                )}
                <BoardCard prospect={p} onOpen={onOpen} isDragOver={dropTargetId === p.id && _activeDragCardId !== p.id} isBeingDragged={_activeDragCardId === p.id} />
              </div>
            ))}
          </AnimatePresence>
        )}
        <BoardQuickAdd status={status} dealType={dealType} onAdd={onAdd} />
      </div>
    </div>
  );
}

// ── Board View ──────────────────────────────────────────────────────
function BoardView({ prospects, onMoveStatus, onDelete, onAdd, onUpdate, onOpen, activeTab }: {
  prospects: PipelineProspect[]; onMoveStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void; onAdd: (data: any) => void;
  onUpdate: (id: string, field: string, value: string) => void;
  onOpen: (p: PipelineProspect) => void; activeTab: PageTab;
}) {
  const statusList = activeTab === 'listings' ? LISTING_STATUS_OPTIONS : BUYER_STATUS_OPTIONS;
  const dealType = activeTab === 'listings' ? 'seller' : 'buyer';

  const columns = useMemo(() => {
    return statusList.map(status => ({
      status, label: STATUS_LABELS[status],
      items: prospects.filter(p => p.status === status),
      total: prospects.filter(p => p.status === status).reduce((s, p) => s + Number(p.potential_commission), 0),
    }));
  }, [prospects, statusList]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory lg:flex-wrap lg:overflow-x-visible lg:snap-none" style={{ WebkitOverflowScrolling: 'touch' }}>
      {columns.map(col => (
        <BoardColumn key={col.status} status={col.status} label={col.label} items={col.items} total={col.total}
          dealType={dealType} onMoveStatus={onMoveStatus} onAdd={onAdd} onOpen={onOpen} />
      ))}
    </div>
  );
}

// ── Archived section ────────────────────────────────────────────────
function ArchivedSection({ title, dotColor, accentColor, items, restoreStatus, deleteProspect, isEditing, setEditingCell, handleSave, onOpen }: {
  title: string; dotColor: string; accentColor: string; items: PipelineProspect[]; restoreStatus: string;
  deleteProspect: { mutate: (id: string) => void };
  isEditing: (id: string, field: string) => boolean;
  setEditingCell: (cell: { id: string; field: string } | null) => void;
  handleSave: (id: string, field: string, value: string) => void;
  onOpen: (p: PipelineProspect) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const totalGCI = items.reduce((s, p) => s + Number(p.potential_commission), 0);
  if (items.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-border/20 bg-card/30 overflow-hidden">
      <button onClick={() => setCollapsed(c => !c)} className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/5">
        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor)} />
        <h3 className="text-[13px] font-bold tracking-tight text-muted-foreground/60">{title}</h3>
        <span className="text-[11px] text-muted-foreground/30 tabular-nums">{items.length}</span>
        <div className="flex-1" />
        <span className={cn("text-[13px] font-bold tabular-nums", accentColor)}>{formatCurrency(totalGCI)}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/20 transition-transform duration-200", collapsed && "-rotate-90")} />
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-border/15">
              {items.map((p, idx) => (
                <div key={p.id}>
                  <div className="sm:hidden flex items-center gap-3 px-4 py-3 border-b border-border/10 group">
                    <div className="flex-1 min-w-0" onClick={() => onOpen(p)}>
                      <p className="text-[13px] font-medium text-muted-foreground/40 line-through truncate">{p.client_name}</p>
                      <p className="text-[10px] text-muted-foreground/25 mt-0.5">{p.home_type}</p>
                    </div>
                    <span className={cn("text-[13px] font-bold shrink-0 tabular-nums", accentColor)}>{formatCurrency(p.potential_commission)}</span>
                    <button onClick={() => { handleSave(p.id, 'status', restoreStatus); triggerHaptic('light'); }}
                      className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors" title="Restore to pipeline">
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className={cn("hidden sm:flex items-center gap-4 px-4 py-2.5 border-b border-border/10 group hover:bg-muted/5", idx % 2 === 1 && 'bg-muted/[0.02]')}>
                    <p className="flex-1 text-[13px] font-medium text-muted-foreground/40 line-through truncate cursor-pointer hover:text-foreground/60 transition-colors" onClick={() => onOpen(p)}>{p.client_name}</p>
                    <span className="text-xs text-muted-foreground/25">{p.home_type}</span>
                    <span className={cn("text-[13px] font-bold tabular-nums w-24 text-right", accentColor)}>{formatCurrency(p.potential_commission)}</span>
                    <button onClick={() => { handleSave(p.id, 'status', restoreStatus); triggerHaptic('light'); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-[10px] font-semibold" title="Restore to pipeline">
                      <Undo2 className="h-3 w-3" /> Restore
                    </button>
                    <button onClick={() => deleteProspect.mutate(p.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10 text-muted-foreground/15 hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('pipeline-view') as ViewMode) || 'list');
  const [activeTab, setActiveTab] = useState<PageTab>(() => (localStorage.getItem('pipeline-tab') as PageTab) || 'buyers');
  const [selectedProspect, setSelectedProspect] = useState<PipelineProspect | null>(null);
  const [tempFilter, setTempFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = useCallback((field: SortField) => {
    triggerHaptic('light');
    setSortField(prev => { if (prev === field) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); return field; } setSortDir('desc'); return field; });
  }, []);

  const handleSheetSave = useCallback((id: string, updates: Partial<PipelineProspect>) => { updateProspect.mutate({ id, ...updates } as any); }, [updateProspect]);
  const handleSheetDelete = useCallback((id: string) => { deleteProspect.mutate(id); }, [deleteProspect]);

  const buyerProspects = useMemo(() => prospects.filter(p => !isListingProspect(p)), [prospects]);
  const listingProspects = useMemo(() => prospects.filter(p => isListingProspect(p)), [prospects]);
  const tabProspects = activeTab === 'listings' ? listingProspects : buyerProspects;

  const activeStatuses = activeTab === 'listings'
    ? ['want-to-sell', 'active-listing', 'in-contract-listing']
    : ['active', 'in-contract', 'pending-mortgage'];

  const activeProspects = tabProspects.filter(p => activeStatuses.includes(p.status));
  const totalPotential = activeProspects.reduce((sum, p) => sum + Number(p.potential_commission), 0);

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

  const handleMoveStatus = useCallback((id: string, status: string) => { updateProspect.mutate({ id, status } as any); }, [updateProspect]);
  const handleAdd = (data: any) => { addProspect.mutate(data as any); };
  const toggleView = (mode: ViewMode) => { triggerHaptic('light'); setViewMode(mode); localStorage.setItem('pipeline-view', mode); };
  const toggleTab = (tab: PageTab) => { triggerHaptic('light'); setActiveTab(tab); localStorage.setItem('pipeline-tab', tab); };
  const isEditing = (id: string, field: string) => editingCell?.id === id && editingCell?.field === field;

  const tempCounts = useMemo(() => ({
    hot: activeProspects.filter(p => (p.temperature || 'warm') === 'hot').length,
    warm: activeProspects.filter(p => (p.temperature || 'warm') === 'warm').length,
    cold: activeProspects.filter(p => (p.temperature || 'warm') === 'cold').length,
  }), [activeProspects]);

  const buyerSections = useMemo(() => [
    { key: 'presale', label: 'Presale', defaultDealType: 'buyer', defaultHomeType: 'Presale', defaultStatus: 'active', accentColor: 'text-amber-500', dotColor: 'bg-amber-500', filter: (p: PipelineProspect) => !['closed', 'lost'].includes(p.status) && p.home_type === 'Presale' },
    { key: 'buyer', label: 'Resale Buyers', defaultDealType: 'buyer', defaultHomeType: 'Detached', defaultStatus: 'active', accentColor: 'text-sky-500', dotColor: 'bg-sky-500', filter: (p: PipelineProspect) => !['closed', 'lost'].includes(p.status) && p.home_type !== 'Presale' },
  ], []);

  const listingSections = useMemo(() => [
    { key: 'listings', label: 'All Listings', defaultDealType: 'seller', defaultHomeType: 'Detached', defaultStatus: 'want-to-sell', accentColor: 'text-violet-500', dotColor: 'bg-violet-500', filter: (p: PipelineProspect) => !['sold', 'listing-lost'].includes(p.status) },
  ], []);

  if (isLoading) {
    return (
      <AppLayout>
        <Header title="Pipeline" showAddDeal={false} />
        <div className="p-5 lg:p-6 space-y-5">
          <div className="rounded-2xl border border-border/20 bg-card p-5 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="space-y-2"><div className="h-3 w-24 bg-muted/40 rounded" /><div className="h-7 w-32 bg-muted/40 rounded-lg" /></div>
              <div className="flex gap-4">{[1,2,3].map(i => <div key={i} className="h-10 w-14 bg-muted/30 rounded-xl" />)}</div>
            </div>
          </div>
          {[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-muted/20 animate-pulse" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Pipeline" subtitle={`${activeProspects.length} active`} showAddDeal={false} />
      <PullToRefresh onRefresh={refreshData} className="min-h-[calc(100vh-56px)]">
        <div className="p-5 lg:p-6 space-y-4">

          {/* ── Buyers / Listings Tab Toggle ── */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-muted/20 w-fit">
            {([
              { tab: 'buyers' as PageTab, label: 'Buyers', count: buyerProspects.length },
              { tab: 'listings' as PageTab, label: 'Listings', count: listingProspects.length },
            ]).map(({ tab, label, count }) => (
              <button
                key={tab}
                onClick={() => toggleTab(tab)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                  activeTab === tab
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground/50 hover:text-foreground"
                )}
              >
                {label}
                <span className={cn(
                  "text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md",
                  activeTab === tab ? "bg-primary/15 text-primary" : "bg-muted/40 text-muted-foreground/40"
                )}>{count}</span>
              </button>
            ))}
          </div>

          {/* ── Stats + Controls ── */}
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }} className="flex items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
                <div className="shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40 mb-0.5">
                    {activeTab === 'listings' ? 'Listings GCI' : 'Pipeline GCI'}
                  </p>
                  <p className="text-xl font-bold tracking-tight tabular-nums">{formatCurrency(totalPotential)}</p>
                </div>
                <div className="h-7 w-px bg-border/30 shrink-0" />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['hot', 'warm', 'cold'] as const).map(temp => {
                    const cfg = TEMP_CONFIG[temp];
                    const count = tempCounts[temp];
                    const isActive = tempFilter === temp;
                    return (
                      <button key={temp} onClick={() => { triggerHaptic('light'); setTempFilter(isActive ? null : temp); }}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                          isActive
                            ? cn(cfg.text, "bg-muted/20 ring-1 ring-border/40")
                            : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/20"
                        )}>
                        <span className={cn("w-2 h-2 rounded-full", isActive ? cfg.dot : "bg-muted-foreground/20")} />
                        <span className="tabular-nums">{count}</span>
                      </button>
                    );
                  })}
                  {tempFilter && (
                    <button onClick={() => { triggerHaptic('light'); setTempFilter(null); }} className="p-1 rounded-md text-muted-foreground/30 hover:text-foreground hover:bg-muted/20 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/20 shrink-0">
                {([{ mode: 'list' as ViewMode, icon: List, label: 'List' }, { mode: 'board' as ViewMode, icon: LayoutGrid, label: 'Board' }]).map(({ mode, icon: Icon, label }) => (
                  <button key={mode} onClick={() => toggleView(mode)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      viewMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground/50 hover:text-foreground"
                    )}>
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* ── Status summary pills ── */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {(activeTab === 'listings' ? LISTING_STATUS_OPTIONS : BUYER_STATUS_OPTIONS).map(status => {
              const count = tabProspects.filter(p => p.status === status).length;
              return (
                <div key={status} className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium shrink-0", STATUS_COLORS[status])}>
                  <div className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT_COLORS[status])} />
                  {STATUS_LABELS[status]}
                  <span className="font-bold tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>

          {/* ── Content ── */}
          <AnimatePresence mode="wait">
            <motion.div key={activeTab + '-' + viewMode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              {viewMode === 'board' ? (
                <BoardView prospects={tabProspects} onMoveStatus={handleMoveStatus} onDelete={(id) => deleteProspect.mutate(id)}
                  onAdd={handleAdd} onUpdate={(id, field, value) => updateProspect.mutate({ id, [field]: value } as any)}
                  onOpen={setSelectedProspect} activeTab={activeTab} />
              ) : activeTab === 'listings' ? (
                <div className="space-y-3">
                  {listingSections.map(group => (
                    <PipelineSection key={group.key} group={group} prospects={tabProspects} tempFilter={tempFilter}
                      sortField={sortField} sortDir={sortDir} onSort={handleSort} isEditing={isEditing} setEditingCell={setEditingCell}
                      handleSave={handleSave} handleAdd={handleAdd} deleteProspect={deleteProspect} onOpen={setSelectedProspect}
                      statusOptions={LISTING_STATUS_OPTIONS} statusLabels={LISTING_STATUS_LABELS} />
                  ))}
                  <ArchivedSection title="Sold" dotColor="bg-emerald-500" accentColor="text-emerald-500" restoreStatus="active-listing"
                    items={[...tabProspects].reverse().filter(p => p.status === 'sold')}
                    deleteProspect={deleteProspect} isEditing={isEditing} setEditingCell={setEditingCell} handleSave={handleSave} onOpen={setSelectedProspect} />
                  <ArchivedSection title="Lost" dotColor="bg-destructive" accentColor="text-destructive" restoreStatus="want-to-sell"
                    items={[...tabProspects].reverse().filter(p => p.status === 'listing-lost')}
                    deleteProspect={deleteProspect} isEditing={isEditing} setEditingCell={setEditingCell} handleSave={handleSave} onOpen={setSelectedProspect} />
                </div>
              ) : (
                <div className="space-y-3">
                  {buyerSections.map(group => (
                    <PipelineSection key={group.key} group={group} prospects={tabProspects} tempFilter={tempFilter}
                      sortField={sortField} sortDir={sortDir} onSort={handleSort} isEditing={isEditing} setEditingCell={setEditingCell}
                      handleSave={handleSave} handleAdd={handleAdd} deleteProspect={deleteProspect} onOpen={setSelectedProspect}
                      statusOptions={BUYER_STATUS_OPTIONS} statusLabels={BUYER_STATUS_LABELS} />
                  ))}
                  <ArchivedSection title="Closed Deals" dotColor="bg-emerald-500" accentColor="text-emerald-500" restoreStatus="active"
                    items={[...tabProspects].reverse().filter(p => p.status === 'closed')}
                    deleteProspect={deleteProspect} isEditing={isEditing} setEditingCell={setEditingCell} handleSave={handleSave} onOpen={setSelectedProspect} />
                  <ArchivedSection title="Lost Deals" dotColor="bg-destructive" accentColor="text-destructive" restoreStatus="active"
                    items={[...tabProspects].reverse().filter(p => p.status === 'lost')}
                    deleteProspect={deleteProspect} isEditing={isEditing} setEditingCell={setEditingCell} handleSave={handleSave} onOpen={setSelectedProspect} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </PullToRefresh>

      <ProspectSheet prospect={selectedProspect} onClose={() => setSelectedProspect(null)} onSave={handleSheetSave} onDelete={handleSheetDelete} />
    </AppLayout>
  );
}
