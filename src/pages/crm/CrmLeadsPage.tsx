import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { useCrmContacts, useDynamicFilterOptions, LEAD_STATUSES, LEAD_SOURCES, AGENTS, LEAD_TYPES } from '@/hooks/useCrmContacts';
import { LeadsTable } from '@/components/crm/leads/LeadsTable';
import { AddLeadDialog } from '@/components/crm/leads/AddLeadDialog';
import { BulkActionsBar } from '@/components/crm/leads/BulkActionsBar';
import { MultiSelectFilter, ActiveFilterPills } from '@/components/crm/leads/MultiSelectFilter';
import { ContactTypeFilter } from '@/components/crm/leads/ContactTypeFilter';
import { useIsMobile } from '@/hooks/use-mobile';

export default function CrmLeadsPage() {
  const { data: contacts = [], isLoading } = useCrmContacts();
  const dynamicOpts = useDynamicFilterOptions(contacts);
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
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
  const [showAdd, setShowAdd] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

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

  const filtered = useMemo(() => {
    let list = contacts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.project?.toLowerCase().includes(q)
      );
    }
    if (filterContactType) list = list.filter(c => c.contact_type === filterContactType);
    if (filterStatus.length > 0) list = list.filter(c => c.status && filterStatus.includes(c.status));
    if (filterSource.length > 0) list = list.filter(c => c.source && filterSource.includes(c.source));
    if (filterAgent.length > 0) list = list.filter(c => c.assigned_to && filterAgent.includes(c.assigned_to));
    if (filterProject.length > 0) list = list.filter(c =>
      filterProject.some(fp => (c.projects ?? []).includes(fp) || c.project === fp)
    );
    if (filterLeadType.length > 0) list = list.filter(c => c.lead_type && filterLeadType.includes(c.lead_type));
    if (filterLanguage.length > 0) list = list.filter(c => c.language && filterLanguage.includes(c.language));
    if (filterTags.length > 0) list = list.filter(c =>
      filterTags.some(ft => (c.tags ?? []).includes(ft))
    );
    return list;
  }, [contacts, search, filterContactType, filterStatus, filterSource, filterAgent, filterProject, filterLeadType, filterLanguage, filterTags]);

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
      {/* Row 1: Contact Type, Status, Source, Assigned To */}
      <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-4'}`}>
        <ContactTypeFilter value={filterContactType} onChange={v => { setFilterContactType(v); setPage(1); }} />
        <MultiSelectFilter label="Status" options={[...LEAD_STATUSES]} selected={filterStatus} onChange={v => { setFilterStatus(v); setPage(1); }} />
        <MultiSelectFilter label="Source" options={[...LEAD_SOURCES]} selected={filterSource} onChange={v => { setFilterSource(v); setPage(1); }} />
        <MultiSelectFilter label="Assigned To" options={[...AGENTS]} selected={filterAgent} onChange={v => { setFilterAgent(v); setPage(1); }} />
      </div>
      {/* Row 2: Project, Lead Type, Language, Tags */}
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
            <h1 className="text-lg sm:text-xl font-bold text-foreground">Leads</h1>
            <Button onClick={() => setShowAdd(true)} size="sm" className="h-9 bg-primary text-primary-foreground gap-1.5 hidden sm:flex">
              <Plus className="w-4 h-4" /> Add Lead
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
          contacts={filtered}
          isLoading={isLoading}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          page={page}
          onPageChange={setPage}
        />
      </div>

      <AddLeadDialog open={showAdd} onOpenChange={setShowAdd} />
    </>
  );
}
