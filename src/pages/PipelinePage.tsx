import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useRefreshData } from '@/hooks/useRefreshData';
import { usePipelineProspects, useAddProspect, useUpdateProspect, useDeleteProspect, PipelineProspect } from '@/hooks/usePipelineProspects';
import { formatCurrency } from '@/lib/format';
import { Plus, Trash2, Flame, Thermometer, Snowflake, Users, Home, ChevronDown, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { ProspectSheet } from '@/components/pipeline/ProspectSheet';

const HOME_TYPES = ['Condo', 'Townhome', 'Detached House', 'Semi-Detached', 'Duplex', 'Pre-Sale Condo', 'Pre-Sale Townhome', 'Land', 'Commercial', 'Listings'];
const LEAD_SOURCES = ['Instagram', 'TikTok', 'Facebook Ads', 'YouTube', 'Referral', 'Team', 'Past Client'];

type PageTab = 'buyers' | 'listings';

const BUYER_STATUS_OPTIONS = ['active', 'in-contract', 'pending-mortgage', 'closed', 'lost'] as const;
const BUYER_STATUS_LABELS: Record<string, string> = { active: 'Active', 'in-contract': 'In Contract', 'pending-mortgage': 'Pending Mortgage', closed: 'Closed', lost: 'Lost' };
const LISTING_STATUS_OPTIONS = ['want-to-sell', 'active-listing', 'in-contract-listing', 'sold', 'listing-lost'] as const;
const LISTING_STATUS_LABELS: Record<string, string> = { 'want-to-sell': 'Want to Sell', 'active-listing': 'Active', 'in-contract-listing': 'In Contract', sold: 'Sold', 'listing-lost': 'Lost' };
const STATUS_LABELS: Record<string, string> = { ...BUYER_STATUS_LABELS, ...LISTING_STATUS_LABELS };

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-primary/10 text-primary',
  'in-contract': 'bg-amber-500/10 text-amber-500',
  'pending-mortgage': 'bg-orange-500/10 text-orange-500',
  closed: 'bg-emerald-500/10 text-emerald-500',
  lost: 'bg-destructive/10 text-destructive',
  'want-to-sell': 'bg-violet-500/10 text-violet-500',
  'active-listing': 'bg-violet-500/10 text-violet-500',
  'in-contract-listing': 'bg-amber-500/10 text-amber-500',
  sold: 'bg-emerald-500/10 text-emerald-500',
  'listing-lost': 'bg-destructive/10 text-destructive',
};

const TEMP_CONFIG = {
  hot: { icon: Flame, color: 'text-rose-500', bg: 'bg-rose-500/10', label: 'Hot' },
  warm: { icon: Thermometer, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Warm' },
  cold: { icon: Snowflake, color: 'text-sky-500', bg: 'bg-sky-500/10', label: 'Cold' },
} as const;
const TEMP_ORDER = ['hot', 'warm', 'cold'];

function isListingProspect(p: PipelineProspect) {
  return p.deal_type === 'seller' || (['want-to-sell', 'active-listing', 'in-contract-listing', 'sold', 'listing-lost'] as string[]).includes(p.status);
}

// ── Lead Row ─────────────────────────────────────────────────────────
function LeadRow({ p, onOpen, onCycleTemp, onDelete }: {
  p: PipelineProspect;
  onOpen: () => void;
  onCycleTemp: () => void;
  onDelete: () => void;
}) {
  const temp = (p.temperature || 'warm') as keyof typeof TEMP_CONFIG;
  const tc = TEMP_CONFIG[temp] || TEMP_CONFIG.warm;
  const TIcon = tc.icon;

  return (
    <div
      className="group flex items-center gap-3 px-4 py-3.5 border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={onOpen}
    >
      {/* Temperature icon */}
      <button
        onClick={(e) => { e.stopPropagation(); onCycleTemp(); }}
        className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110", tc.bg)}
      >
        <TIcon className={cn("h-3.5 w-3.5", tc.color)} />
      </button>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{p.client_name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground">{p.home_type}</span>
          {p.source && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="text-[11px] text-muted-foreground/60">{p.source}</span>
            </>
          )}
        </div>
      </div>

      {/* Status badge */}
      <span className={cn("hidden sm:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap", STATUS_STYLES[p.status] || STATUS_STYLES.active)}>
        {STATUS_LABELS[p.status] || p.status}
      </span>

      {/* GCI */}
      <span className={cn("text-sm font-bold tabular-nums shrink-0", p.potential_commission > 0 ? "text-primary" : "text-muted-foreground/30")}>
        {p.potential_commission > 0 ? formatCurrency(p.potential_commission) : '—'}
      </span>

      {/* Delete */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground/30 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Quick Add ────────────────────────────────────────────────────────
function QuickAdd({ onAdd, dealType }: { onAdd: (d: any) => void; dealType: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [commission, setCommission] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    onAdd({
      client_name: name.trim(),
      home_type: 'Detached',
      potential_commission: parseFloat(commission) || 0,
      temperature: 'warm',
      deal_type: dealType,
      status: dealType === 'seller' ? 'want-to-sell' : 'active',
    });
    setName(''); setCommission(''); setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-4 py-3 text-sm text-muted-foreground/40 hover:text-primary hover:bg-muted/20 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> Add a lead…
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-muted/10 border-t border-border/20">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Client name"
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/30 min-w-0"
      />
      <input
        type="number"
        value={commission}
        onChange={(e) => setCommission(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="$0"
        className="w-20 bg-transparent outline-none text-sm text-right placeholder:text-muted-foreground/30"
      />
      <Button size="sm" className="h-7 text-xs" onClick={submit} disabled={!name.trim()}>Add</Button>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setOpen(false); setName(''); setCommission(''); }}>Cancel</Button>
    </div>
  );
}

// ── Archived Section ─────────────────────────────────────────────────
function ArchivedGroup({ title, items, restoreStatus, onRestore, onDelete, onOpen }: {
  title: string; items: PipelineProspect[]; restoreStatus: string;
  onRestore: (id: string, status: string) => void; onDelete: (id: string) => void; onOpen: (p: PipelineProspect) => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const total = items.reduce((s, p) => s + Number(p.potential_commission), 0);

  return (
    <div className="rounded-xl border border-border/20 bg-card/50 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors">
        <span className="text-xs font-semibold text-muted-foreground/60">{title}</span>
        <span className="text-[10px] text-muted-foreground/40 tabular-nums">{items.length}</span>
        <div className="flex-1" />
        <span className="text-xs font-semibold text-muted-foreground/50 tabular-nums">{formatCurrency(total)}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/30 transition-transform", !open && "-rotate-90")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-border/15">
              {items.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/10 group hover:bg-muted/10 transition-colors">
                  <p className="flex-1 text-sm text-muted-foreground/50 line-through truncate cursor-pointer" onClick={() => onOpen(p)}>{p.client_name}</p>
                  <span className="text-xs text-muted-foreground/30">{p.home_type}</span>
                  <span className="text-xs font-semibold text-muted-foreground/40 tabular-nums">{formatCurrency(p.potential_commission)}</span>
                  <button onClick={() => { onRestore(p.id, restoreStatus); triggerHaptic('light'); }} className="opacity-0 group-hover:opacity-100 p-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-all">
                    <Undo2 className="h-3 w-3" />
                  </button>
                  <button onClick={() => onDelete(p.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/10 text-muted-foreground/20 hover:text-destructive transition-all">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
  const [activeTab, setActiveTab] = useState<PageTab>(() => (localStorage.getItem('pipeline-tab') as PageTab) || 'buyers');
  const [selectedProspect, setSelectedProspect] = useState<PipelineProspect | null>(null);
  const [tempFilter, setTempFilter] = useState<string | null>(null);

  const buyerProspects = useMemo(() => prospects.filter(p => !isListingProspect(p)), [prospects]);
  const listingProspects = useMemo(() => prospects.filter(p => isListingProspect(p)), [prospects]);
  const tabProspects = activeTab === 'listings' ? listingProspects : buyerProspects;

  const closedStatuses = activeTab === 'listings' ? ['sold', 'listing-lost'] : ['closed', 'lost'];
  const activeLeads = useMemo(() => tabProspects.filter(p => !closedStatuses.includes(p.status)), [tabProspects, closedStatuses]);
  const closedLeads = useMemo(() => tabProspects.filter(p => p.status === (activeTab === 'listings' ? 'sold' : 'closed')), [tabProspects, activeTab]);
  const lostLeads = useMemo(() => tabProspects.filter(p => p.status === (activeTab === 'listings' ? 'listing-lost' : 'lost')), [tabProspects, activeTab]);

  const totalGCI = activeLeads.reduce((s, p) => s + Number(p.potential_commission), 0);

  // Sort: hot first, then warm, then cold
  const sortedLeads = useMemo(() => {
    let items = [...activeLeads].sort((a, b) => {
      const order: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
      return (order[a.temperature || 'warm'] ?? 1) - (order[b.temperature || 'warm'] ?? 1);
    });
    if (tempFilter) items = items.filter(p => (p.temperature || 'warm') === tempFilter);
    return items;
  }, [activeLeads, tempFilter]);

  const tempCounts = useMemo(() => ({
    hot: activeLeads.filter(p => (p.temperature || 'warm') === 'hot').length,
    warm: activeLeads.filter(p => (p.temperature || 'warm') === 'warm').length,
    cold: activeLeads.filter(p => (p.temperature || 'warm') === 'cold').length,
  }), [activeLeads]);

  const cycleTemp = useCallback((id: string) => {
    const p = prospects.find(x => x.id === id);
    if (!p) return;
    const next = TEMP_ORDER[(TEMP_ORDER.indexOf(p.temperature || 'warm') + 1) % TEMP_ORDER.length];
    updateProspect.mutate({ id, temperature: next } as any);
    triggerHaptic('light');
  }, [prospects, updateProspect]);

  const handleAdd = (data: any) => addProspect.mutate(data);
  const handleRestore = (id: string, status: string) => updateProspect.mutate({ id, status } as any);

  const handleSheetSave = useCallback((id: string, updates: Partial<PipelineProspect>) => {
    updateProspect.mutate({ id, ...updates } as any);
  }, [updateProspect]);

  const handleSheetDelete = useCallback((id: string) => {
    deleteProspect.mutate(id);
  }, [deleteProspect]);

  if (isLoading) {
    return (
      <AppLayout>
        <Header title="Pipeline" showAddDeal={false} />
        <div className="p-5 space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-xl bg-muted/20 animate-pulse" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Header title="Pipeline" subtitle={`${activeLeads.length} active`} showAddDeal={false} />
      <PullToRefresh onRefresh={refreshData} className="min-h-[calc(100vh-56px)]">
        <div className="p-4 sm:p-5 lg:p-6 space-y-4 max-w-4xl mx-auto">

          {/* Tab toggle */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-muted/20 w-fit">
            {([
              { tab: 'buyers' as PageTab, icon: Users, label: 'Buyers', count: buyerProspects.length },
              { tab: 'listings' as PageTab, icon: Home, label: 'Listings', count: listingProspects.length },
            ]).map(({ tab, icon: Icon, label, count }) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); localStorage.setItem('pipeline-tab', tab); triggerHaptic('light'); }}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all",
                  activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground/50 hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                <span className={cn("text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md", activeTab === tab ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground/40")}>{count}</span>
              </button>
            ))}
          </div>

          {/* Summary bar */}
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">Potential GCI</p>
              <p className="text-xl font-bold tabular-nums tracking-tight">{formatCurrency(totalGCI)}</p>
            </div>
            <div className="h-8 w-px bg-border/30" />
            <div className="flex items-center gap-1">
              {(['hot', 'warm', 'cold'] as const).map(temp => {
                const cfg = TEMP_CONFIG[temp];
                const Icon = cfg.icon;
                const active = tempFilter === temp;
                return (
                  <button
                    key={temp}
                    onClick={() => { setTempFilter(active ? null : temp); triggerHaptic('light'); }}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                      active ? cn(cfg.color, cfg.bg, "ring-1 ring-current/20") : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/20"
                    )}
                  >
                    <Icon className="w-3 h-3" />
                    <span className="tabular-nums">{tempCounts[temp]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lead list */}
          <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
            {sortedLeads.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground/40">No leads yet</p>
                <p className="text-xs text-muted-foreground/25 mt-1">Add your first lead below</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {sortedLeads.map(p => (
                  <motion.div key={p.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.15 }}>
                    <LeadRow
                      p={p}
                      onOpen={() => setSelectedProspect(p)}
                      onCycleTemp={() => cycleTemp(p.id)}
                      onDelete={() => deleteProspect.mutate(p.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <QuickAdd onAdd={handleAdd} dealType={activeTab === 'listings' ? 'seller' : 'buyer'} />
          </div>

          {/* Archived */}
          <div className="space-y-2">
            <ArchivedGroup
              title={activeTab === 'listings' ? 'Sold' : 'Closed'}
              items={closedLeads}
              restoreStatus={activeTab === 'listings' ? 'active-listing' : 'active'}
              onRestore={handleRestore}
              onDelete={(id) => deleteProspect.mutate(id)}
              onOpen={setSelectedProspect}
            />
            <ArchivedGroup
              title="Lost"
              items={lostLeads}
              restoreStatus={activeTab === 'listings' ? 'want-to-sell' : 'active'}
              onRestore={handleRestore}
              onDelete={(id) => deleteProspect.mutate(id)}
              onOpen={setSelectedProspect}
            />
          </div>
        </div>
      </PullToRefresh>

      {/* Detail Sheet */}
      <ProspectSheet
        prospect={selectedProspect}
        onClose={() => setSelectedProspect(null)}
        onSave={handleSheetSave}
        onDelete={handleSheetDelete}
      />
    </AppLayout>
  );
}
