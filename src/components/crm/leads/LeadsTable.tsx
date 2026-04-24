import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Phone, Mail, Check } from 'lucide-react';
import { getMissingFields, formatFieldName } from '@/lib/dataCompleteness';
import { formatContactName, formatPhone, formatEmail } from '@/lib/format';
import { LEAD_TYPE_LABELS, LEAD_STATUSES, AGENTS } from '@/hooks/useCrmContacts';
import { useUpdateCrmContact } from '@/hooks/useCrmLeadDetail';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LeadStatusBadge } from './LeadStatusBadge';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
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

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'New Lead':        { bg: 'hsl(210 62% 46% / 0.12)', color: 'hsl(210 62% 46%)' },
  'Contacted':       { bg: 'hsl(210 62% 46% / 0.10)', color: 'hsl(210 62% 56%)' },
  'Nurturing':       { bg: 'hsl(39 67% 55% / 0.12)',  color: 'hsl(39 67% 55%)' },
  'Hot / Engaged':   { bg: 'hsl(0 84% 60% / 0.12)',   color: 'hsl(0 84% 60%)' },
  'Showing Booked':  { bg: 'hsl(142 71% 45% / 0.12)', color: 'hsl(142 71% 45%)' },
  'Offer Made':      { bg: 'hsl(270 60% 55% / 0.12)', color: 'hsl(270 60% 55%)' },
  'Closed':          { bg: 'hsl(142 71% 35% / 0.12)', color: 'hsl(142 71% 35%)' },
  'Lost / Cold':     { bg: 'hsl(0 60% 55% / 0.10)',   color: 'hsl(0 60% 55%)' },
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
  if (!tags || tags.length === 0) return <span className="text-muted-foreground text-sm">—</span>;
  const shown = tags.slice(0, 2);
  const extra = tags.length - 2;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map((tag, i) => {
        const c = TAG_COLORS[i % TAG_COLORS.length];
        return (
          <Badge key={tag} variant="outline" className="border-0 text-[11px] font-semibold whitespace-nowrap px-2 py-0.5" style={{ background: c.bg, color: c.color }}>
            {tag}
          </Badge>
        );
      })}
      {extra > 0 && <span className="text-[11px] text-muted-foreground font-medium">+{extra}</span>}
    </div>
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
        <Badge key={p} variant="outline" className="border-0 text-[11px] font-semibold whitespace-nowrap px-2 py-0.5" style={{ background: 'hsl(39 67% 55% / 0.15)', color: 'hsl(39 67% 55%)' }}>
          {p}
        </Badge>
      ))}
      {extra > 0 && <span className="text-[11px] text-muted-foreground font-medium">+{extra}</span>}
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

/* ── Inline Status Editor ── */
function InlineStatusCell({ contact, updateContact }: { contact: CrmContact; updateContact: ReturnType<typeof useUpdateCrmContact> }) {
  const sc = STATUS_COLORS[contact.status ?? 'New Lead'] ?? STATUS_COLORS['New Lead'];
  return (
    <div onClick={e => e.stopPropagation()}>
      <Select
        value={contact.status ?? 'New Lead'}
        onValueChange={v => {
          updateContact.mutate({ id: contact.id, updates: { status: v, status_changed_at: new Date().toISOString() }, oldValues: { status: contact.status } });
          toast.success(`Status → ${v}`);
        }}
      >
        <SelectTrigger className="h-8 border-0 bg-transparent p-0 text-[12px] font-semibold shadow-none hover:bg-muted/40 rounded-md px-2 w-auto min-w-0 gap-1" style={{ color: sc.color }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sc.color }} />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          {LEAD_STATUSES.map(s => {
            const c = STATUS_COLORS[s] ?? STATUS_COLORS['New Lead'];
            return (
              <SelectItem key={s} value={s} className="text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                  {s}
                  {s === contact.status && <Check className="w-3 h-3 text-primary ml-1" />}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ── Inline Agent Editor ── */
function InlineAgentCell({ contact, updateContact }: { contact: CrmContact; updateContact: ReturnType<typeof useUpdateCrmContact> }) {
  return (
    <div onClick={e => e.stopPropagation()}>
      <Select
        value={contact.assigned_to ?? ''}
        onValueChange={v => {
          updateContact.mutate({ id: contact.id, updates: { assigned_to: v }, oldValues: { assigned_to: contact.assigned_to } });
          toast.success(`Assigned → ${v}`);
        }}
      >
        <SelectTrigger className="h-8 border-0 bg-transparent p-0 text-[12px] shadow-none hover:bg-muted/40 rounded-md px-2 w-auto min-w-0 text-muted-foreground">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          {AGENTS.map(a => (
            <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ── Last Touch with color coding ── */
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
function CellContent({ col, contact, updateContact }: { col: ColumnDef; contact: CrmContact; updateContact: ReturnType<typeof useUpdateCrmContact> }) {
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
          <span className="text-foreground/80">{formatDistanceToNow(new Date(contact.created_at), { addSuffix: true })}</span>
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
      return <TagsList tags={contact.tags} />;
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
          {contact.email && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a href={`/crm/email?to=${encodeURIComponent(contact.email)}`} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted/60 transition-colors">
                  <Mail className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </a>
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
  const borderColor = STATUS_BORDER_COLORS[contact.status ?? 'New Lead'] ?? 'hsl(210 62% 46%)';
  const typeStyle = CONTACT_TYPE_STYLES[contact.contact_type] ?? CONTACT_TYPE_STYLES.lead;
  return (
    <button onClick={onClick}
      className="w-full text-left bg-card rounded-xl border border-border p-3.5 shadow-sm transition-colors active:bg-muted/40"
      style={{ borderLeft: `3px solid ${borderColor}` }}>
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: typeStyle.bg, color: typeStyle.color }}>
          {contact.first_name?.[0]?.toUpperCase()}{contact.last_name?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[15px] font-semibold text-foreground leading-snug truncate min-w-0 flex-1">
              {formatContactName(contact.first_name, contact.last_name)}
            </p>
            <div className="shrink-0">
              <LeadStatusBadge status={contact.status} />
            </div>
          </div>
          {contact.phone && <p className="text-[13px] text-muted-foreground mt-1 tabular-nums">{formatPhone(contact.phone)}</p>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap min-w-0">
            {contact.source && <Badge variant="secondary" className="text-[11px] px-2 py-0.5 max-w-[180px] truncate">{contact.source}</Badge>}
            {contact.assigned_to && <span className="text-[12px] text-muted-foreground truncate">{contact.assigned_to}</span>}
          </div>
        </div>
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
  sortKey, sortDir, onSort, visibleColumns,
}: LeadsTableProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const updateContact = useUpdateCrmContact();

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
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </div>
    );
  }

  if (totalCount === 0 && contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <Mail className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">No leads found. Try adjusting your filters or add a new lead.</p>
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
      <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${isFetching ? 'opacity-80' : ''}`}>
        <TooltipProvider delayDuration={200}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="w-10 px-3 py-3.5"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                {columns.map(col => (
                  <th key={col.key}
                    className="px-3 py-3.5 text-left text-[12px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => col.sortKey && onSort(col.sortKey)}>
                    <span className="inline-flex items-center gap-1.5">
                      {col.label}
                      {col.sortKey && <SortIcon col={col.sortKey} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {contacts.map(contact => {
                const isSelected = selectedIds.includes(contact.id);
                return (
                  <tr key={contact.id}
                    className={`hover:bg-muted/20 cursor-pointer transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                    onClick={() => navigate(`/crm/leads/${contact.id}`)}>
                    <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(contact.id)} />
                    </td>
                    {columns.map(col => (
                      <td key={col.key} className="px-3 py-3.5">
                        <CellContent col={col} contact={contact} updateContact={updateContact} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TooltipProvider>
      </div>
      <PaginationBar page={page} pageSize={pageSize} totalCount={totalCount} isFetching={isFetching}
        onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} isMobile={false} />
    </div>
  );
}
