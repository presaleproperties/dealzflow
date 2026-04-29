// RecipientsRail — premium right pane of the email workspace.
// Search by name/email/phone. Filter by Segment, Project, Tag, Lead Type.
// Larger, more readable pills with avatars and clear typography.

import { useMemo, useState, useDeferredValue } from 'react';
import { Search, Users, X, Check, Filter, FolderOpen, Tag as TagIcon, UserCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useCrmContacts, useDynamicFilterOptions, type CrmContact } from '@/hooks/useCrmContacts';
import { useCrmLeadSegments, type LeadSegment } from '@/hooks/useCrmLeadSegments';
import { contactMatchesSegment } from '@/lib/segmentMatching';
import { formatContactName } from '@/lib/format';

interface Props {
  selected: CrmContact[];
  onSelectedChange: (next: CrmContact[]) => void;
}

type Mode = 'segments' | 'projects' | 'tags' | 'lead_type';

function getInitials(c: CrmContact): string {
  const f = (c.first_name ?? '').trim()[0];
  const l = (c.last_name ?? '').trim()[0];
  if (f || l) return `${f ?? ''}${l ?? ''}`.toUpperCase();
  return (c.email ?? '?').slice(0, 2).toUpperCase();
}

function avatarHue(c: CrmContact): number {
  const seed = (c.id || c.email || 'x').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return seed % 360;
}

export function RecipientsRail({ selected, onSelectedChange }: Props) {
  const { data: contacts = [], isLoading } = useCrmContacts();
  const { data: segments = [] } = useCrmLeadSegments();
  const { projects, tags, leadTypes, projectCounts, tagCounts, leadTypeCounts } = useDynamicFilterOptions(contacts);

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  // Allow ad-hoc sends to any typed email — no CRM contact required.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const trimmedSearch = search.trim();
  const isTypedEmail = EMAIL_RE.test(trimmedSearch);
  const typedEmailLower = isTypedEmail ? trimmedSearch.toLowerCase() : '';
  const typedEmailExists = isTypedEmail
    && (contacts.some((c) => (c.email ?? '').toLowerCase() === typedEmailLower)
      || selected.some((s) => (s.email ?? '').toLowerCase() === typedEmailLower));

  const addManualRecipient = () => {
    if (!isTypedEmail || typedEmailExists) return;
    const synthetic: CrmContact = {
      id: `manual:${typedEmailLower}`,
      first_name: '',
      last_name: typedEmailLower,
      email: typedEmailLower,
      email_secondary: null,
      phone: null,
      phone_secondary: null,
      address: null,
      city: null,
      province: null,
      postal_code: null,
      source: null,
      status: null,
      project: null,
      projects: [],
      assigned_to: null,
      tags: [],
      budget_min: null,
      budget_max: null,
      bedrooms_preferred: null,
      language: null,
      lead_type: null,
      lead_score: null,
      notes: null,
      contact_type: 'manual',
      birthday: null,
      co_buyer_name: null,
      co_buyer_phone: null,
      co_buyer_email: null,
      co_buyer_birthday: null,
      last_contact_at: null,
      next_followup_date: null,
      status_changed_at: null,
      lofty_id: null,
      last_touch_at: null,
      last_touch_type: null,
      stage_changed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    onSelectedChange([...selected, synthetic]);
    setSearch('');
  };

  const [mode, setMode] = useState<Mode>('segments');
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [activeProjects, setActiveProjects] = useState<Set<string>>(new Set());
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [activeLeadTypes, setActiveLeadTypes] = useState<Set<string>>(new Set());
  const [onlyWithEmail, setOnlyWithEmail] = useState(true);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const activeSegment: LeadSegment | undefined = useMemo(
    () => segments.find((s) => s.id === activeSegmentId),
    [segments, activeSegmentId],
  );

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return contacts.filter((c) => {
      if (onlyWithEmail && !c.email) return false;
      if (q) {
        const name = formatContactName(c.first_name, c.last_name).toLowerCase();
        const email = (c.email ?? '').toLowerCase();
        const phone = (c.phone ?? '').toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !phone.includes(q)) return false;
      }
      if (activeSegment && Object.keys(activeSegment.filter_config).length > 0) {
        if (!contactMatchesSegment(c, activeSegment.filter_config)) return false;
      }
      if (activeProjects.size > 0) {
        const projs = [
          ...((c.projects as string[] | undefined) ?? []),
          ...(c.project ? [c.project] : []),
        ].map((p) => p.toLowerCase());
        if (!projs.some((p) => activeProjects.has(p))) return false;
      }
      if (activeTags.size > 0) {
        const ts = ((c.tags as string[] | undefined) ?? []).map((t) => t.toLowerCase());
        if (!ts.some((t) => activeTags.has(t))) return false;
      }
      if (activeLeadTypes.size > 0) {
        const lts = [
          ...(((c as any).lead_types as string[] | undefined) ?? []),
          ...(c.lead_type ? [c.lead_type] : []),
        ].map((t) => t.toLowerCase());
        if (!lts.some((t) => activeLeadTypes.has(t))) return false;
      }
      return true;
    });
  }, [contacts, deferredSearch, onlyWithEmail, activeSegment, activeProjects, activeTags, activeLeadTypes]);

  const toggle = (c: CrmContact) => {
    if (selectedIds.has(c.id)) {
      onSelectedChange(selected.filter((s) => s.id !== c.id));
    } else {
      onSelectedChange([...selected, c]);
    }
  };

  const selectAllVisible = () => {
    const visibleIds = new Set(filtered.map((c) => c.id));
    const others = selected.filter((s) => !visibleIds.has(s.id));
    onSelectedChange([...others, ...filtered]);
  };

  const allVisibleSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const totalActiveFilters = (activeSegmentId ? 1 : 0) + activeProjects.size + activeTags.size + activeLeadTypes.size;

  const clearAllFilters = () => {
    setActiveSegmentId(null);
    setActiveProjects(new Set());
    setActiveTags(new Set());
    setActiveLeadTypes(new Set());
  };

  const toggleSetItem = (
    set: Set<string>,
    setter: (s: Set<string>) => void,
    value: string,
  ) => {
    const key = value.toLowerCase();
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  return (
    <aside className="flex flex-col h-full min-h-0 border-l border-border bg-gradient-to-b from-muted/10 to-transparent">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[12px] font-semibold text-foreground leading-tight">Recipients</h3>
            <p className="text-[10.5px] text-muted-foreground leading-tight">
              {selected.length > 0
                ? `${selected.length.toLocaleString()} selected`
                : `${filtered.length.toLocaleString()} of ${contacts.length.toLocaleString()}`}
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="pl-8 h-9 text-[12.5px] bg-background"
          />
        </div>

        {/* Filter mode tabs */}
        <div className="flex items-center gap-0.5 mt-2.5 p-0.5 bg-muted/40 rounded-lg">
          {([
            { v: 'segments', label: 'Segments', icon: Filter },
            { v: 'projects', label: 'Projects', icon: FolderOpen },
            { v: 'tags', label: 'Tags', icon: TagIcon },
            { v: 'lead_type', label: 'Type', icon: UserCircle2 },
          ] as const).map((t) => {
            const isActive = mode === t.v;
            const count =
              t.v === 'segments' ? (activeSegmentId ? 1 : 0) :
              t.v === 'projects' ? activeProjects.size :
              t.v === 'tags' ? activeTags.size :
              activeLeadTypes.size;
            return (
              <button
                key={t.v}
                type="button"
                onClick={() => setMode(t.v)}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-1 h-6 px-2 rounded-md text-[10.5px] font-medium transition-colors',
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <t.icon className="h-3 w-3" />
                {t.label}
                {count > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filter chips by mode */}
        <div className="mt-2 min-h-[24px]">
          {mode === 'segments' && (
            <div className="flex flex-wrap gap-1">
              <FilterChip label="All" active={!activeSegmentId} onClick={() => setActiveSegmentId(null)} />
              {segments
                .filter((s) => Object.keys(s.filter_config).length > 0)
                .slice(0, 12)
                .map((seg) => {
                  const cleanName = seg.name.replace(/🔥|🏢|🛒|🔍|💬|🔒|❄️/g, '').trim();
                  return (
                    <FilterChip
                      key={seg.id}
                      label={cleanName}
                      emoji={seg.emoji ?? undefined}
                      active={activeSegmentId === seg.id}
                      onClick={() => setActiveSegmentId(activeSegmentId === seg.id ? null : seg.id)}
                    />
                  );
                })}
            </div>
          )}
          {mode === 'projects' && (
            <FilterMultiPicker
              options={projects}
              counts={projectCounts}
              active={activeProjects}
              onToggle={(v) => toggleSetItem(activeProjects, setActiveProjects, v)}
              emptyLabel="No projects yet"
              placeholder="Search projects…"
            />
          )}
          {mode === 'tags' && (
            <FilterMultiPicker
              options={tags}
              counts={tagCounts}
              active={activeTags}
              onToggle={(v) => toggleSetItem(activeTags, setActiveTags, v)}
              emptyLabel="No tags yet"
              placeholder="Search tags…"
            />
          )}
          {mode === 'lead_type' && (
            <div className="flex flex-wrap gap-1">
              {leadTypes.length === 0 ? (
                <span className="text-[10.5px] text-muted-foreground px-1">No lead types yet</span>
              ) : (
                leadTypes.map((lt) => (
                  <FilterChip
                    key={lt}
                    label={lt}
                    count={leadTypeCounts[lt]}
                    active={activeLeadTypes.has(lt.toLowerCase())}
                    onClick={() => toggleSetItem(activeLeadTypes, setActiveLeadTypes, lt)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Active filter summary + actions */}
        <div className="flex items-center justify-between mt-2.5 gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyWithEmail}
              onChange={(e) => setOnlyWithEmail(e.target.checked)}
              className="rounded border-border h-3 w-3"
            />
            Email only
          </label>
          <div className="flex items-center gap-2">
            {totalActiveFilters > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
              >
                <X className="h-2.5 w-2.5" />
                Clear filters
              </button>
            )}
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={selectAllVisible}
                className="text-[10.5px] font-semibold uppercase tracking-wider text-primary hover:underline"
              >
                {allVisibleSelected ? 'Deselect' : `Select ${filtered.length.toLocaleString()}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Selected summary bar */}
      {selected.length > 0 && (
        <div className="px-4 py-2 border-b border-border bg-primary/8 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11.5px] font-semibold text-foreground">
            {selected.length.toLocaleString()} recipient{selected.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => onSelectedChange([])}
            className="text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground font-medium"
          >
            Clear
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="text-[11.5px] text-muted-foreground text-center py-8">Loading leads…</div>
        ) : filtered.length === 0 ? (
          <div className="text-[11.5px] text-muted-foreground text-center py-8 px-4">
            <Filter className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
            No leads match your filters
          </div>
        ) : (
          filtered.slice(0, 500).map((c) => {
            const isSel = selectedIds.has(c.id);
            const hue = avatarHue(c);
            const initials = getInitials(c);
            const projsOnRow = [
              ...((c.projects as string[] | undefined) ?? []),
              ...(c.project ? [c.project] : []),
            ];
            const firstProject = projsOnRow[0];
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c)}
                className={cn(
                  'w-full text-left flex items-center gap-2.5 px-3 py-2.5 border-b border-border/40 transition-colors group',
                  isSel ? 'bg-primary/8 hover:bg-primary/12' : 'hover:bg-muted/40',
                )}
              >
                {/* Checkbox */}
                <div
                  className={cn(
                    'h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                    isSel ? 'bg-primary border-primary' : 'border-border bg-background group-hover:border-primary/50',
                  )}
                >
                  {isSel && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                </div>

                {/* Avatar */}
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-[10.5px] font-bold text-foreground/80 ring-1 ring-border/50"
                  style={{
                    background: `hsl(${hue} 60% 92%)`,
                    color: `hsl(${hue} 50% 28%)`,
                  }}
                >
                  {initials}
                </div>

                {/* Identity */}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate leading-tight">
                    {formatContactName(c.first_name, c.last_name)}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                    {c.email ?? <span className="text-amber-600">No email on file</span>}
                  </p>
                  {firstProject && (
                    <p className="text-[10px] text-muted-foreground/80 truncate leading-tight mt-0.5">
                      <FolderOpen className="inline-block h-2.5 w-2.5 mr-0.5 -mt-px" />
                      {firstProject}
                      {projsOnRow.length > 1 && (
                        <span className="text-muted-foreground/60"> +{projsOnRow.length - 1}</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Status pill */}
                {c.status && (
                  <Badge
                    variant="outline"
                    className="text-[9.5px] h-5 px-1.5 shrink-0 uppercase tracking-wider font-semibold border-border/60"
                  >
                    {c.status.split(' ')[0]}
                  </Badge>
                )}
              </button>
            );
          })
        )}
        {filtered.length > 500 && (
          <div className="text-[11px] text-muted-foreground text-center py-3 border-t border-border/40 bg-muted/10">
            Showing first 500 of {filtered.length.toLocaleString()} — refine filters to narrow
          </div>
        )}
      </div>
    </aside>
  );
}

// Reusable filter chip — premium pill with proper sizing
function FilterChip({
  label,
  emoji,
  count,
  active,
  onClick,
}: {
  label: string;
  emoji?: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium border transition-all',
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-background text-foreground border-border hover:bg-muted hover:border-primary/40',
      )}
      title={label}
    >
      {emoji && <span className="text-[11px] leading-none">{emoji}</span>}
      <span className="truncate max-w-[110px]">{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span
          className={cn(
            'text-[9.5px] font-semibold',
            active ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// Multi-select picker for long lists (projects, tags) — overflow into a popover
function FilterMultiPicker({
  options,
  counts,
  active,
  onToggle,
  emptyLabel,
  placeholder,
}: {
  options: string[];
  counts: Record<string, number>;
  active: Set<string>;
  onToggle: (value: string) => void;
  emptyLabel: string;
  placeholder: string;
}) {
  const [search, setSearch] = useState('');
  if (options.length === 0) {
    return <span className="text-[10.5px] text-muted-foreground px-1">{emptyLabel}</span>;
  }

  // Show top 6 most-used inline; rest behind "More" popover
  const sorted = [...options].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  const inline = sorted.slice(0, 6);
  const overflow = sorted.slice(6);

  // Always include any active items in inline view
  const activeNotInInline = sorted.filter(
    (o) => active.has(o.toLowerCase()) && !inline.includes(o),
  );
  const inlineAll = [...inline, ...activeNotInInline];

  const filteredOverflow = overflow.filter((o) => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {inlineAll.map((opt) => (
        <FilterChip
          key={opt}
          label={opt}
          count={counts[opt]}
          active={active.has(opt.toLowerCase())}
          onClick={() => onToggle(opt)}
        />
      ))}
      {overflow.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-0.5 h-6 px-2 rounded-full text-[10.5px] font-medium border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              +{overflow.length} more
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[260px] p-0" sideOffset={6}>
            <div className="px-2.5 py-2 border-b border-border bg-muted/30">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={placeholder}
                  className="h-7 pl-6 text-[11.5px]"
                />
              </div>
            </div>
            <ScrollArea className="max-h-[280px]">
              <div className="py-1">
                {filteredOverflow.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-3">No matches</p>
                ) : (
                  filteredOverflow.map((opt) => {
                    const isActive = active.has(opt.toLowerCase());
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => onToggle(opt)}
                        className={cn(
                          'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11.5px] text-left transition-colors',
                          isActive ? 'bg-primary/8 text-foreground' : 'text-foreground/90 hover:bg-muted/60',
                        )}
                      >
                        <div
                          className={cn(
                            'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0',
                            isActive ? 'bg-primary border-primary' : 'border-border',
                          )}
                        >
                          {isActive && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />}
                        </div>
                        <span className="flex-1 truncate">{opt}</span>
                        {counts[opt] > 0 && (
                          <span className="text-[10px] text-muted-foreground">{counts[opt]}</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
