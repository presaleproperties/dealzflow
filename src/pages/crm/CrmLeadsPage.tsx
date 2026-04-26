import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Filter, Settings2, Eye, X, ArrowDownNarrowWide, Check, ChevronDown } from 'lucide-react';
import { useDynamicFilterOptions, LEAD_STATUSES, LEAD_SOURCES, AGENTS, LEAD_TYPES } from '@/hooks/useCrmContacts';
import { useCrmContactsLite } from '@/hooks/useCrmContactsLite';
import { usePaginatedCrmContacts } from '@/hooks/usePaginatedCrmContacts';
import type { SortKey, SortDir } from '@/hooks/usePaginatedCrmContacts';
import { useCrmLeadSegments, useReorderCrmLeadSegments } from '@/hooks/useCrmLeadSegments';
import { computeSegmentCounts } from '@/lib/segmentMatching';
import type { LeadSegment } from '@/hooks/useCrmLeadSegments';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { GripVertical } from 'lucide-react';
import { LeadsTable } from '@/components/crm/leads/LeadsTable';
import { ConversionFunnelBanner } from '@/components/crm/leads/ConversionFunnelBanner';
import { ManagePipelinesDialog } from '@/components/crm/leads/ManagePipelinesDialog';
import { AddLeadDialog } from '@/components/crm/leads/AddLeadDialog';
import { BulkActionsBar } from '@/components/crm/leads/BulkActionsBar';
import { ActiveFilterPills } from '@/components/crm/leads/MultiSelectFilter';
import { FilterPanel } from '@/components/crm/leads/FilterPanel';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';

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
  { key: 'last_touch_at', label: 'Last Activity' },
  { key: 'created_at', label: 'Added' },
  { key: 'campaign_source', label: 'Campaign' },
  { key: 'city_pref', label: 'City Pref' },
  { key: 'property_type_pref', label: 'Prop Type' },
  { key: 'is_pre_approved', label: 'Pre-Approved' },
] as const;

const DEFAULT_VISIBLE = new Set(['name', 'contactInfo', 'reg', 'pipeline', 'tags', 'assigned_to', 'last_touch_at', 'quick_actions']);

// Quick view definitions — kept minimal. Pipeline categories live in the pill row above.
type QuickViewId = '__all' | '__closed';
const QUICK_VIEWS: { id: QuickViewId; label: string; emoji: string; filters: Record<string, unknown> }[] = [
  { id: '__all',    label: 'All Leads', emoji: '📋', filters: {} },
  { id: '__closed', label: 'Closed',    emoji: '✅', filters: { status: ['Closed'] } },
];

// Mobile sort options — keys must match SortKey
const SORT_OPTIONS: { key: SortKey; shortLabel: string; label: string; defaultDir: SortDir }[] = [
  { key: 'last_touch_at', shortLabel: 'Recent',    label: 'Recent activity',  defaultDir: 'desc' },
  { key: 'created_at',    shortLabel: 'Newest',    label: 'Newest added',     defaultDir: 'desc' },
  { key: 'name',          shortLabel: 'Name',      label: 'Name (A–Z)',       defaultDir: 'asc'  },
];

export default function CrmLeadsPage() {
  const { data: allContacts = [], isLoading: allContactsLoading } = useCrmContactsLite();
  const dynamicOpts = useDynamicFilterOptions(allContacts);
  const isMobile = useIsMobile();

  // Quick view state
  const [activeViewId, setActiveViewId] = useState<QuickViewId>('__all');

  // View counts
  const viewCounts = useMemo(() => {
    return {
      '__all':    allContacts.length,
      '__closed': allContacts.filter(c => c.status === 'Closed').length,
    } as Record<QuickViewId, number>;
  }, [allContacts]);

  // Segments
  const { data: segments = [] } = useCrmLeadSegments();
  const reorderSegments = useReorderCrmLeadSegments();
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const reorderMode = false;
  const [managePipelinesOpen, setManagePipelinesOpen] = useState(false);

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
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('search') ?? '');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [filterExcludeTags, setFilterExcludeTags] = useState<string[]>([]);
  const [filterPropertyType, setFilterPropertyType] = useState<string[]>([]);
  const [filterCity, setFilterCity] = useState<string[]>([]);
  const [filterPreApproved, setFilterPreApproved] = useState<string[]>([]);
  const [filterCampaign, setFilterCampaign] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(() => Number(searchParams.get('page')) || 1);
  const [pageSize, setPageSize] = useState(50);
  const [sortKey, setSortKey] = useState<SortKey>(() => (searchParams.get('sort') as SortKey) || 'last_touch_at');
  const [sortDir, setSortDir] = useState<SortDir>(() => (searchParams.get('dir') as SortDir) || 'desc');
  const [showAdd, setShowAdd] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(() => !!searchParams.get('search'));

  // Mobile-only: collapse the title row on scroll, infinite scroll accumulator, sort sheet
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [accumulated, setAccumulated] = useState<any[]>([]);
  const lastFiltersKeyRef = useRef<string>('');

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
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    // Empty string → flush immediately (clear button feels instant)
    if (value.trim() === '') {
      setDebouncedSearch('');
      setPage(1);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value.trim());
      setPage(1);
    }, 250);
  }, []);

  // Cleanup pending debounce on unmount
  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);

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
      excludeTags: filterExcludeTags,
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

  // ── Mobile infinite scroll: accumulate pages locally; reset whenever filters/sort change
  const filtersKey = useMemo(() => JSON.stringify({
    debouncedSearch, filterContactType, filterStatus, filterSource, filterAgent,
    filterProject, filterLeadType, filterLanguage, filterTags, filterExcludeTags,
    filterPropertyType, filterCity, filterPreApproved, filterCampaign, letterFilter,
    pipelineView, activeSegmentId, activeViewId, sortKey, sortDir, pageSize,
  }), [debouncedSearch, filterContactType, filterStatus, filterSource, filterAgent,
       filterProject, filterLeadType, filterLanguage, filterTags, filterExcludeTags,
       filterPropertyType, filterCity, filterPreApproved, filterCampaign, letterFilter,
       pipelineView, activeSegmentId, activeViewId, sortKey, sortDir, pageSize]);

  useEffect(() => {
    if (!isMobile) return;
    if (lastFiltersKeyRef.current !== filtersKey) {
      lastFiltersKeyRef.current = filtersKey;
      setAccumulated([]);
      if (page !== 1) setPage(1);
      return;
    }
    if (contacts.length === 0) return;
    setAccumulated(prev => {
      // Merge by id to avoid duplicates if a page is re-fetched
      const seen = new Set(prev.map((c: any) => c.id));
      const additions = contacts.filter((c: any) => !seen.has(c.id));
      if (additions.length === 0 && page === 1) return contacts as any[];
      if (page === 1) return contacts as any[];
      return [...prev, ...additions];
    });
  }, [isMobile, contacts, filtersKey, page]);

  const mobileContacts = isMobile ? accumulated : contacts;
  const hasMoreMobile = isMobile && accumulated.length < totalCount && !isFetching;

  // Infinite scroll listener — fires when user is within 600px of bottom
  useEffect(() => {
    if (!isMobile) return;
    const el = mobileScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      // Collapse header after 32px scroll
      setHeaderCollapsed(el.scrollTop > 32);
      // Load more when near bottom
      if (hasMoreMobile && el.scrollHeight - el.scrollTop - el.clientHeight < 600) {
        setPage(p => p + 1);
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isMobile, hasMoreMobile]);

  const activeFilterCount = [
    filterContactType ? 1 : 0,
    filterStatus.length > 0 ? 1 : 0,
    filterSource.length > 0 ? 1 : 0,
    filterAgent.length > 0 ? 1 : 0,
    filterProject.length > 0 ? 1 : 0,
    filterLeadType.length > 0 ? 1 : 0,
    filterLanguage.length > 0 ? 1 : 0,
    filterTags.length > 0 ? 1 : 0,
    filterExcludeTags.length > 0 ? 1 : 0,
    filterPropertyType.length > 0 ? 1 : 0,
    filterCity.length > 0 ? 1 : 0,
    filterPreApproved.length > 0 ? 1 : 0,
    filterCampaign.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearAllFilters = () => {
    setFilterContactType(''); setFilterStatus([]); setFilterSource([]); setFilterAgent([]);
    setFilterProject([]); setFilterLeadType([]); setFilterLanguage([]); setFilterTags([]);
    setFilterExcludeTags([]);
    setFilterPropertyType([]); setFilterCity([]); setFilterPreApproved([]); setFilterCampaign([]);
    setLetterFilter(''); setPage(1);
  };

  const clearFilter = (key: string) => {
    const map: Record<string, () => void> = {
      contactType: () => setFilterContactType(''), status: () => setFilterStatus([]),
      source: () => setFilterSource([]), agent: () => setFilterAgent([]),
      project: () => setFilterProject([]), leadType: () => setFilterLeadType([]),
      language: () => setFilterLanguage([]), tags: () => setFilterTags([]),
      excludeTags: () => setFilterExcludeTags([]),
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
    setLetterFilter('');
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
    { key: 'excludeTags', label: 'Excluded Tags', values: filterExcludeTags },
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
        <div ref={mobileScrollRef} className="flex-1 min-w-0 max-w-full space-y-3 sm:space-y-4 overflow-y-auto overflow-x-hidden pr-1">
          {/* Mobile header — premium editorial: gold underline tabs + minimal text chips */}
          {isMobile && (
            <div className="-mx-3 sm:-mx-4 sticky top-0 z-20 bg-background border-b border-border overflow-x-hidden">
              {/* Title row — collapses on scroll to reclaim vertical space */}
              <div
                className={`overflow-hidden transition-all duration-200 ease-out ${
                  headerCollapsed ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-[60px] opacity-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-1.5">
                  <div className="flex items-baseline gap-6">
                    <button
                      className="text-[19px] font-semibold text-foreground tracking-tight border-b-2 border-primary pb-1.5"
                      aria-current="page"
                    >
                      Leads
                    </button>
                    <Link
                      to="/crm/contacts"
                      className="text-[19px] font-semibold text-muted-foreground/60 tracking-tight pb-1.5 hover:text-foreground transition-colors"
                    >
                      Contacts
                    </Link>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMobileSearchOpen(v => !v)}
                      className={`h-11 w-11 ${mobileSearchOpen || debouncedSearch ? 'text-primary' : 'text-foreground'}`}
                      aria-label={mobileSearchOpen ? 'Close search' : 'Open search'}
                      aria-expanded={mobileSearchOpen}
                    >
                      <Search className="w-6 h-6" strokeWidth={2} />
                    </Button>
                    {/* Add Lead moved to floating action button (bottom-right) */}
                  </div>
                </div>
              </div>

              {/* Inline search input — filters list as you type */}
              {mobileSearchOpen && (
                <div className="px-4 pb-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
                    <input
                      type="search"
                      autoFocus
                      value={search}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Search name, email, phone…"
                      className="w-full h-10 pl-9 pr-9 rounded-lg bg-muted/50 border border-border/60 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60"
                    />
                    {search && (
                      <button
                        onClick={() => handleSearchChange('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="w-4 h-4" strokeWidth={1.8} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Segment pills — same source/active-state logic as desktop */}
              {segments.length > 0 && (
                <div className="overflow-x-auto overscroll-x-contain scrollbar-hide border-t border-border/40">
                  <div className="flex items-center gap-1.5 px-3 py-2 min-w-max">
                    {segments.map(seg => {
                      const isActive = activeSegmentId === seg.id || (isAllSegment && Object.keys(seg.filter_config).length === 0 && !activeSegmentId);
                      const count = segmentCounts[seg.id];
                      return (
                        <button
                          key={seg.id}
                          onClick={() => handleSegmentClick(seg)}
                          className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all border ${
                            isActive
                              ? 'text-white shadow-sm'
                              : 'bg-transparent border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
                          }`}
                          style={isActive ? { background: seg.color, borderColor: seg.color } : undefined}
                        >
                          {seg.emoji && <span>{seg.emoji}</span>}
                          {seg.name}
                          {allContactsLoading ? (
                            <span className={`inline-block h-2.5 w-5 rounded-full animate-pulse ${isActive ? 'bg-white/40' : 'bg-muted-foreground/20'}`} />
                          ) : count !== undefined && (
                            <span className={`text-[10px] font-bold tabular-nums ${isActive ? 'opacity-80' : 'text-muted-foreground'}`}>
                              {count.toLocaleString()}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setManagePipelinesOpen(true)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors ml-1 shrink-0"
                      aria-label="Manage pipelines"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    {/* Inline divider + Filters/Sort — keeps the row compact instead of a full second row */}
                    <span className="mx-1 h-5 w-px bg-border/60 shrink-0" aria-hidden="true" />
                    <Button
                      variant={activeFilterCount > 0 ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setFiltersExpanded(true)}
                      className="h-8 px-2.5 gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <Filter className="w-3.5 h-3.5" />
                      Filters
                      {activeFilterCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5 bg-primary/15 text-primary">
                          {activeFilterCount}
                        </Badge>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSortSheetOpen(true)}
                      className="h-8 px-2.5 gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground shrink-0"
                      aria-label="Change sort"
                    >
                      <ArrowDownNarrowWide className="w-3.5 h-3.5" />
                      {SORT_OPTIONS.find(o => o.key === sortKey)?.shortLabel ?? 'Sort'}
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}



          {segments.length > 0 && (
            <div className={`${isMobile ? 'hidden' : 'flex'} items-center gap-3`}>
              <div className="flex-1 min-w-0">
                <ScrollArea className="w-full">
                  <DragDropContext
                    onDragEnd={(result: DropResult) => {
                      if (!result.destination || result.destination.index === result.source.index) return;
                      const next = Array.from(segments);
                      const [moved] = next.splice(result.source.index, 1);
                      next.splice(result.destination.index, 0, moved);
                      reorderSegments.mutate(next.map(s => s.id));
                    }}
                  >
                    <Droppable droppableId="segment-pills" direction="horizontal" isDropDisabled={!reorderMode}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="flex items-center gap-1.5 pb-1 min-w-max"
                        >
                          {segments.map((seg, index) => {
                            const isActive = activeSegmentId === seg.id || (isAllSegment && Object.keys(seg.filter_config).length === 0 && !activeSegmentId);
                            const count = segmentCounts[seg.id];
                            return (
                              <Draggable key={seg.id} draggableId={seg.id} index={index} isDragDisabled={!reorderMode}>
                                {(prov, snap) => (
                                  <div
                                    ref={prov.innerRef}
                                    {...prov.draggableProps}
                                    className={snap.isDragging ? 'opacity-90' : ''}
                                  >
                                    <button
                                      onClick={() => !reorderMode && handleSegmentClick(seg)}
                                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all border ${
                                        isActive
                                          ? 'text-white shadow-sm'
                                          : 'bg-transparent border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
                                      } ${reorderMode ? 'cursor-grab active:cursor-grabbing ring-1 ring-dashed ring-border' : ''}`}
                                      style={isActive ? { background: seg.color, borderColor: seg.color } : undefined}
                                    >
                                      {reorderMode && (
                                        <span {...prov.dragHandleProps} className="-ml-1 flex items-center">
                                          <GripVertical className="w-3 h-3" />
                                        </span>
                                      )}
                                      {seg.emoji && <span>{seg.emoji}</span>}
                                      {seg.name}
                                      {allContactsLoading ? (
                                        <span className={`inline-block h-2.5 w-5 rounded-full animate-pulse ${isActive ? 'bg-white/40' : 'bg-muted-foreground/20'}`} />
                                      ) : count !== undefined && (
                                        <span className={`text-[10px] font-bold tabular-nums ${isActive ? 'opacity-80' : 'text-muted-foreground'}`}>
                                          {count.toLocaleString()}
                                        </span>
                                      )}
                                    </button>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                          {!reorderMode && (
                            <button
                              onClick={() => setManagePipelinesOpen(true)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors ml-1"
                              title="Add or manage pipelines"
                              aria-label="Add or manage pipelines"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="hidden sm:inline-flex h-8 px-2 text-[11px] flex-shrink-0"
                onClick={() => setManagePipelinesOpen(true)}
                title="Add, edit, or remove pipelines"
              >
                Manage
              </Button>
              <div className="hidden sm:flex items-center flex-shrink-0 ml-2">
                <div className="flex items-center gap-1 pr-2 mr-2 border-r border-border/60">
                  <Button
                    variant={filtersExpanded ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-9 px-2.5 gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setFiltersExpanded(!filtersExpanded)}
                    title="Filters"
                  >
                    <Filter className="w-4 h-4" />
                    <span className="hidden lg:inline">Filters</span>
                    {activeFilterCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">{activeFilterCount}</Badge>
                    )}
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 px-2.5 gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
                        title="Columns"
                      >
                        <Settings2 className="w-4 h-4" />
                        <span className="hidden lg:inline">Columns</span>
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
                </div>
                <Button
                  onClick={() => setShowAdd(true)}
                  size="sm"
                  className="h-9 px-5 bg-primary text-primary-foreground gap-1.5 font-semibold shadow-sm hover:shadow-md transition-shadow"
                >
                  <Plus className="w-4 h-4" /> Add Lead
                </Button>
              </div>
            </div>
          )}

          {/* A-Z letter filter */}
          {pipelineView === 'directory' && (
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

          {/* Add Lead lives in the mobile header (matches desktop button styling) */}

          {/* Conversion funnel + untouched alert — temporarily hidden, may bring back later */}
          {/* <ConversionFunnelBanner /> */}

          {/* Filter pills */}
          <ActiveFilterPills filters={filterPills} onClear={clearFilter} onClearAll={clearAllFilters} />

          {/* Bulk actions */}
          <BulkActionsBar selectedIds={selectedIds} onClearSelection={() => setSelectedIds([])} />

          {/* Table — mobile uses accumulated infinite-scroll list */}
          <LeadsTable
            contacts={mobileContacts} isLoading={isLoading} isFetching={isFetching} totalCount={totalCount}
            selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={handlePageSizeChange}
            sortKey={sortKey} sortDir={sortDir} onSort={handleSort} visibleColumns={visibleColumns}
            hidePagination={isMobile}
          />

          {/* Mobile infinite-scroll loader */}
          {isMobile && hasMoreMobile && (
            <div className="flex items-center justify-center py-4 text-[12px] text-muted-foreground">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-primary/40 border-t-primary animate-spin mr-2" />
              Loading more…
            </div>
          )}
          {isMobile && !hasMoreMobile && accumulated.length > 0 && accumulated.length >= totalCount && (
            <div className="text-center py-4 text-[11px] text-muted-foreground/60">
              {totalCount.toLocaleString()} {totalCount === 1 ? 'lead' : 'leads'} total
            </div>
          )}
        </div>

        {/* Right-side Filter Panel — inline on desktop, bottom sheet on mobile to avoid layout shift */}
        {(() => {
          const panel = (
            <FilterPanel
              open={isMobile ? true : filtersExpanded}
              onClose={() => setFiltersExpanded(false)}
              filterContactType={filterContactType}
              setFilterContactType={v => {
                setFilterContactType(v);
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
              filterExcludeTags={filterExcludeTags}
              setFilterExcludeTags={v => { setFilterExcludeTags(v); setPage(1); }}
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
              dynamicLeadTypes={dynamicOpts.leadTypes}
              tagCounts={dynamicOpts.tagCounts}
              projectCounts={dynamicOpts.projectCounts}
              leadTypeCounts={dynamicOpts.leadTypeCounts}
              onClearAll={clearAllFilters}
              activeFilterCount={activeFilterCount}
            />
          );

          if (isMobile) {
            return (
              <Sheet open={filtersExpanded} onOpenChange={setFiltersExpanded}>
                <SheetContent
                  side="bottom"
                  className="h-[88dvh] p-0 rounded-t-2xl border-t border-border [&>button]:hidden"
                >
                  {/* Override panel chrome so it fills the sheet (no left margin / fixed width) */}
                  <div className="h-full [&>div]:!w-full [&>div]:!ml-0 [&>div]:!rounded-none [&>div]:!border-l-0 [&>div]:!h-full">
                    {panel}
                  </div>
                </SheetContent>
              </Sheet>
            );
          }

          return panel;
        })()}
      </div>

      {/* Mobile floating Add Lead button — sits above BottomNav with safe-area inset */}
      {isMobile && (
        <button
          onClick={() => setShowAdd(true)}
          aria-label="Add lead"
          className="lg:hidden fixed right-4 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl active:scale-95 transition-all flex items-center justify-center"
          style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
        >
          <Plus className="w-6 h-6" strokeWidth={2.2} />
        </button>
      )}

      <AddLeadDialog open={showAdd} onOpenChange={setShowAdd} />
      <ManagePipelinesDialog
        open={managePipelinesOpen}
        onClose={() => setManagePipelinesOpen(false)}
        segmentCounts={segmentCounts}
      />

      {/* Mobile sort sheet — descriptive labels instead of an opaque icon */}
      {isMobile && (
        <Sheet open={sortSheetOpen} onOpenChange={setSortSheetOpen}>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl border-t border-border [&>button]:hidden p-0"
          >
            <div className="px-4 pt-3 pb-2">
              <div className="mx-auto h-1 w-10 rounded-full bg-border mb-3" />
              <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Sort leads by</h3>
            </div>
            <div className="px-2 pb-4">
              {SORT_OPTIONS.map(opt => {
                const isActive = sortKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      if (sortKey === opt.key) {
                        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                      } else {
                        setSortKey(opt.key);
                        setSortDir(opt.defaultDir);
                      }
                      setPage(1);
                      setSortSheetOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-3 rounded-lg text-[14px] transition-colors ${
                      isActive ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="flex items-center gap-2 text-muted-foreground text-[12px]">
                      {isActive && (
                        <>
                          <span className="uppercase tracking-wider font-semibold text-primary">
                            {sortDir === 'asc' ? 'Asc' : 'Desc'}
                          </span>
                          <Check className="w-4 h-4 text-primary" />
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

/* ── Mobile editorial filter chip ── */
function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 h-8 px-3 text-[13px] font-medium whitespace-nowrap tracking-tight transition-colors ${
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      <span className={`text-[9px] ${active ? 'text-primary/80' : 'text-muted-foreground/50'}`}>▼</span>
      {active && <span className="ml-0.5 w-1 h-1 rounded-full bg-primary" />}
    </button>
  );
}
