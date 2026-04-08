import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { getMissingFields, formatFieldName } from '@/lib/dataCompleteness';
import { formatContactName } from '@/lib/format';
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

function ContactTypeBadge({ type }: { type: string }) {
  const style = CONTACT_TYPE_STYLES[type] ?? CONTACT_TYPE_STYLES.lead;
  return (
    <Badge variant="outline" className="border-0 text-[10px] font-semibold px-1.5 py-0" style={{ background: style.bg, color: style.color }}>
      {style.label}
    </Badge>
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

// Map display column keys to sort keys
const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email', className: 'hidden lg:table-cell' },
  { key: 'project', label: 'Projects', className: 'hidden lg:table-cell' },
  { key: 'source', label: 'Source' },
  { key: 'status', label: 'Status' },
  { key: 'assigned_to', label: 'Assigned To', className: 'hidden lg:table-cell' },
  { key: 'last_touch_at', label: 'Last Touch', className: 'hidden xl:table-cell' },
  { key: 'created_at', label: 'Added', className: 'hidden xl:table-cell' },
];

/* ── Mobile Lead Card ── */
function LeadCard({ contact, onClick }: { contact: CrmContact; onClick: () => void }) {
  const borderColor = STATUS_BORDER_COLORS[contact.status ?? 'New Lead'] ?? 'hsl(210 62% 46%)';

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card rounded-[10px] border border-border p-3 shadow-sm transition-colors active:bg-muted/40"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ContactTypeBadge type={contact.contact_type} />
          <p className="text-base font-semibold text-foreground leading-snug truncate inline-flex items-center gap-1.5">
            {formatContactName(contact.first_name, contact.last_name)}
            {contact.contact_type === 'past_client' && getMissingFields(contact).length > 0 && (
              <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#F59E0B' }} />
            )}
          </p>
        </div>
        <LeadStatusBadge status={contact.status} />
      </div>
      {contact.phone && (
        <p className="text-sm text-muted-foreground mt-1">{contact.phone}</p>
      )}
      {((contact.projects ?? []).length > 0 || contact.project) && (
        <div className="mt-1">
          <ProjectsList projects={contact.projects} project={contact.project} />
        </div>
      )}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {contact.source && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{contact.source}</Badge>
        )}
        {contact.assigned_to && (
          <span className="text-[12px] text-muted-foreground">{contact.assigned_to}</span>
        )}
      </div>
    </button>
  );
}

/* ── Pagination Bar ── */
function PaginationBar({
  page, pageSize, totalCount, isFetching,
  onPageChange, onPageSizeChange, isMobile,
}: {
  page: number; pageSize: number; totalCount: number; isFetching: boolean;
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void; isMobile: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  // Generate page numbers to show: current ± 2
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
            <SelectTrigger className="h-7 w-[80px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline" size="icon"
          className="h-7 w-7"
          disabled={page <= 1 || isFetching}
          onClick={() => onPageChange(1)}
          title="First page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline" size="icon"
          className="h-7 w-7"
          disabled={page <= 1 || isFetching}
          onClick={() => onPageChange(page - 1)}
          title="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>

        {!isMobile && pages.map(p => (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="icon"
            className={`h-7 w-7 text-xs ${p === page ? 'bg-primary text-primary-foreground' : ''}`}
            disabled={isFetching}
            onClick={() => onPageChange(p)}
          >
            {p}
          </Button>
        ))}

        {isMobile && (
          <span className="text-xs text-muted-foreground px-2">
            {page} / {totalPages}
          </span>
        )}

        <Button
          variant="outline" size="icon"
          className="h-7 w-7"
          disabled={page >= totalPages || isFetching}
          onClick={() => onPageChange(page + 1)}
          title="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline" size="icon"
          className="h-7 w-7"
          disabled={page >= totalPages || isFetching}
          onClick={() => onPageChange(totalPages)}
          title="Last page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function LeadsTable({
  contacts, isLoading, isFetching, totalCount,
  selectedIds, onSelectionChange,
  page, pageSize, onPageChange, onPageSizeChange,
  sortKey, sortDir, onSort,
}: LeadsTableProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const allPageIds = contacts.map((c) => c.id);
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.includes(c.id));

  const toggleAll = () => {
    if (allSelected) onSelectionChange(selectedIds.filter((id) => !allPageIds.includes(id)));
    else onSelectionChange([...new Set([...selectedIds, ...allPageIds])]);
  };

  const toggleOne = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    );
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
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
        {/* Fetching indicator */}
        {isFetching && (
          <div className="h-0.5 w-full bg-primary/20 overflow-hidden rounded-full mb-2">
            <div className="h-full w-1/3 bg-primary rounded-full animate-[shimmer_1s_ease-in-out_infinite]" style={{ animation: 'shimmer 1s ease-in-out infinite alternate', animationName: 'none' }} />
          </div>
        )}
        <div className="space-y-2">
          {contacts.map((contact) => (
            <LeadCard
              key={contact.id}
              contact={contact}
              onClick={() => navigate(`/crm/leads/${contact.id}`)}
            />
          ))}
        </div>
        <PaginationBar
          page={page} pageSize={pageSize} totalCount={totalCount}
          isFetching={isFetching}
          onPageChange={onPageChange} onPageSizeChange={onPageSizeChange}
          isMobile
        />
      </div>
    );
  }

  return (
    <div>
      {/* Thin loading bar at top when fetching new page */}
      {isFetching && (
        <div className="h-0.5 w-full bg-primary/20 overflow-hidden rounded-full mb-1">
          <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '40%' }} />
        </div>
      )}

      <div className={`overflow-x-auto rounded-xl border border-border bg-card transition-opacity ${isFetching ? 'opacity-80' : ''}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="w-10 px-3 py-2.5">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${col.className ?? ''}`}
                  onClick={() => onSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr
                key={contact.id}
                className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => navigate(`/crm/leads/${contact.id}`)}
              >
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.includes(contact.id)}
                    onCheckedChange={() => toggleOne(contact.id)}
                  />
                </td>
                <td className="px-3 py-2.5">
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
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {(CONTACT_TYPE_STYLES[contact.contact_type] ?? CONTACT_TYPE_STYLES.lead).label}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{contact.phone ?? '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap max-w-[180px] truncate hidden lg:table-cell">{contact.email ?? '—'}</td>
                <td className="px-3 py-2.5 hidden lg:table-cell">
                  <ProjectsList projects={contact.projects} project={contact.project} />
                </td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{contact.source ?? '—'}</td>
                <td className="px-3 py-2.5"><LeadStatusBadge status={contact.status} /></td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap hidden lg:table-cell">{contact.assigned_to ?? '—'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs hidden xl:table-cell">
                  {contact.last_touch_at ? (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span style={{
                            color: (() => {
                              const days = Math.floor((Date.now() - new Date(contact.last_touch_at).getTime()) / 86400000);
                              if (days <= 7) return 'hsl(142 71% 45%)';
                              if (days <= 30) return 'hsl(38 92% 50%)';
                              return 'hsl(0 60% 55%)';
                            })()
                          }}>
                            {formatDistanceToNow(new Date(contact.last_touch_at), { addSuffix: true })}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {format(new Date(contact.last_touch_at), 'MMM d, yyyy h:mm a')}
                          {contact.last_touch_type && ` · ${contact.last_touch_type.replace(/_/g, ' ')}`}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <span className="text-muted-foreground italic">No activity</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap text-xs hidden xl:table-cell">
                  {format(new Date(contact.created_at), 'MMM d, yyyy')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page} pageSize={pageSize} totalCount={totalCount}
        isFetching={isFetching}
        onPageChange={onPageChange} onPageSizeChange={onPageSizeChange}
        isMobile={false}
      />
    </div>
  );
}
