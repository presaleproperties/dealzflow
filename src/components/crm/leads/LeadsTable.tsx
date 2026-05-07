import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Phone, Mail, MessageSquare, Check } from 'lucide-react';
import { getMissingFields, formatFieldName } from '@/lib/dataCompleteness';
import { formatContactName, formatPhone, formatEmail } from '@/lib/format';
import { LEAD_TYPE_LABELS, LEAD_STATUSES, useBulkAddTagsToContacts } from '@/hooks/useCrmContacts';
import { useTeamAgents } from '@/hooks/useTeamAgents';
import { AgentAvatar } from '@/components/crm/AgentAvatar';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { useCrmTags } from '@/hooks/useCrmTags';
import { useCrmLeadSegments } from '@/hooks/useCrmLeadSegments';
import { useColumnWidths, useColumnResizer } from '@/hooks/useColumnWidths';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Plus } from 'lucide-react';
import { LeadStatusBadge } from './LeadStatusBadge';
import { SwipeRow } from './SwipeRow';
import { SendTextDialog } from './SendTextDialog';
import { ComposeEmailDialog } from './ComposeEmailDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePrefetchLead } from '@/hooks/usePrefetchCrm';
import { toast } from 'sonner';
import type { CrmContact } from '@/hooks/useCrmContacts';
import type { SortKey, SortDir } from '@/hooks/usePaginatedCrmContacts';

/**
 * Compact relative date for the REG column. The default
 * `formatDistanceToNow(..., { addSuffix: true })` produces strings like
 * "over 3 years ago" / "almost 2 years ago" that wrap onto two lines in a
 * narrow column. We collapse the long modifiers ("over"/"almost"/"about")
 * into compact suffix forms that always fit on one line.
 */
function formatRegisteredAge(iso: string | null | undefined): string {
  if (!iso) return '—';
  const raw = formatDistanceToNow(new Date(iso), { addSuffix: false });
  // raw examples: "over 3 years", "almost 2 years", "about 5 months", "24 days", "less than a minute"
  const overMatch = raw.match(/^over\s+(.+)$/i);
  if (overMatch) return `${overMatch[1]} +`;
  const almostMatch = raw.match(/^almost\s+(.+)$/i);
  if (almostMatch) return `~${almostMatch[1]}`;
  const aboutMatch = raw.match(/^about\s+(.+)$/i);
  if (aboutMatch) return `${aboutMatch[1]} ago`;
  const lessMatch = raw.match(/^less than\s+(.+)$/i);
  if (lessMatch) return `<${lessMatch[1]}`;
  return `${raw} ago`;
}

interface LeadsTableProps {
  contacts: CrmContact[];
  isLoading: boolean;
  isFetching: boolean;
  totalCount: number;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  visibleColumns: Set<string>;
  hidePagination?: boolean;
}

const STATUS_BORDER_COLORS: Record<string, string> = {
  'New Lead': 'hsl(210 62% 46%)',
  'Contacted': 'hsl(210 62% 46%)',
  'Nurturing': 'hsl(38 92% 50%)',
  'Hot / Engaged': 'hsl(0 84% 60%)',
  'Showing Booked': 'hsl(142 71% 45%)',
  'Offer Made': 'hsl(270 60% 55%)',
  'Closed': 'hsl(142 71% 35%)',
  'Lost / Cold': 'hsl(0 84% 60%)',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'New Lead':        { bg: 'hsl(210 62% 46% / 0.12)', color: 'hsl(210 62% 46%)' },
  'New Leads':       { bg: 'hsl(210 62% 46% / 0.12)', color: 'hsl(210 62% 46%)' },
  'Pre-Sale':        { bg: 'hsl(25 95% 53% / 0.12)',  color: 'hsl(25 95% 53%)' },
  'Re-Sale':         { bg: 'hsl(15 85% 55% / 0.12)',  color: 'hsl(15 85% 55%)' },
  'Commercial':      { bg: 'hsl(220 50% 50% / 0.12)', color: 'hsl(220 50% 50%)' },
  'Showing Booked':  { bg: 'hsl(142 71% 45% / 0.12)', color: 'hsl(142 71% 45%)' },
  'Offer Made':      { bg: 'hsl(270 60% 55% / 0.12)', color: 'hsl(270 60% 55%)' },
  'Nurturing':       { bg: 'hsl(var(--primary) / 0.12)',  color: 'hsl(var(--primary))' },
  'Closed':          { bg: 'hsl(142 71% 35% / 0.12)', color: 'hsl(142 71% 35%)' },
  'Lost / Cold':     { bg: 'hsl(0 60% 55% / 0.10)',   color: 'hsl(0 60% 55%)' },
  // legacy values still rendered if a contact has them
  'Contacted':       { bg: 'hsl(210 62% 46% / 0.10)', color: 'hsl(210 62% 56%)' },
  'Hot / Engaged':   { bg: 'hsl(0 84% 60% / 0.12)',   color: 'hsl(0 84% 60%)' },
};

// Pipeline dropdown options come from the crm_lead_segments table at runtime so
// the in-row dropdown, the top pills, and the Pipeline Kanban can never drift
// out of sync. See InlineStatusCell below.

const CONTACT_TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  lead: { bg: 'hsl(210 62% 46% / 0.12)', color: 'hsl(210 62% 46%)', label: 'Lead' },
  realtor: { bg: 'hsl(270 60% 55% / 0.12)', color: 'hsl(270 60% 55%)', label: 'Realtor' },
  past_client: { bg: 'hsl(142 71% 40% / 0.12)', color: 'hsl(142 71% 40%)', label: 'Client' },
};

const TAG_COLORS = [
  { bg: 'hsl(210 62% 46% / 0.12)', color: 'hsl(210 62% 46%)' },
  { bg: 'hsl(270 60% 55% / 0.12)', color: 'hsl(270 60% 55%)' },
  { bg: 'hsl(142 71% 40% / 0.12)', color: 'hsl(142 71% 40%)' },
  { bg: 'hsl(38 92% 50% / 0.12)', color: 'hsl(38 92% 50%)' },
  { bg: 'hsl(0 84% 60% / 0.12)', color: 'hsl(0 84% 60%)' },
];


interface TagLibItem { label: string; count: number }

function InlineTagsCell({
  contact,
  tagLibrary,
  updateContact,
}: {
  contact: CrmContact;
  tagLibrary: TagLibItem[];
  updateContact: ReturnType<typeof useUpdateCrmContact>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const addTags = useBulkAddTagsToContacts();
  const tags = contact.tags ?? [];
  const shown = tags.slice(0, 2);
  const extra = tags.length - 2;

  const toggleTag = (tag: string) => {
    const value = tag.trim();
    if (!value) return;
    const exists = tags.some(t => t.toLowerCase() === value.toLowerCase());
    const next = exists
      ? tags.filter(t => t.toLowerCase() !== value.toLowerCase())
      : [...tags, value];
    // The crm_contacts trg_sync_crm_tags trigger will auto-upsert this into the
    // canonical crm_tags library, making it instantly reusable everywhere.
    if (exists) {
      updateContact.mutate({ id: contact.id, updates: { tags: next }, oldValues: { tags } });
      return;
    }

    addTags.mutate({ ids: [contact.id], tags: [value], silent: true });
  };

  const trimmed = search.trim();
  const tagsLower = useMemo(() => new Set(tags.map(t => t.toLowerCase())), [tags]);
  const libraryLower = useMemo(
    () => new Set(tagLibrary.map(t => t.label.toLowerCase())),
    [tagLibrary],
  );
  const canCreate =
    trimmed.length > 0 &&
    !libraryLower.has(trimmed.toLowerCase()) &&
    !tagsLower.has(trimmed.toLowerCase());

  // Library entries not currently applied to this contact, filtered by search.
  const availableSorted = useMemo(() => {
    const q = trimmed.toLowerCase();
    return tagLibrary
      .filter(t => !tagsLower.has(t.label.toLowerCase()))
      .filter(t => (q ? t.label.toLowerCase().includes(q) : true));
  }, [tagLibrary, tagsLower, trimmed]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          title={tags.join(', ')}
          className="flex items-center gap-1 flex-nowrap overflow-hidden min-h-[28px] px-1.5 py-1 -mx-1.5 rounded-md hover:bg-muted/40 transition-colors w-full text-left"
        >
          {tags.length === 0 ? (
            <span className="text-muted-foreground text-[12px] inline-flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add tag
            </span>
          ) : (
            <>
              {shown.map((tag, i) => {
                const c = TAG_COLORS[i % TAG_COLORS.length];
                return (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="border-0 text-[11px] font-semibold whitespace-nowrap px-2 py-0.5 max-w-[120px] overflow-hidden text-ellipsis block shrink"
                    style={{ background: c.bg, color: c.color }}
                  >
                    <span className="block truncate">{tag}</span>
                  </Badge>
                );
              })}
              {extra > 0 && <span className="text-[11px] text-muted-foreground font-medium shrink-0">+{extra}</span>}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[320px] p-0 text-[13px] leading-normal"
        align="start"
        onClick={e => e.stopPropagation()}
      >
        <Command shouldFilter={false} className="[&_[cmdk-input]]:!h-9 [&_[cmdk-input]]:!text-[13px] [&_[cmdk-item]]:!py-1.5 [&_[cmdk-item]]:!text-[13px] [&_[cmdk-group-heading]]:!text-[10px] [&_[cmdk-group-heading]]:!uppercase [&_[cmdk-group-heading]]:!tracking-wider [&_[cmdk-group-heading]]:!text-muted-foreground [&_[cmdk-group-heading]]:!px-2 [&_[cmdk-group-heading]]:!py-1.5">
          <CommandInput
            placeholder="Search or create tag…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => { toggleTag(trimmed); setSearch(''); }}
                  className="w-full text-left px-2 py-1.5 text-[13px] hover:bg-muted/50 rounded-sm flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Create "{trimmed}"
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">No tags found.</span>
              )}
            </CommandEmpty>
            {tags.length > 0 && (
              <CommandGroup heading="Applied">
                {tags.map(tag => (
                  <CommandItem key={`applied-${tag}`} value={`applied-${tag}`} onSelect={() => toggleTag(tag)}>
                    <Check className="w-3.5 h-3.5 mr-2 text-primary shrink-0" />
                    <span className="flex-1 truncate">{tag}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={`All tags · ${tagLibrary.length}`}>
              {canCreate && (
                <CommandItem
                  value={`__create__${trimmed}`}
                  onSelect={() => { toggleTag(trimmed); setSearch(''); }}
                >
                  <Plus className="w-3.5 h-3.5 mr-2 text-primary shrink-0" />
                  <span className="flex-1 truncate">Create "<span className="font-semibold">{trimmed}</span>"</span>
                </CommandItem>
              )}
              {availableSorted.slice(0, 200).map(item => (
                <CommandItem
                  key={item.label}
                  value={item.label}
                  onSelect={() => toggleTag(item.label)}
                >
                  <span className="w-3.5 h-3.5 mr-2 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums ml-2 shrink-0">{item.count}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ProjectsList({ projects, project }: { projects?: string[]; project?: string | null }) {
  const all = projects && projects.length > 0 ? projects : project ? [project] : [];
  if (all.length === 0) return <span className="text-muted-foreground text-sm">—</span>;
  const shown = all.slice(0, 2);
  const extra = all.length - 2;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map(p => (
        <Badge key={p} variant="outline" className="border-0 text-[11px] font-semibold whitespace-nowrap px-2 py-0.5" style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}>
          {p}
        </Badge>
      ))}
      {extra > 0 && <span className="text-[11px] text-muted-foreground font-medium">+{extra}</span>}
    </div>
  );
}

type ColumnDef = { key: string; sortKey?: SortKey; label: string; width: string };

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'name', sortKey: 'name', label: 'Name', width: '200px' },
  { key: 'contactInfo', label: 'Contact Info', width: '240px' },
  { key: 'phone', sortKey: 'phone', label: 'Phone', width: '140px' },
  { key: 'email', sortKey: 'email', label: 'Email', width: '220px' },
  { key: 'reg', sortKey: 'created_at', label: 'Reg', width: '90px' },
  { key: 'project', sortKey: 'project', label: 'Projects', width: '160px' },
  { key: 'source', sortKey: 'source', label: 'Source', width: '130px' },
  { key: 'pipeline', sortKey: 'status', label: 'Pipeline', width: '160px' },
  { key: 'tags', label: 'Tags', width: '200px' },
  { key: 'assigned_to', sortKey: 'assigned_to', label: 'Agent', width: '180px' },
  { key: 'last_touch_at', sortKey: 'last_touch_at', label: 'Last Activity', width: '130px' },
  { key: 'created_at', sortKey: 'created_at', label: 'Added', width: '110px' },
  { key: 'campaign_source', label: 'Campaign', width: '160px' },
  { key: 'city_pref', label: 'City Pref', width: '120px' },
  { key: 'property_type_pref', label: 'Prop Type', width: '120px' },
  { key: 'is_pre_approved', label: 'Pre-Approved', width: '110px' },
  { key: 'quick_actions', label: 'Actions', width: '120px' },
];

/**
 * Resizable column header. The whole header is clickable for sorting; the
 * 6px right-edge handle is a separate drag zone that captures pointer events
 * and adjusts column width via the useColumnResizer hook. Double-click on
 * the handle resets ALL column widths to defaults (faster than menu hunt).
 */
function ResizableHeaderCell({
  col, width, onResize, onResetAll, onSort, SortIcon,
}: {
  col: ColumnDef;
  width: number;
  onResize: (next: number) => void;
  onResetAll: () => void;
  onSort: (key: SortKey) => void;
  SortIcon: React.ComponentType<{ col: SortKey }>;
}) {
  const { onPointerDown } = useColumnResizer(() => width, onResize);
  return (
    <th
      className="relative px-3 py-3.5 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-wider select-none hover:text-foreground transition-colors group"
    >
      <span
        onClick={() => col.sortKey && onSort(col.sortKey)}
        className={`inline-flex items-center gap-1.5 ${col.sortKey ? 'cursor-pointer' : ''}`}
      >
        {col.label}
        {col.sortKey && <SortIcon col={col.sortKey} />}
      </span>
      <div
        onPointerDown={onPointerDown}
        onDoubleClick={onResetAll}
        title="Drag to resize · double-click to reset all columns"
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-primary/40 active:bg-primary transition-colors"
        style={{ touchAction: 'none' }}
      />
    </th>
  );
}

/* ── Inline Pipeline Editor ──
 * Options come from crm_lead_segments so the in-row dropdown, the pill bar
 * above the table, and the Pipeline Kanban board always show the same set.
 * Picking a segment writes both `status` and `lead_type` from its
 * filter_config (matching the Kanban drag-drop behavior).
 */
function InlineStatusCell({ contact, updateContact }: { contact: CrmContact; updateContact: ReturnType<typeof useUpdateCrmContact> }) {
  const { data: segments = [] } = useCrmLeadSegments();

  // Pipeline-eligible segments (exclude the "All Leads" catch-all)
  const pipelineSegments = useMemo(
    () => segments.filter(s => s.filter_config && Object.keys(s.filter_config).length > 0),
    [segments],
  );

  // Determine which segment this contact currently belongs to (first match wins,
  // mirroring the Pipeline Kanban). Falls back to a label derived from status.
  const activeSeg = useMemo(() => {
    for (const seg of pipelineSegments) {
      const fc = seg.filter_config as Record<string, unknown>;
      const statusOk = !fc.status || (Array.isArray(fc.status) && (fc.status as string[]).includes(contact.status ?? ''));
      const wantedTypes = Array.isArray(fc.lead_type) ? (fc.lead_type as string[]) : null;
      const contactTypes: string[] = (((contact as any).lead_types as string[] | undefined)?.length)
        ? ((contact as any).lead_types as string[])
        : contact.lead_type ? [contact.lead_type] : [];
      const typeOk = !wantedTypes || wantedTypes.some(w => contactTypes.includes(w));
      if (statusOk && typeOk) return seg;
    }
    return null;
  }, [pipelineSegments, contact]);

  const displayLabel = activeSeg?.name ?? (contact.status ?? 'New Leads');
  const displayColor = activeSeg?.color ?? 'hsl(var(--muted-foreground))';

  const onPick = (segId: string) => {
    const seg = pipelineSegments.find(s => s.id === segId);
    if (!seg) return;
    const fc = seg.filter_config as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    const oldValues: Record<string, unknown> = {};
    if (Array.isArray(fc.status) && (fc.status as string[]).length > 0) {
      updates.status = (fc.status as string[])[0];
      updates.status_changed_at = new Date().toISOString();
      oldValues.status = contact.status;
    }
    if (Array.isArray(fc.lead_type) && (fc.lead_type as string[]).length > 0) {
      updates.lead_type = (fc.lead_type as string[])[0];
      oldValues.lead_type = contact.lead_type;
    }
    if (Object.keys(updates).length === 0) return;
    updateContact.mutate({ id: contact.id, updates, oldValues });
    toast.success(`Pipeline → ${seg.name}`);
  };

  return (
    <div onClick={e => e.stopPropagation()}>
      <Select value={activeSeg?.id ?? ''} onValueChange={onPick}>
        <SelectTrigger
          className="h-7 border-0 px-2.5 py-0 text-[11.5px] font-semibold uppercase tracking-[0.06em] shadow-none hover:opacity-90 rounded-full w-auto min-w-0 gap-1 [&>svg:last-child]:hidden focus:ring-1 focus:ring-offset-0"
          style={{ background: `${displayColor}1F`, color: displayColor }}
        >
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: displayColor }} />
            <span>{displayLabel}</span>
          </span>
        </SelectTrigger>
        <SelectContent>
          {pipelineSegments.map(seg => (
            <SelectItem key={seg.id} value={seg.id} className="text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: seg.color }} />
                {seg.emoji && <span>{seg.emoji}</span>}
                {seg.name}
                {seg.id === activeSeg?.id && <Check className="w-3 h-3 text-primary ml-1" />}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ── Inline Agent Editor ── */
function InlineAgentCell({ contact, updateContact }: { contact: CrmContact; updateContact: ReturnType<typeof useUpdateCrmContact> }) {
  const { data: agents = [] } = useTeamAgents();
  const current = agents.find((a) => a.name === contact.assigned_to);
  return (
    <div onClick={e => e.stopPropagation()}>
      <Select
        value={contact.assigned_to ?? ''}
        onValueChange={v => {
          updateContact.mutate({ id: contact.id, updates: { assigned_to: v }, oldValues: { assigned_to: contact.assigned_to } });
          toast.success(`Assigned → ${v}`);
        }}
      >
        <SelectTrigger className="h-8 border-0 bg-transparent p-0 text-[12px] shadow-none hover:bg-muted/40 rounded-md px-2 w-full min-w-0 max-w-full text-muted-foreground gap-1.5 [&>svg]:shrink-0 [&>span]:!flex [&>span]:!items-center [&>span]:min-w-0 [&>span]:flex-1">
          {current ? (
            <span className="items-center gap-1.5 min-w-0 flex-1 whitespace-nowrap leading-none">
              <AgentAvatar name={current.name} headshotUrl={current.headshot_url} focalY={current.focal_y} size={18} />
              <span className="min-w-0 truncate whitespace-nowrap leading-none">{current.name}</span>
            </span>
          ) : (
            <SelectValue placeholder="Unassigned" />
          )}
        </SelectTrigger>
        <SelectContent className="min-w-[200px]">
          {agents.map(a => (
            <SelectItem key={a.id} value={a.name} className="text-xs whitespace-nowrap">
              <span className="inline-flex items-center gap-2 whitespace-nowrap leading-none">
                <AgentAvatar name={a.name} headshotUrl={a.headshot_url} focalY={a.focal_y} size={20} />
                <span className="whitespace-nowrap leading-none">{a.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ── Last Activity with color coding ── */
function LastTouchCell({ contact }: { contact: CrmContact }) {
  if (!contact.last_touch_at) {
    return (
      <div className="flex flex-col">
        <span className="text-muted-foreground italic text-[12px]">No activity</span>
        <span className="text-[11px] text-destructive font-medium">Needs attention</span>
      </div>
    );
  }
  const days = Math.floor((Date.now() - new Date(contact.last_touch_at).getTime()) / 86400000);
  const color = days <= 7 ? 'hsl(142 71% 45%)' : days <= 30 ? 'hsl(38 92% 50%)' : 'hsl(0 60% 55%)';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col">
            <span className="text-[12px] font-medium" style={{ color }}>
              {formatDistanceToNow(new Date(contact.last_touch_at), { addSuffix: true })}
            </span>
            {days >= 14 && <span className="text-[11px] text-destructive font-medium">Needs attention</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {format(new Date(contact.last_touch_at), 'MMM d, yyyy h:mm a')}
          {contact.last_touch_type && ` · ${contact.last_touch_type.replace(/_/g, ' ')}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ── Cell renderer ── */
function CellContent({ col, contact, updateContact, tagLibrary, onSendSms, onSendEmail }: { col: ColumnDef; contact: CrmContact; updateContact: ReturnType<typeof useUpdateCrmContact>; tagLibrary: TagLibItem[]; onSendSms: (c: CrmContact) => void; onSendEmail: (c: CrmContact) => void }) {
  switch (col.key) {
    case 'name': {
      const leadType = (contact as any).lead_type as string | null;
      const typeStyle = CONTACT_TYPE_STYLES[contact.contact_type] ?? CONTACT_TYPE_STYLES.lead;
      return (
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-[14px] text-foreground truncate inline-flex items-center gap-1.5">
            {formatContactName(contact.first_name, contact.last_name)}
            {contact.contact_type === 'past_client' && getMissingFields(contact).length > 0 && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#F59E0B' }} />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Missing: {getMissingFields(contact).map(formatFieldName).join(', ')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </span>
          <span className="text-[11px] text-muted-foreground font-medium">
            {leadType ? (LEAD_TYPE_LABELS[leadType] ?? leadType) : typeStyle.label}
          </span>
        </div>
      );
    }
    case 'contactInfo':
      return (
        <div className="flex flex-col text-[12px] text-muted-foreground gap-0.5">
          <span className="truncate max-w-[220px] text-foreground/80">{formatEmail(contact.email) || '—'}</span>
          <span className="tabular-nums">{formatPhone(contact.phone) || '—'}</span>
        </div>
      );
    case 'reg':
      return (
        <div className="flex flex-col text-[12px] gap-0.5">
          <span className="text-foreground/80 whitespace-nowrap">{formatRegisteredAge(contact.created_at)}</span>
          <span className="text-[11px] text-muted-foreground">{contact.source ?? '—'}</span>
        </div>
      );
    case 'phone':
      return <span className="text-foreground/80 whitespace-nowrap text-[13px] tabular-nums">{formatPhone(contact.phone) || '—'}</span>;
    case 'email':
      return <span className="text-foreground/80 whitespace-nowrap max-w-[220px] truncate block text-[13px]">{formatEmail(contact.email) || '—'}</span>;
    case 'project':
      return <ProjectsList projects={contact.projects} project={contact.project} />;
    case 'source': {
      const syncSource = (contact as any).sync_source as string | null;
      const isLofty = syncSource === 'zapier_lofty' || syncSource === 'lofty_api_sync';
      return (
        <span className="text-foreground/80 whitespace-nowrap text-[12px] inline-flex items-center gap-1.5">
          {contact.source ?? '—'}
          {isLofty && (
            <span className="text-[10px] px-1.5 py-0 rounded bg-primary/10 text-primary font-semibold">Lofty</span>
          )}
        </span>
      );
    }
    case 'pipeline':
      return <InlineStatusCell contact={contact} updateContact={updateContact} />;
    case 'tags':
      return <InlineTagsCell contact={contact} tagLibrary={tagLibrary} updateContact={updateContact} />;
    case 'assigned_to':
      return <InlineAgentCell contact={contact} updateContact={updateContact} />;
    case 'last_touch_at':
      return <LastTouchCell contact={contact} />;
    case 'created_at':
      return <span className="text-foreground/80 whitespace-nowrap text-[12px]">{format(new Date(contact.created_at), 'MMM d, yyyy')}</span>;
    case 'campaign_source':
      return <span className="text-foreground/80 whitespace-nowrap text-[12px] truncate max-w-[160px] block">{(contact as any).campaign_source ?? '—'}</span>;
    case 'city_pref':
      return (contact as any).city_pref
        ? <Badge variant="outline" className="border-0 text-[11px] font-semibold whitespace-nowrap px-2 py-0.5" style={{ background: 'hsl(210 62% 46% / 0.12)', color: 'hsl(210 62% 46%)' }}>{(contact as any).city_pref}</Badge>
        : <span className="text-muted-foreground text-sm">—</span>;
    case 'property_type_pref':
      return <span className="text-foreground/80 whitespace-nowrap text-[12px] capitalize">{(contact as any).property_type_pref ?? '—'}</span>;
    case 'is_pre_approved':
      return (contact as any).is_pre_approved
        ? <Badge variant="outline" className="border-0 text-[11px] font-semibold px-2 py-0.5" style={{ background: 'hsl(142 71% 40% / 0.12)', color: 'hsl(142 71% 40%)' }}>Yes</Badge>
        : <span className="text-muted-foreground text-sm">No</span>;
    case 'quick_actions':
      return (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {contact.phone && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a href={`tel:${contact.phone}`} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted/60 transition-colors">
                  <Phone className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Call {formatPhone(contact.phone)}</TooltipContent>
            </Tooltip>
          )}
          {contact.phone && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSendSms(contact)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted/60 transition-colors"
                >
                  <MessageSquare className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Text {formatPhone(contact.phone)}</TooltipContent>
            </Tooltip>
          )}
          {contact.email && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSendEmail(contact); }}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted/60 transition-colors"
                >
                  <Mail className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Email {formatEmail(contact.email)}</TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    default:
      return <span>—</span>;
  }
}

/* ── Mobile Lead Card ── */
function LeadCard({ contact, onClick }: { contact: CrmContact; onClick: () => void }) {
  const score = (contact as any).lead_score as number | null | undefined;
  const hasScore = typeof score === 'number';

  // Score tier — drives the tinted chip color (cold / warm / hot)
  const tier: 'hot' | 'warm' | 'cold' | 'none' = !hasScore
    ? 'none'
    : score! >= 70
      ? 'hot'
      : score! >= 40
        ? 'warm'
        : 'cold';

  // Lead type label (Buyer / Seller / Investor / Renter), falls back to contact_type
  const rawType = (contact as any).lead_type as string | null | undefined;
  const typeLabel = rawType
    ? rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase()
    : (contact.contact_type === 'realtor' ? 'Realtor'
      : contact.contact_type === 'past_client' ? 'Client'
      : 'Buyer');

  const sourceText = contact.source ?? '';
  const assignee = (contact as any).assigned_to as string | null | undefined;
  const relTime = contact.last_touch_at
    ? formatDistanceToNow(new Date(contact.last_touch_at), { addSuffix: false })
    : contact.created_at
      ? formatDistanceToNow(new Date(contact.created_at), { addSuffix: false })
      : '';
  // Compress " ago" formatting like the reference ("3 hrs ago", "2 days ago")
  const timeShort = relTime
    .replace('about ', '')
    .replace(/ minutes?/, ' min')
    .replace(/ hours?/, ' hrs')
    .replace(/ months?/, ' mo')
    .replace(/ years?/, ' yr');
  const timeLabel = timeShort ? `${timeShort} ago` : '';

  return (
    <button onClick={onClick} className="m-row focus:outline-none">
      <div className="m-row__main">
        {/* Row 1: Name */}
        <div className="m-row__title">
          {formatContactName(contact.first_name, contact.last_name) || 'Unnamed lead'}
        </div>
        {/* Row 2: Lead type */}
        <div className="m-row__meta">{typeLabel}</div>
        {/* Row 3: Source */}
        {sourceText && <div className="m-row__meta">{sourceText}</div>}
        {/* Row 4: Assignee (matches reference's "Uzair Muhammad" line) */}
        {assignee && <div className="m-row__meta-weak">{assignee}</div>}
      </div>

      <div className="m-row__side">
        <span
          aria-label={hasScore ? `Lead score ${score} out of 100` : 'No score yet'}
          className="m-score"
          data-tier={tier}
        >
          {hasScore ? score : '—'}
        </span>
        {timeLabel && <span className="m-row__time">{timeLabel}</span>}
      </div>
    </button>
  );
}

/* ── Pagination Bar ── */
function PaginationBar({
  page, pageSize, totalCount, isFetching, onPageChange, onPageSizeChange, isMobile,
}: {
  page: number; pageSize: number; totalCount: number; isFetching: boolean;
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void; isMobile: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  const pages = useMemo(() => {
    const result: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) result.push(i);
    return result;
  }, [page, totalPages]);

  if (totalCount === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 px-1">
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground">
          {from.toLocaleString()}–{to.toLocaleString()} of {totalCount.toLocaleString()}
        </span>
        {!isMobile && (
          <Select value={String(pageSize)} onValueChange={v => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-7 w-[72px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1 || isFetching} onClick={() => onPageChange(1)}><ChevronsLeft className="w-3.5 h-3.5" /></Button>
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1 || isFetching} onClick={() => onPageChange(page - 1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
        {!isMobile && pages.map(p => (
          <Button key={p} variant={p === page ? 'default' : 'outline'} size="icon"
            className={`h-7 w-7 text-[11px] ${p === page ? 'bg-primary text-primary-foreground' : ''}`}
            disabled={isFetching} onClick={() => onPageChange(p)}>{p}</Button>
        ))}
        {isMobile && <span className="text-[11px] text-muted-foreground px-2">{page} / {totalPages}</span>}
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages || isFetching} onClick={() => onPageChange(page + 1)}><ChevronRight className="w-3.5 h-3.5" /></Button>
        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages || isFetching} onClick={() => onPageChange(totalPages)}><ChevronsRight className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}

export function LeadsTable({
  contacts, isLoading, isFetching, totalCount,
  selectedIds, onSelectionChange,
  page, pageSize, onPageChange, onPageSizeChange,
  sortKey, sortDir, onSort, visibleColumns, hidePagination = false,
}: LeadsTableProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const prefetchLead = usePrefetchLead();
  const updateContact = useUpdateCrmContact();
  const [smsContact, setSmsContact] = useState<CrmContact | null>(null);
  const [emailContact, setEmailContact] = useState<CrmContact | null>(null);

  const columns = useMemo(() => ALL_COLUMNS.filter(c => visibleColumns.has(c.key)), [visibleColumns]);

  // Persisted, drag-resizable column widths.
  const defaultWidths = useMemo(() => {
    const out: Record<string, number> = {};
    ALL_COLUMNS.forEach(c => { out[c.key] = parseInt(c.width, 10) || 140; });
    return out;
  }, []);
  const { widths, setWidth, resetWidths } = useColumnWidths('crm:leads:colWidths:v1', defaultWidths);

  // Pull from the canonical crm_tags library so this row picker shows EVERY tag
  // in the CRM (not just tags from the 50 contacts on the current page).
  const { data: tagLibRaw = [] } = useCrmTags();
  const tagLibrary = useMemo<TagLibItem[]>(
    () =>
      tagLibRaw
        .map(t => ({ label: t.name, count: t.usage_count ?? 0 }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    [tagLibRaw],
  );

  const allPageIds = contacts.map(c => c.id);
  const allSelected = contacts.length > 0 && contacts.every(c => selectedIds.includes(c.id));

  const toggleAll = () => {
    if (allSelected) onSelectionChange(selectedIds.filter(id => !allPageIds.includes(id)));
    else onSelectionChange([...new Set([...selectedIds, ...allPageIds])]);
  };

  const toggleOne = (id: string) => {
    onSelectionChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  if (isLoading) {
    if (isMobile) {
      // Premium shimmer rows that match the LeadCard rhythm
      return (
        <div className="-mx-3 bg-card border-y border-border">
          <div className="divide-y divide-border/50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-start gap-4">
                <div className="flex-1 space-y-2.5">
                  <div className="crm-skeleton h-4 w-2/3" />
                  <div className="crm-skeleton h-3 w-1/2" />
                  <div className="crm-skeleton h-3 w-3/4" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="crm-skeleton h-7 w-9 rounded-md" />
                  <div className="crm-skeleton h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </div>
    );
  }

  if (totalCount === 0 && contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <Mail className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-foreground text-sm font-medium mb-1.5">No leads here yet</p>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          This is normal for new agents — leads appear here as soon as your admin routes lead sources
          (Presale, Lofty, TikTok, referrals) to you. You can also add a lead manually from the top right.
        </p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="-mx-3">
        {/* Loading shimmer */}
        <div className="h-0.5 w-full overflow-hidden bg-transparent">
          {isFetching && (
            <div className="h-full w-full bg-primary/20 overflow-hidden">
              <div className="h-full bg-primary animate-pulse" style={{ width: '40%' }} />
            </div>
          )}
        </div>

        {/* Edge-to-edge list using the shared mobile system */}
        <div className={`m-list transition-opacity ${isFetching ? 'opacity-80' : ''}`}>
          {contacts.map(contact => (
            <SwipeRow
              key={contact.id}
              hasPhone={!!contact.phone}
              hasEmail={!!contact.email}
              onCall={() => contact.phone && (window.location.href = `tel:${contact.phone}`)}
              onText={() => contact.phone && (window.location.href = `sms:${contact.phone}`)}
              onEmail={() => contact.email && setEmailContact(contact)}
            >
              <div
                onPointerEnter={() => prefetchLead(contact.id)}
                onTouchStart={() => prefetchLead(contact.id)}
              >
                <LeadCard contact={contact} onClick={() => navigate(`/crm/leads/${contact.id}`)} />
              </div>
            </SwipeRow>
          ))}
          {contacts.length === 0 && !isFetching && (
            <div className="px-4 py-12 text-center text-[14px] text-muted-foreground">
              No leads match the current filters.
            </div>
          )}
        </div>

        {!hidePagination && (
          <div className="px-3">
            <PaginationBar page={page} pageSize={pageSize} totalCount={totalCount} isFetching={isFetching}
              onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} isMobile />
          </div>
        )}
        {emailContact && (
          <ComposeEmailDialog
            contact={emailContact}
            open={!!emailContact}
            onOpenChange={(o) => !o && setEmailContact(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="h-0.5 w-full overflow-hidden rounded-full mb-1 bg-transparent">
        {isFetching && (
          <div className="h-full w-full bg-primary/20 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '40%' }} />
          </div>
        )}
      </div>
      <div
        className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${isFetching ? 'opacity-80' : ''}`}
        style={{ minHeight: 46 + pageSize * 56 }}
      >
        <TooltipProvider delayDuration={200}>
          <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: 1400 }}>
            <colgroup>
              <col style={{ width: '40px' }} />
              {columns.map(col => (
                <col key={col.key} style={{ width: `${widths[col.key] ?? parseInt(col.width, 10)}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="w-10 px-3 py-3.5"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                {columns.map(col => (
                  <ResizableHeaderCell
                    key={col.key}
                    col={col}
                    width={widths[col.key] ?? parseInt(col.width, 10)}
                    onResize={(w) => setWidth(col.key, w)}
                    onResetAll={resetWidths}
                    onSort={onSort}
                    SortIcon={SortIcon}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {contacts.map(contact => {
                const isSelected = selectedIds.includes(contact.id);
                return (
                  <tr key={contact.id}
                    style={{ height: 56 }}
                    className={`hover:bg-muted/20 cursor-pointer transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                    onMouseEnter={() => prefetchLead(contact.id)}
                    onClick={() => navigate(`/crm/leads/${contact.id}`)}>
                    <td className="px-3 py-2 align-middle" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(contact.id)} />
                    </td>
                    {columns.map(col => (
                      <td key={col.key} className="px-3 py-2 align-middle overflow-hidden">
                        <CellContent col={col} contact={contact} updateContact={updateContact} tagLibrary={tagLibrary} onSendSms={setSmsContact} onSendEmail={setEmailContact} />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {/* Filler rows to keep stable height on partial pages */}
              {contacts.length < pageSize && Array.from({ length: pageSize - contacts.length }).map((_, i) => (
                <tr key={`pad-${i}`} style={{ height: 56 }} aria-hidden="true">
                  <td colSpan={columns.length + 1} />
                </tr>
              ))}
            </tbody>
          </table>
        </TooltipProvider>
      </div>
      <PaginationBar page={page} pageSize={pageSize} totalCount={totalCount} isFetching={isFetching}
        onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} isMobile={false} />
      {smsContact && (
        <SendTextDialog
          contact={smsContact}
          open={!!smsContact}
          onOpenChange={(o) => !o && setSmsContact(null)}
        />
      )}
      {emailContact && (
        <ComposeEmailDialog
          contact={emailContact}
          open={!!emailContact}
          onOpenChange={(o) => !o && setEmailContact(null)}
        />
      )}
    </div>
  );
}
