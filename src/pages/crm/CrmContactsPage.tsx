import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrmContacts, useDynamicFilterOptions, LEAD_STATUSES, LEAD_SOURCES, AGENTS, LEAD_TYPES } from '@/hooks/useCrmContacts';
import { LeadStatusBadge } from '@/components/crm/leads/LeadStatusBadge';
import { MultiSelectFilter, ActiveFilterPills } from '@/components/crm/leads/MultiSelectFilter';
import { ContactTypeFilter } from '@/components/crm/leads/ContactTypeFilter';
import { useIsMobile } from '@/hooks/use-mobile';
import { getMissingFields, formatFieldName, isProfileComplete } from '@/lib/dataCompleteness';
import { formatContactName, getContactInitials } from '@/lib/format';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function getInitials(first: string, last: string) {
  return getContactInitials(first, last);
}
}

const CONTACT_TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  lead: { bg: 'hsl(210 62% 46% / 0.12)', color: 'hsl(210 62% 46%)', label: 'Lead' },
  realtor: { bg: 'hsl(270 60% 55% / 0.12)', color: 'hsl(270 60% 55%)', label: 'Realtor' },
  past_client: { bg: 'hsl(142 71% 40% / 0.12)', color: 'hsl(142 71% 40%)', label: 'Client' },
};

export default function CrmContactsPage() {
  const { data: contacts = [], isLoading } = useCrmContacts();
  const dynamicOpts = useDynamicFilterOptions(contacts);
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [filterContactType, setFilterContactType] = useState('');
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterSource, setFilterSource] = useState<string[]>([]);
  const [filterAgent, setFilterAgent] = useState<string[]>([]);
  const [filterProject, setFilterProject] = useState<string[]>([]);
  const [filterLeadType, setFilterLeadType] = useState<string[]>([]);
  const [filterLanguage, setFilterLanguage] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterDataStatus, setFilterDataStatus] = useState('all');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Apply URL params on mount
  useEffect(() => {
    const type = searchParams.get('type');
    const dataStatus = searchParams.get('data_status');
    if (type) setFilterContactType(type);
    if (dataStatus) setFilterDataStatus(dataStatus);
  }, [searchParams]);

  const activeFilterCount = [
    filterContactType ? 1 : 0,
    filterStatus.length > 0 ? 1 : 0,
    filterSource.length > 0 ? 1 : 0,
    filterAgent.length > 0 ? 1 : 0,
    filterProject.length > 0 ? 1 : 0,
    filterLeadType.length > 0 ? 1 : 0,
    filterLanguage.length > 0 ? 1 : 0,
    filterTags.length > 0 ? 1 : 0,
    filterDataStatus !== 'all' ? 1 : 0,
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
    setFilterDataStatus('all');
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
      dataStatus: () => setFilterDataStatus('all'),
    };
    map[key]?.();
  };

  const sorted = useMemo(() => {
    let list = [...contacts].sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? ''));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        formatContactName(c.first_name, c.last_name).toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
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
    if (filterDataStatus === 'complete') {
      list = list.filter(c => c.contact_type === 'past_client' && isProfileComplete(c));
    } else if (filterDataStatus === 'incomplete') {
      list = list.filter(c => c.contact_type === 'past_client' && !isProfileComplete(c));
    }
    return list;
  }, [contacts, search, filterContactType, filterStatus, filterSource, filterAgent, filterProject, filterLeadType, filterLanguage, filterTags, filterDataStatus]);

  const jumpTo = (letter: string) => {
    const el = listRef.current?.querySelector(`[data-letter="${letter}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const letterSet = useMemo(() => new Set(sorted.map(c => (c.last_name?.[0] ?? '').toUpperCase())), [sorted]);

  const filterPills = [
    { key: 'contactType', label: 'Type', values: filterContactType ? [filterContactType] : [] },
    { key: 'status', label: 'Status', values: filterStatus },
    { key: 'source', label: 'Source', values: filterSource },
    { key: 'agent', label: 'Agent', values: filterAgent },
    { key: 'project', label: 'Project', values: filterProject },
    { key: 'leadType', label: 'Lead Type', values: filterLeadType },
    { key: 'language', label: 'Language', values: filterLanguage },
    { key: 'tags', label: 'Tags', values: filterTags },
    { key: 'dataStatus', label: 'Data Status', values: filterDataStatus !== 'all' ? [filterDataStatus] : [] },
  ];

  const filterSection = (
    <>
      <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-4'}`}>
        <ContactTypeFilter value={filterContactType} onChange={setFilterContactType} />
        <MultiSelectFilter label="Status" options={[...LEAD_STATUSES]} selected={filterStatus} onChange={setFilterStatus} />
        <MultiSelectFilter label="Source" options={[...LEAD_SOURCES]} selected={filterSource} onChange={setFilterSource} />
        <MultiSelectFilter label="Assigned To" options={[...AGENTS]} selected={filterAgent} onChange={setFilterAgent} />
      </div>
      <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-4'}`}>
        <MultiSelectFilter label="Project" options={dynamicOpts.projects} selected={filterProject} onChange={setFilterProject} />
        <MultiSelectFilter label="Lead Type" options={[...LEAD_TYPES]} selected={filterLeadType} onChange={setFilterLeadType} />
        <MultiSelectFilter label="Language" options={dynamicOpts.languages} selected={filterLanguage} onChange={setFilterLanguage} />
        <MultiSelectFilter label="Tags" options={dynamicOpts.tags} selected={filterTags} onChange={setFilterTags} />
      </div>
      <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-4'}`}>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Data Status</label>
          <Select value={filterDataStatus} onValueChange={setFilterDataStatus}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="incomplete">Incomplete</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 sm:mb-4 gap-2 sm:gap-3">
        <h1 className="text-lg font-bold text-foreground">Contacts</h1>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, email..."
            className="pl-9 h-10 sm:h-9 text-sm min-h-[44px] sm:min-h-0"
          />
        </div>
      </div>

      {/* Filters */}
      {isMobile ? (
        <div className="space-y-2 mb-3">
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
        <div className="space-y-2 mb-3">
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

      <ActiveFilterPills filters={filterPills} onClear={clearFilter} onClearAll={clearAllFilters} />

      {/* Alphabet bar */}
      <div className="flex flex-wrap gap-0.5 mb-3 sm:mb-4 mt-2">
        {ALPHA.map(l => (
          <button
            key={l}
            onClick={() => jumpTo(l)}
            className={`w-6 h-6 sm:w-7 sm:h-7 rounded text-[10px] sm:text-xs font-semibold transition-colors ${letterSet.has(l) ? 'text-foreground hover:bg-primary/10' : 'text-muted-foreground/40 cursor-default'}`}
            disabled={!letterSet.has(l)}
          >
            {l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">No contacts found.</p>
      ) : isMobile ? (
        <div ref={listRef} className="space-y-2">
          {(() => {
            let lastLetter = '';
            return sorted.map(c => {
              const letter = (c.last_name?.[0] ?? '').toUpperCase();
              const showAnchor = letter !== lastLetter;
              lastLetter = letter;
              const typeStyle = CONTACT_TYPE_STYLES[c.contact_type] ?? CONTACT_TYPE_STYLES.lead;
              const missing = c.contact_type === 'past_client' ? getMissingFields(c) : [];
              return (
                <div key={c.id} {...(showAnchor ? { 'data-letter': letter } : {})}>
                  {showAnchor && (
                    <p className="text-[11px] font-bold text-muted-foreground px-1 pt-2 pb-1">{letter}</p>
                  )}
                  <Link
                    to={`/crm/leads/${c.id}`}
                    className="block bg-card rounded-[10px] border border-border p-3 shadow-sm active:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex items-center justify-center w-9 h-9 rounded-full text-[11px] font-bold flex-shrink-0"
                        style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}
                      >
                        {getInitials(c.first_name, c.last_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="border-0 text-[9px] font-semibold px-1 py-0" style={{ background: typeStyle.bg, color: typeStyle.color }}>
                            {typeStyle.label}
                          </Badge>
                          <p className="text-sm font-semibold text-foreground truncate inline-flex items-center gap-1">
                            {formatContactName(c.first_name, c.last_name)}
                            {missing.length > 0 && (
                              <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#F59E0B' }} />
                            )}
                          </p>
                        </div>
                        {c.phone && <p className="text-[13px] text-muted-foreground truncate">{c.phone}</p>}
                      </div>
                      <LeadStatusBadge status={c.status} />
                    </div>
                  </Link>
                </div>
              );
            });
          })()}
        </div>
      ) : (
        <div ref={listRef} className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-12" />
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Phone</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Projects</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Tags</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let lastLetter = '';
                return sorted.map(c => {
                  const letter = (c.last_name?.[0] ?? '').toUpperCase();
                  const showAnchor = letter !== lastLetter;
                  lastLetter = letter;
                  const tags = (c.tags ?? []) as string[];
                  const typeStyle = CONTACT_TYPE_STYLES[c.contact_type] ?? CONTACT_TYPE_STYLES.lead;
                  const missing = c.contact_type === 'past_client' ? getMissingFields(c) : [];
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border/40 hover:bg-muted/20 transition-colors"
                      {...(showAnchor ? { 'data-letter': letter } : {})}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-bold flex-shrink-0" style={{ background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))' }}>
                          {getInitials(c.first_name, c.last_name)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <Badge variant="outline" className="border-0 text-[10px] font-semibold" style={{ background: typeStyle.bg, color: typeStyle.color }}>
                          {typeStyle.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link to={`/crm/leads/${c.id}`} className="text-sm font-medium text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5">
                          {formatContactName(c.first_name, c.last_name)}
                          {missing.length > 0 && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#F59E0B' }} />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Missing: {missing.map(formatFieldName).join(', ')}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        {c.phone ? <a href={`tel:${c.phone}`} className="text-sm text-primary hover:underline">{c.phone}</a> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        {c.email ? <a href={`mailto:${c.email}`} className="text-sm text-primary hover:underline truncate block max-w-[180px]">{c.email}</a> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        {(c.projects ?? []).length > 0 || c.project ? (
                          <div className="flex flex-wrap gap-1">
                            {((c.projects ?? []).length > 0 ? c.projects! : [c.project!]).slice(0, 2).map(p => (
                              <Badge key={p} variant="outline" className="border-0 text-[10px] font-semibold" style={{ background: 'hsl(39 67% 55% / 0.15)', color: 'hsl(39 67% 55%)' }}>
                                {p}
                              </Badge>
                            ))}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <LeadStatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                          ))}
                          {tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>}
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
