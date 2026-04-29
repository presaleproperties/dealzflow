import { useState, useMemo, useEffect } from 'react';
import { X, Eraser, ChevronDown, ChevronRight, Search, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { LEAD_STATUSES, LEAD_SOURCES, LEAD_TYPES, LEAD_TYPE_LABELS } from '@/hooks/useCrmContacts';
import { useAgentNames } from '@/hooks/useTeamAgents';
import { FRASER_VALLEY_CITIES, CRM_LANGUAGES } from '@/lib/crmConstants';
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
  filterExcludeTags: string[];
  setFilterExcludeTags: (v: string[]) => void;
  filterPropertyType: string[];
  setFilterPropertyType: (v: string[]) => void;
  filterCity: string[];
  setFilterCity: (v: string[]) => void;
  filterPreApproved: string[];
  setFilterPreApproved: (v: string[]) => void;
  filterCampaign: string[];
  setFilterCampaign: (v: string[]) => void;
  dynamicProjects: string[];
  dynamicLanguages: string[];
  dynamicTags: string[];
  dynamicCities: string[];
  dynamicCampaigns: string[];
  /** Unified lead-type library labels (from crm_lead_types). */
  dynamicLeadTypes?: string[];
  /** Optional usage counts keyed by option label */
  tagCounts?: Record<string, number>;
  projectCounts?: Record<string, number>;
  leadTypeCounts?: Record<string, number>;
  onClearAll: () => void;
  activeFilterCount: number;
}

function FilterAccordion({
  label,
  options,
  selected,
  onChange,
  optionLabels,
  optionCounts,
  tone = 'default',
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  optionLabels?: Record<string, string>;
  /** When provided, options are sorted by count desc and counts render next to each row */
  optionCounts?: Record<string, number>;
  /** Visual tone — 'exclude' shows a destructive accent for excluded selections */
  tone?: 'default' | 'exclude';
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const showSearch = options.length >= 5;

  // Sort by count desc (when counts provided), then alphabetical for stability
  const sortedOptions = useMemo(() => {
    if (!optionCounts) return options;
    return [...options].sort((a, b) => {
      const diff = (optionCounts[b] ?? 0) - (optionCounts[a] ?? 0);
      if (diff !== 0) return diff;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }, [options, optionCounts]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sortedOptions;
    const q = search.toLowerCase();
    return sortedOptions.filter(o => o.toLowerCase().includes(q));
  }, [sortedOptions, search]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const totalUnique = options.length;
  const isExclude = tone === 'exclude';

  return (
    <Collapsible open={expanded} onOpenChange={(o) => { setExpanded(o); if (!o) setSearch(''); }} className="border-b border-border/30">
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'flex items-center justify-between w-full px-4 py-3 text-sm font-medium transition-colors',
            isExclude ? 'text-foreground hover:bg-destructive/5' : 'text-foreground hover:bg-muted/30',
          )}
        >
          <span className="flex items-center gap-2">
            {isExclude && <span className="text-destructive font-bold leading-none">−</span>}
            {label}
            {selected.length > 0 ? (
              <Badge
                variant="secondary"
                className={cn(
                  'text-[10px] px-1.5 py-0 h-4',
                  isExclude && 'bg-destructive/15 text-destructive border-0',
                )}
              >
                {selected.length}
              </Badge>
            ) : (
              optionCounts && totalUnique > 0 && (
                <span className="text-[10px] text-muted-foreground tabular-nums">{totalUnique}</span>
              )
            )}
          </span>
          <ChevronRight
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform duration-200',
              expanded && 'rotate-90',
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
        <div className="px-2 pb-2">
          {isExclude && (
            <p className="px-2 pb-1.5 pt-0.5 text-[10px] text-muted-foreground">
              Hide leads with any of these tags
            </p>
          )}
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
          <div className="space-y-0.5 max-h-[260px] overflow-y-auto">
            {filtered.map(opt => {
              const count = optionCounts?.[opt];
              const isSelected = selected.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggle(opt)}
                  className={cn(
                    'flex items-center gap-2.5 w-full px-2 py-1.5 text-[13px] text-foreground rounded-md transition-colors',
                    isExclude ? 'hover:bg-destructive/5' : 'hover:bg-muted/40',
                    isSelected && (isExclude ? 'bg-destructive/10' : 'bg-primary/5'),
                  )}
                >
                  <div
                    className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all duration-150',
                      isSelected
                        ? isExclude
                          ? 'bg-destructive border-destructive scale-100'
                          : 'bg-primary border-primary scale-100'
                        : 'border-border/60 scale-95',
                    )}
                  >
                    {isSelected && (
                      isExclude
                        ? <X className="w-3 h-3 text-destructive-foreground" />
                        : <Check className="w-3 h-3 text-primary-foreground" />
                    )}
                  </div>
                  <span className={cn('truncate flex-1 text-left', isSelected && isExclude && 'line-through opacity-70')}>
                    {optionLabels?.[opt] ?? opt}
                  </span>
                  {typeof count === 'number' && (
                    <span className={cn(
                      'text-[10px] tabular-nums shrink-0 px-1.5 py-0.5 rounded-md',
                      isSelected
                        ? isExclude
                          ? 'bg-destructive/15 text-destructive font-semibold'
                          : 'bg-primary/15 text-primary font-semibold'
                        : 'bg-muted/50 text-muted-foreground',
                    )}>
                      {count.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                {search ? 'No matches' : 'No options'}
              </p>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
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
  filterExcludeTags,
  setFilterExcludeTags,
  filterPropertyType,
  setFilterPropertyType,
  filterCity,
  setFilterCity,
  filterPreApproved,
  setFilterPreApproved,
  filterCampaign,
  setFilterCampaign,
  dynamicProjects,
  dynamicLanguages,
  dynamicTags,
  dynamicCities,
  dynamicCampaigns,
  dynamicLeadTypes,
  tagCounts,
  projectCounts,
  leadTypeCounts,
  onClearAll,
  activeFilterCount,
}: FilterPanelProps) {
  const AGENTS = useAgentNames();
  // Defer unmount so the slide-out animation can play
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // double rAF guarantees the initial (hidden) styles paint before transitioning
      const id1 = requestAnimationFrame(() => {
        const id2 = requestAnimationFrame(() => setVisible(true));
        (setVisible as any)._id2 = id2;
      });
      return () => cancelAnimationFrame(id1);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 360);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        'w-[280px] shrink-0 border-l border-border/40 bg-card/80 backdrop-blur-sm flex flex-col h-full ml-3 rounded-l-xl',
        'transform-gpu transition-[transform,opacity,filter] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform',
        visible
          ? 'translate-x-0 opacity-100 blur-0'
          : 'translate-x-8 opacity-0 blur-[2px]',
      )}
    >
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
          <FilterAccordion label="Project" options={dynamicProjects} selected={filterProject} onChange={setFilterProject} optionCounts={projectCounts} />
          {(() => {
            // Merge canonical LEAD_TYPES with library entries from crm_lead_types
            // (case-insensitively) so every lead-type that exists anywhere in
            // the CRM is filterable — not just the hardcoded slugs.
            const seen = new Set<string>();
            const merged: string[] = [];
            [...LEAD_TYPES].forEach(t => { seen.add(t.toLowerCase()); merged.push(t); });
            (dynamicLeadTypes ?? []).forEach(t => {
              if (!seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); merged.push(t); }
            });
            return (
              <FilterAccordion
                label="Lead Type"
                options={merged}
                selected={filterLeadType}
                onChange={setFilterLeadType}
                optionLabels={LEAD_TYPE_LABELS}
                optionCounts={leadTypeCounts}
              />
            );
          })()}
          <FilterAccordion label="Language" options={[...CRM_LANGUAGES]} selected={filterLanguage} onChange={setFilterLanguage} />
          <FilterAccordion label="Tags" options={dynamicTags} selected={filterTags} onChange={setFilterTags} optionCounts={tagCounts} />
          <FilterAccordion label="Exclude Tags" options={dynamicTags} selected={filterExcludeTags} onChange={setFilterExcludeTags} optionCounts={tagCounts} tone="exclude" />
          <FilterAccordion label="Property Type" options={['condo', 'townhome', 'both']} selected={filterPropertyType} onChange={setFilterPropertyType} optionLabels={{ condo: 'Condo', townhome: 'Townhome', both: 'Both' }} />
          <FilterAccordion label="City Preference" options={[...FRASER_VALLEY_CITIES]} selected={filterCity} onChange={setFilterCity} />
          <FilterAccordion label="Pre-Approved" options={['yes', 'no']} selected={filterPreApproved} onChange={setFilterPreApproved} optionLabels={{ yes: 'Yes', no: 'No' }} />
          <FilterAccordion label="Campaign" options={dynamicCampaigns} selected={filterCampaign} onChange={setFilterCampaign} />
        </div>
      </ScrollArea>
    </div>
  );
}
