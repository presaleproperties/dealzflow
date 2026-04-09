import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Filter, ChevronDown, ChevronUp, Settings2, MoreHorizontal, Trash2, X } from 'lucide-react';
import { useDynamicFilterOptions, LEAD_STATUSES, LEAD_SOURCES, AGENTS, LEAD_TYPES, useCrmContacts } from '@/hooks/useCrmContacts';
import { usePaginatedCrmContacts } from '@/hooks/usePaginatedCrmContacts';
import type { SortKey, SortDir } from '@/hooks/usePaginatedCrmContacts';
import { useCrmSavedViews, useCreateSavedView, useDeleteSavedView } from '@/hooks/useCrmSavedViews';
import { useCrmLeadSegments, useSegmentCounts } from '@/hooks/useCrmLeadSegments';
import type { LeadSegment } from '@/hooks/useCrmLeadSegments';
import { LeadsTable } from '@/components/crm/leads/LeadsTable';
import { AddLeadDialog } from '@/components/crm/leads/AddLeadDialog';
import { BulkActionsBar } from '@/components/crm/leads/BulkActionsBar';
import { ActiveFilterPills } from '@/components/crm/leads/MultiSelectFilter';
import { FilterPanel } from '@/components/crm/leads/FilterPanel';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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

// Built-in view tabs
const BUILT_IN_VIEWS = [
  { id: '__all', name: 'All Leads', filters: {} },
  { id: '__new', name: 'New', filters: { status: ['New Lead'] } },
  { id: '__hot', name: 'Hot Leads', filters: { status: ['Hot / Engaged'] } },
  { id: '__nurturing', name: 'Nurturing', filters: { status: ['Nurturing'] } },
  { id: '__my', name: 'My Leads', filters: { assigned_to: '__current_user__' } },
  { id: '__uncontacted', name: 'Uncontacted 7+', filters: { _uncontacted_7: true } },
  { id: '__active', name: 'Active Pipeline', filters: { _pipeline: 'active' } },
  { id: '__directory', name: 'Directory', filters: { _pipeline: 'directory' } },
] as const;

export default function CrmLeadsPage() {
  const { data: allContacts = [] } = useCrmContacts();
  const dynamicOpts = useDynamicFilterOptions(allContacts);
  const isMobile = useIsMobile();

  // Saved views
  const { data: savedViews = [] } = useCrmSavedViews();
  const createView = useCreateSavedView();
  const deleteView = useDeleteSavedView();
  const [activeViewId, setActiveViewId] = useState('__all');
  const [showCreateView, setShowCreateView] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  // Segments
  const { data: segments = [] } = useCrmLeadSegments();
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  // Determine active view filters
  const activeView = useMemo(() => {
    const builtIn = BUILT_IN_VIEWS.find(v => v.id === activeViewId);
    if (builtIn) return builtIn;
    const custom = savedViews.find(v => v.id === activeViewId);
    if (custom) return custom;
    return BUILT_IN_VIEWS[0];
  }, [activeViewId, savedViews]);

  // Determine pipeline view mode from active view
  const pipelineView = useMemo(() => {
    const f = activeView.filters as Record<string, unknown>;
    if (f._pipeline === 'active') return 'active' as const;
    if (f._pipeline === 'directory') return 'directory' as const;
    return 'all' as const;
  }, [activeView]);

  // Active segment
  const activeSegment = useMemo(() => segments.find(s => s.id === activeSegmentId), [segments, activeSegmentId]);

  // Build saved view base filters (excluding _pipeline which is handled separately)
  const savedViewFilters = useMemo(() => {
    const f = { ...(activeView.filters as Record<string, unknown>) };
    delete f._pipeline;
    return Object.keys(f).length > 0 ? f : undefined;
  }, [activeView]);

  // Segment counts (scoped to saved view)
  const { data: segmentCounts = {} } = useSegmentCounts(segments, savedViewFilters ?? {});

  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('search') ?? '');
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showAdd, setShowAdd] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

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
      letterFilter,
      pipelineView,
      savedViewFilters: savedViewFilters,
      segmentFilters: activeSegment?.filter_config as Record<string, unknown> | undefined,
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

  const handleViewChange = (viewId: string) => {
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

  const handleCreateView = () => {
    if (!newViewName.trim()) return;
    const filters: Record<string, unknown> = {};
    if (filterStatus.length > 0) filters.status = filterStatus;
    if (filterSource.length > 0) filters.source = filterSource;
    if (filterAgent.length > 0) filters.assigned_to = filterAgent[0];
    if (filterLeadType.length > 0) filters.lead_type = filterLeadType;
    if (filterTags.length > 0) filters.tags = filterTags;
    createView.mutate({ name: newViewName.trim(), filters }, {
      onSuccess: () => { setShowCreateView(false); setNewViewName(''); },
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

  // Filter section removed — now using FilterPanel sidebar

  // Check if "All Leads" segment or no segment is active (i.e. first segment with empty filter)
  const isAllSegment = !activeSegmentId || (activeSegment && Object.keys(activeSegment.filter_config).length === 0);

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

          {/* ROW 1: Saved Views Tabs */}
          <div className="overflow-x-auto">
            <div className="flex items-center gap-0.5 min-w-max border-b border-border/40 pb-0">
              {BUILT_IN_VIEWS.map(view => (
                <button
                  key={view.id}
                  onClick={() => handleViewChange(view.id)}
                  className={`px-3 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    activeViewId === view.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                  }`}
                >
                  {view.name}
                </button>
              ))}
              {savedViews.map(view => (
                <div key={view.id} className="relative group flex items-center">
                  <button
                    onClick={() => handleViewChange(view.id)}
                    className={`px-3 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                      activeViewId === view.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                    }`}
                  >
                    {view.name}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 -ml-1">
                        <MoreHorizontal className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem className="text-destructive" onClick={() => deleteView.mutate(view.id)}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
              <button
                onClick={() => setShowCreateView(true)}
                className="px-3 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground whitespace-nowrap border-b-2 border-transparent transition-colors"
              >
                + View
              </button>
              <div className="flex-1" />
              <Badge variant="outline" className="text-[10px] font-medium mb-1">{totalCount.toLocaleString()} total</Badge>
            </div>
          </div>

          {/* ROW 2: Pipeline Segment Pills */}
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

          {/* Search + Filter toggle */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search by name, email, or phone..." className="pl-8 h-10 sm:h-9 w-full text-sm" />
            </div>
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

          {/* Mobile: Add Lead */}
          <Button onClick={() => setShowAdd(true)} size="sm" className="h-11 w-full bg-primary text-primary-foreground gap-1.5 sm:hidden min-h-[44px]">
            <Plus className="w-4 h-4" /> Add Lead
          </Button>

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
          setFilterContactType={v => { setFilterContactType(v); setPage(1); }}
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

      {/* Create View Dialog */}
      <Dialog open={showCreateView} onOpenChange={setShowCreateView}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Current View</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">View Name</Label>
              <Input value={newViewName} onChange={e => setNewViewName(e.target.value)}
                placeholder="e.g. Hot Facebook Leads" autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreateView()} />
            </div>
            <p className="text-xs text-muted-foreground">
              Current active filters will be saved with this view.
              {activeFilterCount === 0 && ' (No filters active — this will show all leads)'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreateView(false)}>Cancel</Button>
              <Button onClick={handleCreateView} disabled={!newViewName.trim() || createView.isPending}>
                {createView.isPending ? 'Saving…' : 'Save View'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
