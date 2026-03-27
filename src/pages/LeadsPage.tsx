import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow, format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { LeadDetailSheet } from '@/components/command-center/LeadDetailSheet';
import type { ProspectRow } from '@/components/command-center/NeedsAttention';
import {
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  SlidersHorizontal, X, Users, Flame, Thermometer, Snowflake,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────────
type SortField = 'client_name' | 'budget' | 'updated_at' | 'created_at' | 'status' | 'temperature';
type SortDir = 'asc' | 'desc';

// ─── Constants ──────────────────────────────────────────────────────────────────
const SOURCE_COLORS: Record<string, string> = {
  tiktok:    'hsl(180 100% 47%)',
  instagram: 'hsl(340 80% 58%)',
  facebook:  'hsl(214 89% 52%)',
  referral:  'hsl(152 69% 40%)',
  whatsapp:  'hsl(142 70% 49%)',
  sms:       'hsl(220 9% 46%)',
  manychat:  'hsl(214 100% 50%)',
  'past client': 'hsl(270 60% 55%)',
};

const TEMP_ORDER: Record<string, number> = { hot: 0, warm: 1, cold: 2 };

function srcColor(s: string | null) {
  if (!s) return 'hsl(var(--muted-foreground))';
  return SOURCE_COLORS[s.toLowerCase().trim()] ?? 'hsl(var(--muted-foreground))';
}

function formatBudget(b: number | null) {
  if (!b) return '—';
  if (b >= 1_000_000) return `$${(b / 1_000_000).toFixed(1)}M`;
  return `$${(b / 1_000).toFixed(0)}K`;
}

// ─── Badges ────────────────────────────────────────────────────────────────────
function TempBadge({ temp }: { temp: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    hot:  { label: 'Hot',  cls: 'bg-destructive/10 text-destructive border-destructive/20', icon: <Flame className="w-2.5 h-2.5" /> },
    warm: { label: 'Warm', cls: 'bg-warning/10 text-warning border-warning/20',             icon: <Thermometer className="w-2.5 h-2.5" /> },
    cold: { label: 'Cold', cls: 'bg-info/10 text-info border-info/20',                      icon: <Snowflake className="w-2.5 h-2.5" /> },
  };
  const t = map[temp?.toLowerCase()] ?? { label: temp, cls: 'bg-muted/50 text-muted-foreground border-border/40', icon: null };
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', t.cls)}>
      {t.icon}{t.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:   'bg-success/10 text-success border-success/20',
    inactive: 'bg-muted/50 text-muted-foreground border-border/40',
    closed:   'bg-muted/30 text-muted-foreground/60 border-border/30',
  };
  return (
    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize', map[status?.toLowerCase()] ?? 'bg-muted/50 text-muted-foreground border-border/40')}>
      {status}
    </span>
  );
}

function UrgencyBar({ updated_at }: { updated_at: string }) {
  const h = (Date.now() - new Date(updated_at).getTime()) / 3_600_000;
  if (h > 48) return <span className="inline-block w-2 h-2 rounded-full bg-destructive" title="Overdue 48h+" />;
  if (h > 24) return <span className="inline-block w-2 h-2 rounded-full bg-warning" title="24h+" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-success" title="Recent" />;
}

// ─── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ field, active, dir }: { field: SortField; active: SortField; dir: SortDir }) {
  if (field !== active) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return dir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />;
}

// ─── Data hook ─────────────────────────────────────────────────────────────────
function useLeads() {
  return useQuery({
    queryKey: ['leads-page'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pipeline_prospects')
        .select('id,client_name,source,temperature,budget,status,created_at,updated_at')
        .order('updated_at', { ascending: false });
      return (data ?? []) as ProspectRow[];
    },
  });
}

// ─── Filter pill ───────────────────────────────────────────────────────────────
function Pill({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all',
        active
          ? 'border-primary/50 bg-primary/10 text-primary'
          : 'border-border/40 bg-muted/30 text-muted-foreground hover:border-border/60 hover:bg-muted/50',
      )}
      style={active && color ? { color, borderColor: `${color}50`, background: `${color}18` } : undefined}
    >
      {label}
    </button>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function LeadsPage() {
  const { data: leads = [], isLoading } = useLeads();
  const [search, setSearch] = useState('');
  const [tempFilter, setTempFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<ProspectRow | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Derived filter options
  const sources = useMemo(() => {
    const s = new Set(leads.map(l => l.source).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [leads]);

  const statuses = useMemo(() => {
    const s = new Set(leads.map(l => l.status).filter(Boolean));
    return Array.from(s).sort();
  }, [leads]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = leads;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => l.client_name.toLowerCase().includes(q) || l.source?.toLowerCase().includes(q) || l.status.toLowerCase().includes(q));
    }
    if (tempFilter) list = list.filter(l => l.temperature?.toLowerCase() === tempFilter);
    if (sourceFilter) list = list.filter(l => l.source?.toLowerCase() === sourceFilter.toLowerCase());
    if (statusFilter) list = list.filter(l => l.status?.toLowerCase() === statusFilter.toLowerCase());

    return [...list].sort((a, b) => {
      let av: any, bv: any;
      switch (sortField) {
        case 'client_name': av = a.client_name.toLowerCase(); bv = b.client_name.toLowerCase(); break;
        case 'budget': av = a.budget ?? 0; bv = b.budget ?? 0; break;
        case 'updated_at': av = new Date(a.updated_at).getTime(); bv = new Date(b.updated_at).getTime(); break;
        case 'created_at': av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime(); break;
        case 'status': av = a.status?.toLowerCase() ?? ''; bv = b.status?.toLowerCase() ?? ''; break;
        case 'temperature': av = TEMP_ORDER[a.temperature?.toLowerCase()] ?? 9; bv = TEMP_ORDER[b.temperature?.toLowerCase()] ?? 9; break;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [leads, search, tempFilter, sourceFilter, statusFilter, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  }

  const activeFilters = [tempFilter, sourceFilter, statusFilter].filter(Boolean).length;

  const ThCol = ({ field, label, className }: { field: SortField; label: string; className?: string }) => (
    <th
      className={cn('px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap', className)}
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon field={field} active={sortField} dir={sortDir} />
      </div>
    </th>
  );

  return (
    <AppLayout>
      <div className="min-h-screen p-4 md:p-6 space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Leads</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filtered.length} of {leads.length} prospect{leads.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search leads…"
                className="pl-8 pr-3 py-2 text-xs bg-background border border-border/50 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/40 w-48 placeholder:text-muted-foreground/50 text-foreground"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-all',
                showFilters || activeFilters > 0
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/50',
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {activeFilters > 0 && (
                <span className="bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {activeFilters}
                </span>
              )}
            </button>

            {/* Clear filters */}
            {activeFilters > 0 && (
              <button
                onClick={() => { setTempFilter(null); setSourceFilter(null); setStatusFilter(null); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Filter panel ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="card-premium p-4 space-y-3">
                {/* Temperature */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-16 shrink-0">Temp</span>
                  <Pill label="All" active={!tempFilter} onClick={() => setTempFilter(null)} />
                  <Pill label="🔥 Hot"  active={tempFilter === 'hot'}  color="hsl(var(--destructive))" onClick={() => setTempFilter(tempFilter === 'hot'  ? null : 'hot')} />
                  <Pill label="☀️ Warm" active={tempFilter === 'warm'} color="hsl(var(--warning))"     onClick={() => setTempFilter(tempFilter === 'warm' ? null : 'warm')} />
                  <Pill label="❄️ Cold" active={tempFilter === 'cold'} color="hsl(var(--info))"        onClick={() => setTempFilter(tempFilter === 'cold' ? null : 'cold')} />
                </div>

                {/* Source */}
                {sources.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-16 shrink-0">Source</span>
                    <Pill label="All" active={!sourceFilter} onClick={() => setSourceFilter(null)} />
                    {sources.map(s => (
                      <Pill
                        key={s}
                        label={s}
                        active={sourceFilter?.toLowerCase() === s.toLowerCase()}
                        color={srcColor(s)}
                        onClick={() => setSourceFilter(sourceFilter?.toLowerCase() === s.toLowerCase() ? null : s)}
                      />
                    ))}
                  </div>
                )}

                {/* Status */}
                {statuses.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-16 shrink-0">Status</span>
                    <Pill label="All" active={!statusFilter} onClick={() => setStatusFilter(null)} />
                    {statuses.map(s => (
                      <Pill
                        key={s}
                        label={s}
                        active={statusFilter?.toLowerCase() === s.toLowerCase()}
                        onClick={() => setStatusFilter(statusFilter?.toLowerCase() === s.toLowerCase() ? null : s)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Summary KPIs ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Leads',  value: leads.length,                                               color: 'text-foreground' },
            { label: '🔥 Hot',      value: leads.filter(l => l.temperature?.toLowerCase() === 'hot').length,  color: 'text-destructive' },
            { label: '☀️ Warm',     value: leads.filter(l => l.temperature?.toLowerCase() === 'warm').length, color: 'text-warning' },
            { label: 'Overdue 48h', value: leads.filter(l => (Date.now() - new Date(l.updated_at).getTime()) / 3_600_000 > 48).length, color: 'text-destructive' },
          ].map(kpi => (
            <div key={kpi.label} className="card-premium px-4 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
              <p className={cn('text-2xl font-bold mt-0.5', kpi.color)}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className="card-premium overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading leads…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-10 h-10 rounded-2xl bg-muted/40 flex items-center justify-center">
                <Users className="w-5 h-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-foreground">No leads match your filters</p>
              <p className="text-xs text-muted-foreground">Try adjusting your search or clearing filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    <th className="px-4 py-3 text-left w-6" />
                    <ThCol field="client_name" label="Name" />
                    <ThCol field="temperature" label="Temp" />
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider whitespace-nowrap">Source</th>
                    <ThCol field="budget" label="Budget" />
                    <ThCol field="status" label="Status" />
                    <ThCol field="updated_at" label="Last Activity" />
                    <ThCol field="created_at" label="Added" />
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {filtered.map((lead, i) => (
                      <motion.tr
                        key={lead.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.015, duration: 0.2 }}
                        onClick={() => setSelected(lead)}
                        className="border-b border-border/20 last:border-0 hover:bg-muted/20 cursor-pointer transition-colors group"
                      >
                        {/* Urgency dot */}
                        <td className="px-4 py-3">
                          <UrgencyBar updated_at={lead.updated_at} />
                        </td>

                        {/* Name */}
                        <td className="px-4 py-3">
                          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {lead.client_name}
                          </span>
                        </td>

                        {/* Temp */}
                        <td className="px-4 py-3">
                          <TempBadge temp={lead.temperature} />
                        </td>

                        {/* Source */}
                        <td className="px-4 py-3">
                          {lead.source ? (
                            <span
                              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                              style={{ color: srcColor(lead.source), background: `${srcColor(lead.source)}18` }}
                            >
                              {lead.source}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>

                        {/* Budget */}
                        <td className="px-4 py-3">
                          <span className="text-sm font-semibold text-foreground">{formatBudget(lead.budget)}</span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <StatusBadge status={lead.status} />
                        </td>

                        {/* Last activity */}
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true })}
                          </span>
                        </td>

                        {/* Added */}
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground/60">
                            {format(new Date(lead.created_at), 'MMM d')}
                          </span>
                        </td>

                        {/* View */}
                        <td className="px-4 py-3">
                          <span className="opacity-0 group-hover:opacity-100 text-[10px] font-bold px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 transition-opacity">
                            View →
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Lead detail sheet */}
      <LeadDetailSheet
        prospect={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </AppLayout>
  );
}
