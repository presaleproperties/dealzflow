import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Filter, Settings2, Eye, X } from 'lucide-react';
import { useDynamicFilterOptions, LEAD_STATUSES, LEAD_SOURCES, AGENTS, LEAD_TYPES, useCrmContacts } from '@/hooks/useCrmContacts';
import { usePaginatedCrmContacts } from '@/hooks/usePaginatedCrmContacts';
import type { SortKey, SortDir } from '@/hooks/usePaginatedCrmContacts';
import { useCrmLeadSegments } from '@/hooks/useCrmLeadSegments';
import { computeSegmentCounts } from '@/lib/segmentMatching';
import type { LeadSegment } from '@/hooks/useCrmLeadSegments';
import { LeadsTable } from '@/components/crm/leads/LeadsTable';
import { AddLeadDialog } from '@/components/crm/leads/AddLeadDialog';
import { BulkActionsBar } from '@/components/crm/leads/BulkActionsBar';
import { ActiveFilterPills } from '@/components/crm/leads/MultiSelectFilter';
import { FilterPanel } from '@/components/crm/leads/FilterPanel';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const ALL_COLUMN_KEYS = [
  { key: 'name', label: 'Name', locked: true },
  { key: 'contactInfo', label: 'Contact Info' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'reg', label: 'Reg' },
  { key: 'project', label: 'Projects' },
  { key: 'source', label: 'Source' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'tags', label: 'Tags' },
  { key: 'assigned_to', label: 'Agent' },
  { key: 'last_touch_at', label: 'Last Touch' },
  { key: 'created_at', label: 'Added' },
  { key: 'campaign_source', label: 'Campaign' },
  { key: 'city_pref', label: 'City Pref' },
  { key: 'property_type_pref', label: 'Prop Type' },
  { key: 'is_pre_approved', label: 'Pre-Approved' },
] as const;

const DEFAULT_VISIBLE = new Set(['name', 'contactInfo', 'reg', 'pipeline', 'tags', 'assigned_to', 'last_touch_at', 'quick_actions']);

// Quick view definitions
type QuickViewId = '__all' | '__hot' | '__my' | '__uncontacted' | '__active' | '__directory' | '__stale' | '__birthday' | '__highscore';
const QUICK_VIEWS: { id: QuickViewId; label: string; emoji: string; filters: Record<string, unknown> }[] = [
  { id: '__all', label: 'All Leads', emoji: '📋', filters: {} },
  { id: '__hot', label: 'Hot Leads', emoji: '🔥', filters: { status: ['Hot / Engaged'] } },
  { id: '__my', label: 'My Leads', emoji: '👤', filters: { assigned_to: '__current_user__' } },
  { id: '__uncontacted', label: 'No Contact 7d+', emoji: '⚠️', filters: { _uncontacted_7: true } },
  { id: '__stale', label: 'Stale (30d+)', emoji: '💤', filters: { _stale_30: true } },
  { id: '__highscore', label: 'High Score', emoji: '⭐', filters: { _high_score: true } },
  { id: '__birthday', label: 'Birthday This Month', emoji: '🎂', filters: { _birthday_month: true } },
  { id: '__active', label: 'Active Pipeline', emoji: '📊', filters: { _pipeline: 'active' } },
  { id: '__directory', label: 'Full Directory', emoji: '📒', filters: { _pipeline: 'directory' } },
];

export default function CrmLeadsPage() {
  const { data: allContacts = [] } = useCrmContacts();
  const dynamicOpts = useDynamicFilterOptions(allContacts);
  const isMobile = useIsMobile();

  // Quick view state
  const [activeViewId, setActiveViewId] = useState<QuickViewId>('__all');

  // View counts
  const viewCounts = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const currentMonth = new Date().getMonth() + 1;
    return {
      '__all': allContacts.length,
      '__hot': allContacts.filter(c => c.status === 'Hot / Engaged').length,
      '__my': allContacts.filter(c => c.assigned_to === 'Uzair').length,
      '__uncontacted': allContacts.filter(c => !c.last_touch_at || new Date(c.last_touch_at).getTime() < sevenDaysAgo).length,
      '__stale': allContacts.filter(c => !c.last_touch_at || new Date(c.last_touch_at).getTime() < thirtyDaysAgo).length,
      '__highscore': allContacts.filter(c => (c.lead_score ?? 0) >= 70).length,
      '__birthday': allContacts.filter(c => {
        if (!c.birthday) return false;
        const bMonth = new Date(c.birthday).getMonth() + 1;
        return bMonth === currentMonth;
      }).length,
      '__active': allContacts.filter(c => c.status !== 'Closed' && c.status !== 'Lost / Cold').length,
      '__directory': allContacts.length,
    } as Record<QuickViewId, number>;
  }, [allContacts]);

  // Segments
  const { data: segments = [] } = useCrmLeadSegments();
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  // Determine active view
  const activeView = useMemo(() => {
    return QUICK_VIEWS.find(v => v.id === activeViewId) ?? QUICK_VIEWS[0];
  }, [activeViewId]);

  // Determine pipeline view mode from active view
  const pipelineView = useMemo(() => {
    const f = activeView.filters;
    if (f._pipeline === 'active') return 'active' as const;
    if (f._pipeline === 'directory') return 'directory' as const;
    return 'all' as const;
  }, [activeView]);

  // Active segment
  const activeSegment = useMemo(() => segments.find(s => s.id === activeSegmentId), [segments, activeSegmentId]);

  // Build saved view base filters
  const savedViewFilters = useMemo(() => {
    const f = { ...activeView.filters };
    delete f._pipeline;
    delete f._uncontacted_7;
    if (f.assigned_to === '__current_user__') {
      f.assigned_to = 'Uzair';
    }
    return Object.keys(f).length > 0 ? f : undefined;
  }, [activeView]);

  // Segment counts — uses same first-match-wins logic as Pipeline Kanban
  const segmentCounts = useMemo(() => computeSegmentCounts(allContacts, segments), [allContacts, segments]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchTimeout, setSearchTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [letterFilter, setLetterFilter] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(DEFAULT_VISIBLE);

  const [filterContactType, setFilterContactType] = useState('');
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterSource, setFilterSource] = useState<string[]>([]);
  const [filterAgent, setFilterAgent] = useState<string[]>([]);
  const [filterProject, setFilterProject] = useState<string[]>([]);
  const [filterLeadType, setFilterLeadType] = useState<string[]>([]);
  const [filterLanguage, setFilterLanguage] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterPropertyType, setFilterPropertyType] = useState<string[]>([]);
  const [filterCity, setFilterCity] = useState<string[]>([]);
  const [filterPreApproved, setFilterPreApproved] = useState<string[]>([]);
  const [filterCampaign, setFilterCampaign] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(() => Number(searchParams.get('page')) || 1);
  const [pageSize, setPageSize] = useState(50);
  const [sortKey, setSortKey] = useState<SortKey>(() => (searchParams.get('sort') as SortKey) || 'created_at');
  const [sortDir, setSortDir] = useState<SortDir>(() => (searchParams.get('dir') as SortDir) || 'desc');
  const [showAdd, setShowAdd] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Read initial view from URL
  useEffect(() => {
    const viewParam = searchParams.get('view') as QuickViewId | null;
    if (viewParam && QUICK_VIEWS.some(v => v.id === viewParam) && viewParam !== activeViewId) {
      setActiveViewId(viewParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeViewId !== '__all') params.set('view', activeViewId);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (sortKey !== 'created_at') params.set('sort', sortKey);
    if (sortDir !== 'desc') params.set('dir', sortDir);
    if (page > 1) params.set('page', String(page));
    if (activeSegmentId) params.set('segment', activeSegmentId);
    setSearchParams(params, { replace: true });
  }, [activeViewId, debouncedSearch, sortKey, sortDir, page, activeSegmentId, setSearchParams]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    const t = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
    setSearchTimeoutId(t);
  }, [searchTimeout]);

  const { contacts, totalCount, isLoading, isFetching } = usePaginatedCrmContacts({
    page,
    pageSize,
    sortKey: pipelineView === 'directory' && sortKey === 'created_at' ? 'name' : sortKey,
    sortDir: pipelineView === 'directory' && sortKey === 'created_at' ? 'asc' : sortDir,
    filters: {
      search: debouncedSearch,
      contactType: filterContactType,
      statuses: filterStatus,
      sources: filterSource,
      agents: filterAgent,
      projects: filterProject,
      leadTypes: filterLeadType,
      languages: filterLanguage,
      tags: filterTags,
      propertyTypes: filterPropertyType,
      cities: filterCity,
      preApproved: filterPreApproved,
      campaigns: filterCampaign,
      letterFilter,
      pipelineView,
      savedViewFilters: savedViewFilters,
      segmentFilters: activeSegment?.filter_config as Record<string, unknown> | undefined,
      uncontacted7: !!activeView.filters._uncontacted_7,
      stale30: !!activeView.filters._stale_30,
      highScore: !!activeView.filters._high_score,
      birthdayMonth: !!activeView.filters._birthday_month,
    },
  });

  const activeFilterCount = [
    filterContactType ? 1 : 0,
    filterStatus.length > 0 ? 1 : 0,
    filterSource.length > 0 ? 1 : 0,
    filterAgent.length > 0 ? 1 : 0,
    filterProject.length > 0 ? 1 : 0,
    filterLeadType.length > 0 ? 1 : 0,
    filterLanguage.length > 0 ? 1 : 0,
    filterTags.length > 0 ? 1 : 0,
    filterPropertyType.length > 0 ? 1 : 0,
    filterCity.length > 0 ? 1 : 0,
    filterPreApproved.length > 0 ? 1 : 0,
    filterCampaign.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearAllFilters = () => {
    setFilterContactType(''); setFilterStatus([]); setFilterSource([]); setFilterAgent([]);
    setFilterProject([]); setFilterLeadType([]); setFilterLanguage([]); setFilterTags([]);
    setFilterPropertyType([]); setFilterCity([]); setFilterPreApproved([]); setFilterCampaign([]);
    setLetterFilter(''); setPage(1);
  };

  const clearFilter = (key: string) => {
    const map: Record<string, () => void> = {
      contactType: () => setFilterContactType(''), status: () => setFilterStatus([]),
      source: () => setFilterSource([]), agent: () => setFilterAgent([]),
      project: () => setFilterProject([]), leadType: () => setFilterLeadType([]),
      language: () => setFilterLanguage([]), tags: () => setFilterTags([]),
      propertyType: () => setFilterPropertyType([]), city: () => setFilterCity([]),
      preApproved: () => setFilterPreApproved([]), campaign: () => setFilterCampaign([]),
    };
    map[key]?.(); setPage(1);
  };

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  }, [sortKey]);

  const handlePageSizeChange = useCallback((size: number) => { setPageSize(size); setPage(1); }, []);

  const handleViewChange = (viewId: QuickViewId) => {
    setActiveViewId(viewId);
    setPage(1);
    setActiveSegmentId(null);
    if (viewId === '__directory') {
      setSortKey('name'); setSortDir('asc');
    }
    if (viewId !== '__directory') setLetterFilter('');
  };

  const handleSegmentClick = (seg: LeadSegment) => {
    if (activeSegmentId === seg.id) setActiveSegmentId(null);
    else setActiveSegmentId(seg.id);
    setPage(1);
  };

  const handleLetterClick = (letter: string) => {
    setLetterFilter(prev => prev === letter ? '' : letter);
    setPage(1);
  };

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const filterPills = [
    { key: 'contactType', label: 'Type', values: filterContactType ? [filterContactType] : [] },
    { key: 'status', label: 'Status', values: filterStatus },
    { key: 'source', label: 'Source', values: filterSource },
    { key: 'agent', label: 'Agent', values: filterAgent },
    { key: 'project', label: 'Project', values: filterProject },
    { key: 'leadType', label: 'Lead Type', values: filterLeadType },
    { key: 'language', label: 'Language', values: filterLanguage },
    { key: 'tags', label: 'Tags', values: filterTags },
    { key: 'propertyType', label: 'Prop Type', values: filterPropertyType },
    { key: 'city', label: 'City', values: filterCity },
    { key: 'preApproved', label: 'Pre-Approved', values: filterPreApproved },
    { key: 'campaign', label: 'Campaign', values: filterCampaign },
  ];

  const isAllSegment = !activeSegmentId || (activeSegment && Object.keys(activeSegment.filter_config).length === 0);

  const activeQuickView = QUICK_VIEWS.find(v => v.id === activeViewId);
  const isDefaultView = activeViewId === '__all';

  return (
    <>
      <div className="flex flex-1 min-h-0 h-full">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-3 sm:space-y-4 overflow-y-auto pr-1">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h1 className="text-lg sm:text-xl font-bold text-foreground">Leads & Contacts</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Manage your leads, contacts, and pipeline from one place</p>
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 hidden sm:flex">
                    <Settings2 className="w-3.5 h-3.5" /> Columns
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-48 p-2">
                  <p className="text-xs font-semibold text-muted-foreground px-2 pb-1.5">Toggle columns</p>
                  {ALL_COLUMN_KEYS.map(col => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm">
                      <Checkbox
                        checked={visibleColumns.has(col.key)}
                        onCheckedChange={() => !('locked' in col && col.locked) && toggleColumn(col.key)}
                        disabled={'locked' in col && col.locked}
                      />
                      {col.label}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
              <Button onClick={() => setShowAdd(true)} size="sm" className="h-9 bg-primary text-primary-foreground gap-1.5 hidden sm:flex">
                <Plus className="w-4 h-4" /> Add Lead
              </Button>
            </div>
          </div>

          {/* Pipeline Segment Pills */}
          {segments.length > 0 && (
            <ScrollArea className="w-full">
              <div className="flex items-center gap-1.5 pb-1 min-w-max">
                {segments.map(seg => {
                  const isActive = activeSegmentId === seg.id || (isAllSegment && Object.keys(seg.filter_config).length === 0 && !activeSegmentId);
                  const count = segmentCounts[seg.id];
                  return (
                    <button
                      key={seg.id}
                      onClick={() => handleSegmentClick(seg)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all border ${
                        isActive
                          ? 'text-white shadow-sm'
                          : 'bg-transparent border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
                      }`}
                      style={isActive ? { background: seg.color, borderColor: seg.color } : undefined}
                    >
                      {seg.emoji && <span>{seg.emoji}</span>}
                      {seg.name}
                      {count !== undefined && (
                        <span className={`text-[10px] font-bold ${isActive ? 'opacity-80' : 'text-muted-foreground'}`}>
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

          {/* A-Z letter filter */}
          {(pipelineView === 'directory' || letterFilter) && (
            <div className="flex items-center gap-0.5 flex-wrap">
              <button
                onClick={() => { setLetterFilter(''); setPage(1); }}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                  !letterFilter ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >All</button>
              {ALPHABET.map(letter => (
                <button key={letter} onClick={() => handleLetterClick(letter)}
                  className={`w-7 h-7 rounded text-[11px] font-semibold transition-colors ${
                    letterFilter === letter ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >{letter}</button>
              ))}
            </div>
          )}

          {/* Search + Quick Views + Filter toggle */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search by name, email, or phone..." className="pl-8 pr-8 h-10 sm:h-9 w-full text-sm" />
              {search && (
                <button
                  onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Views dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={isDefaultView ? 'outline' : 'default'}
                  size="sm"
                  className={`h-9 gap-1.5 shrink-0 ${!isDefaultView ? 'bg-primary text-primary-foreground' : ''}`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {isDefaultView ? 'Quick Views' : activeQuickView?.label}
                  </span>
                  {!isDefaultView && <span className="sm:hidden">View</span>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {QUICK_VIEWS.map(view => (
                  <DropdownMenuItem
                    key={view.id}
                    onClick={() => handleViewChange(view.id)}
                    className={`gap-2 ${activeViewId === view.id ? 'bg-primary/10 text-primary font-semibold' : ''}`}
                  >
                    <span>{view.emoji}</span>
                    <span className="flex-1">{view.label}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {(viewCounts[view.id] ?? 0).toLocaleString()}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant={filtersExpanded ? 'default' : 'outline'}
              size="sm"
              className="h-9 gap-1.5 shrink-0"
              onClick={() => setFiltersExpanded(!filtersExpanded)}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">{activeFilterCount}</Badge>
              )}
            </Button>
          </div>

          {/* Mobile: FAB Add Lead */}
          <button
            onClick={() => setShowAdd(true)}
            className="sm:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
            style={{ boxShadow: '0 4px 14px hsl(39 67% 55% / 0.4)' }}
          >
            <Plus className="w-6 h-6" />
          </button>

          {/* Filter pills */}
          <ActiveFilterPills filters={filterPills} onClear={clearFilter} onClearAll={clearAllFilters} />

          {/* Bulk actions */}
          <BulkActionsBar selectedIds={selectedIds} onClearSelection={() => setSelectedIds([])} />

          {/* Table */}
          <LeadsTable
            contacts={contacts} isLoading={isLoading} isFetching={isFetching} totalCount={totalCount}
            selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={handlePageSizeChange}
            sortKey={sortKey} sortDir={sortDir} onSort={handleSort} visibleColumns={visibleColumns}
          />
        </div>

        {/* Right-side Filter Panel */}
        <FilterPanel
          open={filtersExpanded}
          onClose={() => setFiltersExpanded(false)}
          filterContactType={filterContactType}
          setFilterContactType={v => {
            setFilterContactType(v);
            // Segments are pipeline stages for leads — clear segment when filtering to realtors/clients
            if (v && v !== 'lead') setActiveSegmentId(null);
            setPage(1);
          }}
          filterStatus={filterStatus}
          setFilterStatus={v => { setFilterStatus(v); setPage(1); }}
          filterSource={filterSource}
          setFilterSource={v => { setFilterSource(v); setPage(1); }}
          filterAgent={filterAgent}
          setFilterAgent={v => { setFilterAgent(v); setPage(1); }}
          filterProject={filterProject}
          setFilterProject={v => { setFilterProject(v); setPage(1); }}
          filterLeadType={filterLeadType}
          setFilterLeadType={v => { setFilterLeadType(v); setPage(1); }}
          filterLanguage={filterLanguage}
          setFilterLanguage={v => { setFilterLanguage(v); setPage(1); }}
          filterTags={filterTags}
          setFilterTags={v => { setFilterTags(v); setPage(1); }}
          filterPropertyType={filterPropertyType}
          setFilterPropertyType={v => { setFilterPropertyType(v); setPage(1); }}
          filterCity={filterCity}
          setFilterCity={v => { setFilterCity(v); setPage(1); }}
          filterPreApproved={filterPreApproved}
          setFilterPreApproved={v => { setFilterPreApproved(v); setPage(1); }}
          filterCampaign={filterCampaign}
          setFilterCampaign={v => { setFilterCampaign(v); setPage(1); }}
          dynamicProjects={dynamicOpts.projects}
          dynamicLanguages={dynamicOpts.languages}
          dynamicTags={dynamicOpts.tags}
          dynamicCities={dynamicOpts.cities}
          dynamicCampaigns={dynamicOpts.campaigns}
          onClearAll={clearAllFilters}
          activeFilterCount={activeFilterCount}
        />
      </div>

      <AddLeadDialog open={showAdd} onOpenChange={setShowAdd} />
    </>
  );
}
