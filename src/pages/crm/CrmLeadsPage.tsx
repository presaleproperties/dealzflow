import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { useDynamicFilterOptions, LEAD_STATUSES, LEAD_SOURCES, AGENTS, LEAD_TYPES, useCrmContacts } from '@/hooks/useCrmContacts';
import { usePaginatedCrmContacts } from '@/hooks/usePaginatedCrmContacts';
import type { SortKey, SortDir } from '@/hooks/usePaginatedCrmContacts';
import { LeadsTable } from '@/components/crm/leads/LeadsTable';
import { AddLeadDialog } from '@/components/crm/leads/AddLeadDialog';
import { BulkActionsBar } from '@/components/crm/leads/BulkActionsBar';
import { MultiSelectFilter, ActiveFilterPills } from '@/components/crm/leads/MultiSelectFilter';
import { ContactTypeFilter } from '@/components/crm/leads/ContactTypeFilter';
import { useIsMobile } from '@/hooks/use-mobile';

export default function CrmLeadsPage() {
  // We still use the full dataset hook just for dynamic filter options (projects, languages, tags)
  const { data: allContacts = [] } = useCrmContacts();
  const dynamicOpts = useDynamicFilterOptions(allContacts);
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchTimeout, setSearchTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

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
    sortKey,
    sortDir,
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
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-foreground">Leads</h1>
              <Badge variant="outline" className="text-xs font-medium">{totalCount.toLocaleString()} total</Badge>
            </div>
            <Button onClick={() => setShowAdd(true)} size="sm" className="h-9 bg-primary text-primary-foreground gap-1.5 hidden sm:flex">
              <Plus className="w-4 h-4" /> Add Lead
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search leads..."
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
        />
      </div>

      <AddLeadDialog open={showAdd} onOpenChange={setShowAdd} />
    </>
  );
}
