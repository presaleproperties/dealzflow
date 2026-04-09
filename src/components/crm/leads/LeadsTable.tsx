import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Phone, Mail } from 'lucide-react';
import { getMissingFields, formatFieldName } from '@/lib/dataCompleteness';
import { formatContactName } from '@/lib/format';
import { LEAD_TYPE_LABELS } from '@/hooks/useCrmContacts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LeadStatusBadge } from './LeadStatusBadge';
import { useIsMobile } from '@/hooks/use-mobile';
import type { CrmContact } from '@/hooks/useCrmContacts';
import type { SortKey, SortDir } from '@/hooks/usePaginatedCrmContacts';

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


function TagsList({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = tags.slice(0, 2);
  const extra = tags.length - 2;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map((tag, i) => {
        const c = TAG_COLORS[i % TAG_COLORS.length];
        return (
          <Badge key={tag} variant="outline" className="border-0 text-[10px] font-semibold whitespace-nowrap" style={{ background: c.bg, color: c.color }}>
            {tag}
          </Badge>
        );
      })}
      {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
    </div>
  );
}

function ProjectsList({ projects, project }: { projects?: string[]; project?: string | null }) {
  const all = projects && projects.length > 0 ? projects : project ? [project] : [];
  if (all.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = all.slice(0, 2);
  const extra = all.length - 2;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map(p => (
        <Badge key={p} variant="outline" className="border-0 text-[10px] font-semibold whitespace-nowrap" style={{ background: 'hsl(39 67% 55% / 0.15)', color: 'hsl(39 67% 55%)' }}>
          {p}
        </Badge>
      ))}
      {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra} more</span>}
    </div>
  );
}

type ColumnDef = { key: string; sortKey?: SortKey; label: string };

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'name', sortKey: 'name', label: 'Name' },
  { key: 'contactInfo', label: 'Contact Info' },
  { key: 'phone', sortKey: 'phone', label: 'Phone' },
  { key: 'email', sortKey: 'email', label: 'Email' },
  { key: 'reg', sortKey: 'created_at', label: 'Reg' },
  { key: 'project', sortKey: 'project', label: 'Projects' },
  { key: 'source', sortKey: 'source', label: 'Source' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'tags', label: 'Tags' },
  { key: 'assigned_to', sortKey: 'assigned_to', label: 'Agent' },
  { key: 'last_touch_at', sortKey: 'last_touch_at', label: 'Last Touch' },
  { key: 'created_at', sortKey: 'created_at', label: 'Added' },
  { key: 'campaign_source', label: 'Campaign' },
  { key: 'city_pref', label: 'City Pref' },
  { key: 'property_type_pref', label: 'Prop Type' },
  { key: 'is_pre_approved', label: 'Pre-Approved' },
  { key: 'quick_actions', label: 'Actions' },
];

/* ── Last Touch with color coding ── */
function LastTouchCell({ contact }: { contact: CrmContact }) {
  if (!contact.last_touch_at) {
    return (
      <div className="flex flex-col">
        <span className="text-muted-foreground italic text-xs">No activity</span>
        <span className="text-[10px] text-destructive font-medium">Take Action</span>
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
            <span className="text-xs font-medium" style={{ color }}>
              {formatDistanceToNow(new Date(contact.last_touch_at), { addSuffix: true })}
            </span>
            {days >= 14 && <span className="text-[10px] text-destructive font-medium">Take Action</span>}
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
function CellContent({ col, contact }: { col: ColumnDef; contact: CrmContact }) {
  switch (col.key) {
    case 'name': {
      const leadType = (contact as any).lead_type as string | null;
      return (
        <div className="flex flex-col">
          <span className="font-medium text-foreground whitespace-nowrap inline-flex items-center gap-1.5">
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
          <span className="text-[10px] text-muted-foreground mt-0.5">
            {leadType ? (LEAD_TYPE_LABELS[leadType] ?? leadType) : (CONTACT_TYPE_STYLES[contact.contact_type] ?? CONTACT_TYPE_STYLES.lead).label}
          </span>
        </div>
      );
    }
    case 'contactInfo':
      return (
        <div className="flex flex-col text-xs text-muted-foreground">
          <span className="truncate max-w-[180px]">{contact.email ?? '—'}</span>
          <span>{contact.phone ?? '—'}</span>
        </div>
      );
    case 'reg':
      return (
        <div className="flex flex-col text-xs">
          <span className="text-muted-foreground">{formatDistanceToNow(new Date(contact.created_at), { addSuffix: true })}</span>
          <span className="text-[10px] text-muted-foreground/70">{contact.source ?? '—'}</span>
        </div>
      );
    case 'phone':
      return <span className="text-muted-foreground whitespace-nowrap">{contact.phone ?? '—'}</span>;
    case 'email':
      return <span className="text-muted-foreground whitespace-nowrap max-w-[180px] truncate block">{contact.email ?? '—'}</span>;
    case 'project':
      return <ProjectsList projects={contact.projects} project={contact.project} />;
    case 'source': {
      const syncSource = (contact as any).sync_source as string | null;
      const isLofty = syncSource === 'zapier_lofty' || syncSource === 'lofty_api_sync';
      return (
        <span className="text-muted-foreground whitespace-nowrap inline-flex items-center gap-1">
          {contact.source ?? '—'}
          {isLofty && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[10px] px-1 py-0 rounded bg-primary/10 text-primary font-medium">Lofty</span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Synced from Lofty{(contact as any).lofty_synced_at ? ` on ${new Date((contact as any).lofty_synced_at).toLocaleString()}` : ''}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </span>
      );
    }
    case 'pipeline': {
      const lt = (contact as any).lead_type as string | null;
      const label = lt ? (LEAD_TYPE_LABELS[lt] ?? lt) : '—';
      return <Badge variant="outline" className="border-0 text-[11px] font-semibold whitespace-nowrap bg-muted/60 text-foreground">{label}</Badge>;
    }
    case 'tags':
      return <TagsList tags={contact.tags} />;
    case 'assigned_to':
      return <span className="text-muted-foreground whitespace-nowrap text-xs">{contact.assigned_to ?? '—'}</span>;
    case 'last_touch_at':
      return <LastTouchCell contact={contact} />;
    case 'created_at':
      return <span className="text-muted-foreground whitespace-nowrap text-xs">{format(new Date(contact.created_at), 'MMM d, yyyy')}</span>;
    case 'campaign_source':
      return <span className="text-muted-foreground whitespace-nowrap text-xs truncate max-w-[140px] block">{(contact as any).campaign_source ?? '—'}</span>;
    case 'city_pref':
      return (contact as any).city_pref
        ? <Badge variant="outline" className="border-0 text-[10px] font-semibold whitespace-nowrap" style={{ background: 'hsl(210 62% 46% / 0.12)', color: 'hsl(210 62% 46%)' }}>{(contact as any).city_pref}</Badge>
        : <span className="text-muted-foreground">—</span>;
    case 'property_type_pref':
      return <span className="text-muted-foreground whitespace-nowrap text-xs capitalize">{(contact as any).property_type_pref ?? '—'}</span>;
    case 'is_pre_approved':
      return (contact as any).is_pre_approved
        ? <Badge variant="outline" className="border-0 text-[10px] font-semibold" style={{ background: 'hsl(142 71% 40% / 0.12)', color: 'hsl(142 71% 40%)' }}>Yes</Badge>
        : <span className="text-muted-foreground text-xs">No</span>;
    case 'quick_actions':
      return (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {contact.phone && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a href={`tel:${contact.phone}`} className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted/60 transition-colors">
                  <Phone className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Call</TooltipContent>
            </Tooltip>
          )}
          {contact.email && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a href={`/crm/email?to=${encodeURIComponent(contact.email)}`} className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted/60 transition-colors">
                  <Mail className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Email</TooltipContent>
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
  const borderColor = STATUS_BORDER_COLORS[contact.status ?? 'New Lead'] ?? 'hsl(210 62% 46%)';
  return (
    <button onClick={onClick}
      className="w-full text-left bg-card rounded-[10px] border border-border p-3 shadow-sm transition-colors active:bg-muted/40"
      style={{ borderLeft: `3px solid ${borderColor}` }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-semibold text-foreground leading-snug truncate">
          {formatContactName(contact.first_name, contact.last_name)}
        </p>
        <LeadStatusBadge status={contact.status} />
      </div>
      {contact.phone && <p className="text-sm text-muted-foreground mt-1">{contact.phone}</p>}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {contact.source && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{contact.source}</Badge>}
        {contact.assigned_to && <span className="text-[12px] text-muted-foreground">{contact.assigned_to}</span>}
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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 px-1">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          Showing {from.toLocaleString()}–{to.toLocaleString()} of {totalCount.toLocaleString()} leads
        </span>
        {!isMobile && (
          <Select value={String(pageSize)} onValueChange={v => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
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
            className={`h-7 w-7 text-xs ${p === page ? 'bg-primary text-primary-foreground' : ''}`}
            disabled={isFetching} onClick={() => onPageChange(p)}>{p}</Button>
        ))}
        {isMobile && <span className="text-xs text-muted-foreground px-2">{page} / {totalPages}</span>}
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
  sortKey, sortDir, onSort, visibleColumns,
}: LeadsTableProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const columns = useMemo(() => ALL_COLUMNS.filter(c => visibleColumns.has(c.key)), [visibleColumns]);

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
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    );
  }

  if (totalCount === 0 && contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground text-sm">No leads found. Try adjusting your filters or click "Add Lead" to get started.</p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div>
        {isFetching && (
          <div className="h-0.5 w-full bg-primary/20 overflow-hidden rounded-full mb-2">
            <div className="h-full w-1/3 bg-primary rounded-full animate-pulse" />
          </div>
        )}
        <div className="space-y-2">
          {contacts.map(contact => (
            <LeadCard key={contact.id} contact={contact} onClick={() => navigate(`/crm/leads/${contact.id}`)} />
          ))}
        </div>
        <PaginationBar page={page} pageSize={pageSize} totalCount={totalCount} isFetching={isFetching}
          onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} isMobile />
      </div>
    );
  }

  return (
    <div>
      {isFetching && (
        <div className="h-0.5 w-full bg-primary/20 overflow-hidden rounded-full mb-1">
          <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '40%' }} />
        </div>
      )}
      <div className={`overflow-x-auto rounded-xl border border-border bg-card transition-opacity ${isFetching ? 'opacity-80' : ''}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="w-10 px-3 py-2.5"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
              {columns.map(col => (
                <th key={col.key}
                  className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => col.sortKey && onSort(col.sortKey)}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortKey && <SortIcon col={col.sortKey} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.map(contact => (
              <tr key={contact.id}
                className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => navigate(`/crm/leads/${contact.id}`)}>
                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                  <Checkbox checked={selectedIds.includes(contact.id)} onCheckedChange={() => toggleOne(contact.id)} />
                </td>
                {columns.map(col => (
                  <td key={col.key} className="px-3 py-2.5"><CellContent col={col} contact={contact} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationBar page={page} pageSize={pageSize} totalCount={totalCount} isFetching={isFetching}
        onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} isMobile={false} />
    </div>
  );
}
