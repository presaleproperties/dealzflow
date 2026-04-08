import { useState, useMemo } from 'react';
import { X, Eraser, ChevronDown, ChevronRight, Search, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { LEAD_STATUSES, LEAD_SOURCES, AGENTS, LEAD_TYPES, LEAD_TYPE_LABELS } from '@/hooks/useCrmContacts';
import { ContactTypeFilter } from './ContactTypeFilter';

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  filterContactType: string;
  setFilterContactType: (v: string) => void;
  filterStatus: string[];
  setFilterStatus: (v: string[]) => void;
  filterSource: string[];
  setFilterSource: (v: string[]) => void;
  filterAgent: string[];
  setFilterAgent: (v: string[]) => void;
  filterProject: string[];
  setFilterProject: (v: string[]) => void;
  filterLeadType: string[];
  setFilterLeadType: (v: string[]) => void;
  filterLanguage: string[];
  setFilterLanguage: (v: string[]) => void;
  filterTags: string[];
  setFilterTags: (v: string[]) => void;
  dynamicProjects: string[];
  dynamicLanguages: string[];
  dynamicTags: string[];
  onClearAll: () => void;
  activeFilterCount: number;
}

function FilterAccordion({
  label,
  options,
  selected,
  onChange,
  optionLabels,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  optionLabels?: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const showSearch = options.length >= 5;

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  return (
    <div className="border-b border-border/30">
      <button
        onClick={() => { setExpanded(!expanded); if (expanded) setSearch(''); }}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {selected.length}
            </Badge>
          )}
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="px-2 pb-2">
          {showSearch && (
            <div className="relative mb-1.5 px-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="h-8 pl-8 text-xs bg-muted/30 border-border/40"
              />
            </div>
          )}
          <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
            {filtered.map(opt => (
              <button
                key={opt}
                onClick={() => toggle(opt)}
                className="flex items-center gap-2.5 w-full px-2 py-1.5 text-[13px] text-foreground hover:bg-muted/40 rounded-md transition-colors"
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                    selected.includes(opt) ? 'bg-primary border-primary' : 'border-border/60'
                  )}
                >
                  {selected.includes(opt) && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <span className="truncate">{optionLabels?.[opt] ?? opt}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                {search ? 'No matches' : 'No options'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterPanel({
  open,
  onClose,
  filterContactType,
  setFilterContactType,
  filterStatus,
  setFilterStatus,
  filterSource,
  setFilterSource,
  filterAgent,
  setFilterAgent,
  filterProject,
  setFilterProject,
  filterLeadType,
  setFilterLeadType,
  filterLanguage,
  setFilterLanguage,
  filterTags,
  setFilterTags,
  dynamicProjects,
  dynamicLanguages,
  dynamicTags,
  onClearAll,
  activeFilterCount,
}: FilterPanelProps) {
  if (!open) return null;

  return (
    <div className="w-[280px] shrink-0 border-l border-border/40 bg-card/80 backdrop-blur-sm flex flex-col h-full ml-3 rounded-l-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">All Filters</h3>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {activeFilterCount} active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClearAll} title="Clear filters">
              <Eraser className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Contact Type */}
      <div className="px-4 py-3 border-b border-border/30">
        <p className="text-xs font-medium text-muted-foreground mb-2">Contact Type</p>
        <ContactTypeFilter value={filterContactType} onChange={setFilterContactType} />
      </div>

      {/* Scrollable filter list */}
      <ScrollArea className="flex-1 min-h-0">
        <div>
          <FilterAccordion label="Status" options={[...LEAD_STATUSES]} selected={filterStatus} onChange={setFilterStatus} />
          <FilterAccordion label="Source" options={[...LEAD_SOURCES]} selected={filterSource} onChange={setFilterSource} />
          <FilterAccordion label="Agent" options={[...AGENTS]} selected={filterAgent} onChange={setFilterAgent} />
          <FilterAccordion label="Project" options={dynamicProjects} selected={filterProject} onChange={setFilterProject} />
          <FilterAccordion label="Lead Type" options={[...LEAD_TYPES]} selected={filterLeadType} onChange={setFilterLeadType} optionLabels={LEAD_TYPE_LABELS} />
          <FilterAccordion label="Language" options={dynamicLanguages} selected={filterLanguage} onChange={setFilterLanguage} />
          <FilterAccordion label="Tags" options={dynamicTags} selected={filterTags} onChange={setFilterTags} />
        </div>
      </ScrollArea>
    </div>
  );
}
