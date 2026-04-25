import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Plus, X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';
import { formatDistanceToNow } from 'date-fns';
import { AddLeadDialog } from '@/components/crm/leads/AddLeadDialog';
import { FilterPanel } from '@/components/crm/leads/FilterPanel';
import { useDynamicFilterOptions } from '@/hooks/useCrmContacts';
import { useCrmLeadSegments } from '@/hooks/useCrmLeadSegments';
import { contactMatchesSegment, computeSegmentCounts } from '@/lib/segmentMatching';
import type { CrmContact } from '@/hooks/useCrmContacts';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

type TabId = 'leads' | 'pipeline';

const STATUS_TINT: Record<string, string> = {
  'New Lead': 'hsl(var(--primary))',
  Hot: 'hsl(0 84% 60%)',
  Warm: 'hsl(38 92% 50%)',
  Cold: 'hsl(220 10% 55%)',
  Closed: 'hsl(142 71% 35%)',
  Lost: 'hsl(0 0% 50%)',
};

function tintFor(status?: string | null): string {
  if (!status) return 'hsl(var(--muted-foreground))';
  return STATUS_TINT[status] ?? 'hsl(var(--muted-foreground))';
}

function LeadCard({ contact, onClick }: { contact: CrmContact; onClick: () => void }) {
  const name = formatContactName(contact.first_name, contact.last_name) || 'Unnamed';
  const initials = ((contact.first_name?.[0] || '') + (contact.last_name?.[0] || '')).toUpperCase() || '?';
  const lastTouch = (contact as any).last_touch_at;
  const lastTouchLabel = lastTouch
    ? formatDistanceToNow(new Date(lastTouch), { addSuffix: true })
    : 'No activity';
  const tint = tintFor(contact.status);
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 bg-card border border-border/60 rounded-xl active:scale-[0.99] active:bg-muted/40 transition-all text-left"
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
        style={{ background: `${tint} / 0.12`, color: tint, backgroundColor: `color-mix(in srgb, ${tint} 12%, transparent)` }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[14px] font-semibold text-foreground truncate">{name}</p>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground truncate">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: tint }}
          />
          <span className="truncate">{contact.status ?? 'New Lead'}</span>
          {contact.source && (
            <>
              <span className="opacity-40">·</span>
              <span className="truncate">{contact.source}</span>
            </>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{lastTouchLabel}</p>
      </div>
    </button>
  );
}

interface Props {
  /** Which tab opens by default — driven by the route. */
  initialTab: TabId;
  /** The original desktop page rendered when not mobile (the parent passes this). */
  children: ReactNode;
  /** When true, render the mobile shell. When false, render `children` (desktop). */
  active: boolean;
}

/**
 * Shared mobile shell for the Leads + Pipeline area.
 * Renders a tabbed interface (Leads / Pipeline) and a sticky bottom quick-actions
 * bar (Search · Filter · Add). Sits above the global BottomNav (96px).
 */
export function CrmLeadsMobileShell({ initialTab, children, active }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>(initialTab);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  // Filters (mobile-scoped — kept simple to mirror desktop FilterPanel API)
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterSource, setFilterSource] = useState<string[]>([]);
  const [filterAgent, setFilterAgent] = useState<string[]>([]);
  const [filterProject, setFilterProject] = useState<string[]>([]);
  const [filterLeadType, setFilterLeadType] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterCity, setFilterCity] = useState<string[]>([]);
  const [filterCampaign, setFilterCampaign] = useState<string[]>([]);
  const [filterContactType, setFilterContactType] = useState('');
  const [filterLanguage, setFilterLanguage] = useState<string[]>([]);
  const [filterExcludeTags, setFilterExcludeTags] = useState<string[]>([]);
  const [filterPropertyType, setFilterPropertyType] = useState<string[]>([]);
  const [filterPreApproved, setFilterPreApproved] = useState<string[]>([]);

  const { data: allContacts = [], isLoading } = useCrmContacts();
  const dynamicOpts = useDynamicFilterOptions(allContacts);
  const { data: segments = [] } = useCrmLeadSegments();

  const segmentCounts = useMemo(() => computeSegmentCounts(allContacts, segments), [allContacts, segments]);
  const activeSegment = useMemo(() => segments.find(s => s.id === activeSegmentId) ?? null, [segments, activeSegmentId]);

  const activeFilterCount =
    (filterStatus.length ? 1 : 0) +
    (filterSource.length ? 1 : 0) +
    (filterAgent.length ? 1 : 0) +
    (filterProject.length ? 1 : 0) +
    (filterLeadType.length ? 1 : 0) +
    (filterTags.length ? 1 : 0) +
    (filterCity.length ? 1 : 0) +
    (filterCampaign.length ? 1 : 0) +
    (filterContactType ? 1 : 0) +
    (filterLanguage.length ? 1 : 0) +
    (filterExcludeTags.length ? 1 : 0) +
    (filterPropertyType.length ? 1 : 0) +
    (filterPreApproved.length ? 1 : 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allContacts.filter(c => {
      if (q) {
        const hay = `${c.first_name ?? ''} ${c.last_name ?? ''} ${c.email ?? ''} ${c.phone ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterStatus.length && !filterStatus.includes(c.status ?? '')) return false;
      if (filterSource.length && !filterSource.includes(c.source ?? '')) return false;
      if (filterAgent.length && !filterAgent.includes(c.assigned_to ?? '')) return false;
      if (filterContactType && c.contact_type !== filterContactType) return false;
      if (activeSegment && !contactMatchesSegment(c, activeSegment)) return false;
      return true;
    });
  }, [allContacts, search, filterStatus, filterSource, filterAgent, filterContactType, activeSegment]);

  // Group by segment for the Pipeline tab (vertical stack)
  const grouped = useMemo(() => {
    const buckets: { segment: { id: string; name: string; emoji: string | null; color: string }; items: CrmContact[] }[] = [];
    const used = new Set<string>();
    segments.forEach(seg => {
      const items = filtered.filter(c => !used.has(c.id) && contactMatchesSegment(c, seg));
      items.forEach(c => used.add(c.id));
      buckets.push({
        segment: { id: seg.id, name: seg.name, emoji: seg.emoji ?? null, color: seg.color },
        items,
      });
    });
    const orphans = filtered.filter(c => !used.has(c.id));
    if (orphans.length) {
      buckets.push({
        segment: { id: '__other', name: 'Other', emoji: '•', color: 'hsl(220 10% 55%)' },
        items: orphans,
      });
    }
    return buckets;
  }, [filtered, segments]);

  const goToLead = (id: string) => navigate(`/crm/leads/${id}`);

  if (!active) return <>{children}</>;

  return (
    <div className="-mx-3 -mt-3 sm:-mx-4 sm:-mt-4 flex flex-col" style={{ minHeight: 'calc(100dvh - 60px)' }}>
      {/* Sticky tab header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
          <TabsList className="w-full h-12 bg-transparent rounded-none p-0 grid grid-cols-2">
            <TabsTrigger
              value="leads"
              onClick={() => navigate('/crm/leads', { replace: true })}
              className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary text-[13px] font-semibold gap-1.5"
            >
              Leads
              <span className="text-[10px] tabular-nums opacity-60">
                {allContacts.length.toLocaleString()}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="pipeline"
              onClick={() => navigate('/crm/pipeline', { replace: true })}
              className="h-12 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary text-[13px] font-semibold"
            >
              Pipeline
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Segment pills (shared by both tabs) */}
        {segments.length > 0 && (
          <ScrollArea className="w-full">
            <div className="flex items-center gap-1.5 px-3 py-2 min-w-max">
              <button
                onClick={() => setActiveSegmentId(null)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors ${
                  !activeSegmentId
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-transparent border-border/60 text-muted-foreground'
                }`}
              >
                All
              </button>
              {segments.map(seg => {
                const isActive = activeSegmentId === seg.id;
                const count = segmentCounts[seg.id];
                return (
                  <button
                    key={seg.id}
                    onClick={() => setActiveSegmentId(isActive ? null : seg.id)}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border transition-colors"
                    style={
                      isActive
                        ? { background: seg.color, borderColor: seg.color, color: 'hsl(var(--primary-foreground))' }
                        : { background: 'transparent', borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }
                    }
                  >
                    {seg.emoji && <span>{seg.emoji}</span>}
                    {seg.name}
                    {count !== undefined && (
                      <span className="text-[10px] tabular-nums opacity-80">
                        {count.toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </div>

      {/* Inline search bar (slides in when toggled) */}
      {searchOpen && (
        <div className="sticky top-[105px] z-20 bg-background border-b border-border px-3 py-2 flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="h-9 border-0 focus-visible:ring-0 px-0 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => { setSearchOpen(false); setSearch(''); }}
            className="text-[12px] font-semibold text-primary px-1"
          >
            Done
          </button>
        </div>
      )}

      {/* Active filter summary */}
      {(activeFilterCount > 0 || activeSegment) && (
        <div className="px-3 py-2 flex items-center gap-2 text-[11px] text-muted-foreground border-b border-border/40">
          <Filter className="w-3 h-3" />
          <span>
            {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
            {activeSegment ? ` · ${activeSegment.name}` : ''}
          </span>
          <button
            className="ml-auto text-primary font-semibold"
            onClick={() => {
              setFilterStatus([]); setFilterSource([]); setFilterAgent([]);
              setFilterProject([]); setFilterLeadType([]); setFilterTags([]);
              setFilterCity([]); setFilterCampaign([]); setFilterContactType('');
              setFilterLanguage([]); setFilterExcludeTags([]); setFilterPropertyType([]);
              setFilterPreApproved([]);
              setActiveSegmentId(null);
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 px-3 pt-3 pb-[calc(80px+env(safe-area-inset-bottom,0px))]">
        {tab === 'leads' && (
          <div className="space-y-2">
            {isLoading && filtered.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[68px] rounded-xl bg-muted/40 animate-pulse" />
              ))
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-sm">No leads match your filters.</p>
              </div>
            ) : (
              filtered.slice(0, 200).map(c => (
                <LeadCard key={c.id} contact={c} onClick={() => goToLead(c.id)} />
              ))
            )}
            {filtered.length > 200 && (
              <p className="text-center text-[11px] text-muted-foreground py-3">
                Showing 200 of {filtered.length.toLocaleString()} — refine filters to narrow results.
              </p>
            )}
          </div>
        )}

        {tab === 'pipeline' && (
          <div className="space-y-5">
            {grouped.map(({ segment, items }) => (
              <section key={segment.id}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: segment.color }}
                    />
                    <h3 className="text-[12px] font-bold uppercase tracking-wider text-foreground">
                      {segment.emoji && <span className="mr-1">{segment.emoji}</span>}
                      {segment.name}
                    </h3>
                  </div>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/70 px-1 py-3">No leads in this stage.</p>
                ) : (
                  <div className="space-y-1.5">
                    {items.slice(0, 25).map(c => (
                      <LeadCard key={c.id} contact={c} onClick={() => goToLead(c.id)} />
                    ))}
                    {items.length > 25 && (
                      <p className="text-center text-[10px] text-muted-foreground/70 py-1">
                        + {items.length - 25} more
                      </p>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Sticky quick-actions bar — sits above global BottomNav (96px) */}
      <div
        className="fixed left-0 right-0 z-30 bg-background/95 backdrop-blur-md border-t border-border"
        style={{ bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-stretch gap-1.5 px-3 py-2">
          <button
            onClick={() => setSearchOpen(s => !s)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 h-12 rounded-xl bg-card border border-border hover:border-primary/40 active:scale-95 transition-all"
            aria-label="Search"
          >
            <Search className="w-[15px] h-[15px] text-primary" strokeWidth={2.2} />
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">Search</span>
          </button>
          <button
            onClick={() => setFiltersOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 h-12 rounded-xl bg-card border border-border hover:border-primary/40 active:scale-95 transition-all relative"
            aria-label="Filters"
          >
            <Filter className="w-[15px] h-[15px] text-primary" strokeWidth={2.2} />
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">Filter</span>
            {activeFilterCount > 0 && (
              <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 h-12 rounded-xl text-primary-foreground active:scale-95 transition-all"
            style={{ background: 'hsl(var(--primary))' }}
            aria-label="Add Lead"
          >
            <Plus className="w-[15px] h-[15px]" strokeWidth={2.5} />
            <span className="text-[9.5px] font-bold uppercase tracking-wider">Add Lead</span>
          </button>
        </div>
      </div>

      {/* Filter sheet — reuse desktop FilterPanel inside a bottom sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0 overflow-hidden">
          <FilterPanel
            open={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            filterContactType={filterContactType}
            setFilterContactType={setFilterContactType}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            filterSource={filterSource}
            setFilterSource={setFilterSource}
            filterAgent={filterAgent}
            setFilterAgent={setFilterAgent}
            filterProject={filterProject}
            setFilterProject={setFilterProject}
            filterLeadType={filterLeadType}
            setFilterLeadType={setFilterLeadType}
            filterLanguage={filterLanguage}
            setFilterLanguage={setFilterLanguage}
            filterTags={filterTags}
            setFilterTags={setFilterTags}
            filterExcludeTags={filterExcludeTags}
            setFilterExcludeTags={setFilterExcludeTags}
            filterPropertyType={filterPropertyType}
            setFilterPropertyType={setFilterPropertyType}
            filterCity={filterCity}
            setFilterCity={setFilterCity}
            filterPreApproved={filterPreApproved}
            setFilterPreApproved={setFilterPreApproved}
            filterCampaign={filterCampaign}
            setFilterCampaign={setFilterCampaign}
            dynamicProjects={dynamicOpts.projects}
            dynamicLanguages={dynamicOpts.languages}
            dynamicTags={dynamicOpts.tags}
            dynamicCities={dynamicOpts.cities}
            dynamicCampaigns={dynamicOpts.campaigns}
            dynamicLeadTypes={dynamicOpts.leadTypes}
            tagCounts={dynamicOpts.tagCounts}
            projectCounts={dynamicOpts.projectCounts}
            leadTypeCounts={dynamicOpts.leadTypeCounts}
            onClearAll={() => {
              setFilterStatus([]); setFilterSource([]); setFilterAgent([]);
              setFilterProject([]); setFilterLeadType([]); setFilterTags([]);
              setFilterCity([]); setFilterCampaign([]); setFilterContactType('');
              setFilterLanguage([]); setFilterExcludeTags([]); setFilterPropertyType([]);
              setFilterPreApproved([]);
            }}
            activeFilterCount={activeFilterCount}
          />
        </SheetContent>
      </Sheet>

      <AddLeadDialog open={showAdd} onOpenChange={setShowAdd} />
    </div>
  );
}
