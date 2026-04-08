import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Filter, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { useDynamicFilterOptions, LEAD_STATUSES, LEAD_SOURCES, AGENTS, LEAD_TYPES, useCrmContacts } from '@/hooks/useCrmContacts';
import { usePaginatedCrmContacts } from '@/hooks/usePaginatedCrmContacts';
import type { SortKey, SortDir } from '@/hooks/usePaginatedCrmContacts';
import { LeadsTable } from '@/components/crm/leads/LeadsTable';
import { AddLeadDialog } from '@/components/crm/leads/AddLeadDialog';
import { BulkActionsBar } from '@/components/crm/leads/BulkActionsBar';
import { MultiSelectFilter, ActiveFilterPills } from '@/components/crm/leads/MultiSelectFilter';
import { ContactTypeFilter } from '@/components/crm/leads/ContactTypeFilter';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

type ViewMode = 'all' | 'active' | 'directory';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const ALL_COLUMN_KEYS = [
  { key: 'name', label: 'Name', locked: true },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'project', label: 'Projects' },
  { key: 'source', label: 'Source' },
  { key: 'status', label: 'Status' },
  { key: 'tags', label: 'Tags' },
  { key: 'assigned_to', label: 'Assigned To' },
  { key: 'last_touch_at', label: 'Last Touch' },
  { key: 'created_at', label: 'Added' },
] as const;

const DEFAULT_VISIBLE = new Set(['name', 'phone', 'email', 'source', 'status', 'last_touch_at']);

export default function CrmLeadsPage() {
  const { data: allContacts = [] } = useCrmContacts();
  const dynamicOpts = useDynamicFilterOptions(allContacts);
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchTimeout, setSearchTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('all');
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
    sortKey: viewMode === 'directory' && sortKey === 'created_at' ? 'name' : sortKey,
    sortDir: viewMode === 'directory' && sortKey === 'created_at' ? 'asc' : sortDir,
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
      pipelineView: viewMode,
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
  ].reduce((a, b) => a + b, 0);

  const clearAllFilters = () => {
    setFilterContactType('');
    setFilterStatus([]);
    setFilterSource([]);
    setFilterAgent([]);
    setFilterProject([]);
    setFilterLeadType([]);
    setFilterLanguage([]);
    setFilterTags([]);
    setLetterFilter('');
    setPage(1);
  };

  const clearFilter = (key: string) => {
    const map: Record<string, () => void> = {
      contactType: () => setFilterContactType(''),
      status: () => setFilterStatus([]),
      source: () => setFilterSource([]),
      agent: () => setFilterAgent([]),
      project: () => setFilterProject([]),
      leadType: () => setFilterLeadType([]),
      language: () => setFilterLanguage([]),
      tags: () => setFilterTags([]),
    };
    map[key]?.();
    setPage(1);
  };

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }, [sortKey]);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    setPage(1);
    if (mode === 'directory') {
      // Default to alphabetical
      setSortKey('name');
      setSortDir('asc');
    }
    if (mode !== 'directory') {
      setLetterFilter('');
    }
  };

  const handleLetterClick = (letter: string) => {
    setLetterFilter(prev => prev === letter ? '' : letter);
    setPage(1);
  };

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
  ];

  const filterSection = (
    <>
      <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-4'}`}>
        <ContactTypeFilter value={filterContactType} onChange={v => { setFilterContactType(v); setPage(1); }} />
        <MultiSelectFilter label="Status" options={[...LEAD_STATUSES]} selected={filterStatus} onChange={v => { setFilterStatus(v); setPage(1); }} />
        <MultiSelectFilter label="Source" options={[...LEAD_SOURCES]} selected={filterSource} onChange={v => { setFilterSource(v); setPage(1); }} />
        <MultiSelectFilter label="Assigned To" options={[...AGENTS]} selected={filterAgent} onChange={v => { setFilterAgent(v); setPage(1); }} />
      </div>
      <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-4'}`}>
        <MultiSelectFilter label="Project" options={dynamicOpts.projects} selected={filterProject} onChange={v => { setFilterProject(v); setPage(1); }} />
        <MultiSelectFilter label="Lead Type" options={[...LEAD_TYPES]} selected={filterLeadType} onChange={v => { setFilterLeadType(v); setPage(1); }} />
        <MultiSelectFilter label="Language" options={dynamicOpts.languages} selected={filterLanguage} onChange={v => { setFilterLanguage(v); setPage(1); }} />
        <MultiSelectFilter label="Tags" options={dynamicOpts.tags} selected={filterTags} onChange={v => { setFilterTags(v); setPage(1); }} />
      </div>
    </>
  );

  return (
    <>
      <div className="space-y-3 sm:space-y-4">
        {/* Header */}
        <div className="space-y-2 sm:space-y-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h1 className="text-lg sm:text-xl font-bold text-foreground">Leads & Contacts</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Manage your leads, contacts, and pipeline from one place</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Column toggle */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 hidden sm:flex">
                    <Settings2 className="w-3.5 h-3.5" /> Columns
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-48 p-2">
                  <p className="text-xs font-semibold text-muted-foreground px-2 pb-1.5">Toggle columns</p>
                  {ALL_COLUMN_KEYS.map(col => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                    >
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

          {/* View toggle tabs */}
          <div className="flex items-center gap-1 bg-muted/45 rounded-lg p-[3px] border border-border/40 w-fit">
            {([
              { key: 'all' as ViewMode, label: 'All Leads' },
              { key: 'active' as ViewMode, label: 'Active Pipeline' },
              { key: 'directory' as ViewMode, label: 'Directory' },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => handleViewChange(tab.key)}
                className={`px-3 py-1.5 rounded-md text-[12.5px] font-semibold transition-all duration-200 select-none ${
                  viewMode === tab.key
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground/65 hover:text-muted-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <Badge variant="outline" className="text-[10px] font-medium ml-1">{totalCount.toLocaleString()}</Badge>
          </div>

          {/* A-Z letter filter (always visible in directory mode, optional in others) */}
          {(viewMode === 'directory' || letterFilter) && (
            <div className="flex items-center gap-0.5 flex-wrap">
              <button
                onClick={() => { setLetterFilter(''); setPage(1); }}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                  !letterFilter ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                All
              </button>
              {ALPHABET.map(letter => (
                <button
                  key={letter}
                  onClick={() => handleLetterClick(letter)}
                  className={`w-7 h-7 rounded text-[11px] font-semibold transition-colors ${
                    letterFilter === letter
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by name, email, or phone..."
              className="pl-8 h-10 sm:h-9 w-full text-sm"
            />
          </div>

          {/* Filters */}
          {isMobile ? (
            <div className="space-y-2">
              <button
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                className="flex items-center gap-2 text-sm font-medium text-foreground w-full justify-between py-2"
              >
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{activeFilterCount} active</Badge>
                  )}
                </div>
                {filtersExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {filtersExpanded && <div className="space-y-2">{filterSection}</div>}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Filters</span>
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{activeFilterCount} active</Badge>
                )}
              </div>
              {filterSection}
            </div>
          )}

          {/* Mobile: Add Lead */}
          <Button onClick={() => setShowAdd(true)} size="sm" className="h-11 w-full bg-primary text-primary-foreground gap-1.5 sm:hidden min-h-[44px]">
            <Plus className="w-4 h-4" /> Add Lead
          </Button>
        </div>

        {/* Filter pills */}
        <ActiveFilterPills filters={filterPills} onClear={clearFilter} onClearAll={clearAllFilters} />

        {/* Bulk actions */}
        <BulkActionsBar selectedIds={selectedIds} onClearSelection={() => setSelectedIds([])} />

        {/* Table */}
        <LeadsTable
          contacts={contacts}
          isLoading={isLoading}
          isFetching={isFetching}
          totalCount={totalCount}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          visibleColumns={visibleColumns}
        />
      </div>

      <AddLeadDialog open={showAdd} onOpenChange={setShowAdd} />
    </>
  );
}
