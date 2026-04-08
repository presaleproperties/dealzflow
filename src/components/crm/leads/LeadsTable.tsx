import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowUpDown, ArrowUp, ArrowDown, AlertCircle } from 'lucide-react';
import { getMissingFields, formatFieldName } from '@/lib/dataCompleteness';
import { formatContactName } from '@/lib/format';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { LeadStatusBadge } from './LeadStatusBadge';
import { useIsMobile } from '@/hooks/use-mobile';
import type { CrmContact } from '@/hooks/useCrmContacts';

type SortKey = 'name' | 'phone' | 'email' | 'project' | 'source' | 'status' | 'assigned_to' | 'updated_at' | 'created_at' | 'contact_type';
type SortDir = 'asc' | 'desc';

interface LeadsTableProps {
  contacts: CrmContact[];
  isLoading: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  page: number;
  onPageChange: (page: number) => void;
}

const PAGE_SIZE = 25;

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

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email', className: 'hidden lg:table-cell' },
  { key: 'project', label: 'Projects', className: 'hidden lg:table-cell' },
  { key: 'source', label: 'Source' },
  { key: 'status', label: 'Status' },
  { key: 'assigned_to', label: 'Assigned To', className: 'hidden lg:table-cell' },
  { key: 'updated_at', label: 'Last Touch', className: 'hidden xl:table-cell' },
  { key: 'created_at', label: 'Added', className: 'hidden xl:table-cell' },
];

function getSortValue(contact: CrmContact, key: SortKey): string {
  switch (key) {
    case 'name': return formatContactName(contact.first_name, contact.last_name).toLowerCase();
    case 'phone': return contact.phone ?? '';
    case 'email': return contact.email ?? '';
    case 'project': return (contact.projects ?? []).join(',') || contact.project || '';
    case 'source': return contact.source ?? '';
    case 'status': return contact.status ?? '';
    case 'assigned_to': return contact.assigned_to ?? '';
    case 'updated_at': return contact.updated_at;
    case 'created_at': return contact.created_at;
    case 'contact_type': return contact.contact_type ?? 'lead';
  }
}

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
      {/* Projects */}
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

export function LeadsTable({ contacts, isLoading, selectedIds, onSelectionChange, page, onPageChange }: LeadsTableProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...contacts].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      const cmp = va.localeCompare(vb);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [contacts, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const allPageIds = paginated.map((c) => c.id);
  const allSelected = paginated.length > 0 && paginated.every((c) => selectedIds.includes(c.id));

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

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

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground text-sm">No leads yet. Click "Add Lead" to get started.</p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div>
        <div className="space-y-2">
          {paginated.map((contact) => (
            <LeadCard
              key={contact.id}
              contact={contact}
              onClick={() => navigate(`/crm/leads/${contact.id}`)}
            />
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 px-1">
            <span className="text-xs text-muted-foreground">
              {sorted.length} lead{sorted.length !== 1 ? 's' : ''} — page {page}/{totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-8 text-xs min-h-[44px]" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Prev</Button>
              <Button variant="outline" size="sm" className="h-8 text-xs min-h-[44px]" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
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
                  onClick={() => toggleSort(col.key)}
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
            {paginated.map((contact) => (
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
                <td className="px-3 py-2.5 hidden md:table-cell">
                  <ContactTypeBadge type={contact.contact_type} />
                </td>
                <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
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
                </td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{contact.phone ?? '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap max-w-[180px] truncate hidden lg:table-cell">{contact.email ?? '—'}</td>
                <td className="px-3 py-2.5 hidden lg:table-cell">
                  <ProjectsList projects={contact.projects} project={contact.project} />
                </td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{contact.source ?? '—'}</td>
                <td className="px-3 py-2.5"><LeadStatusBadge status={contact.status} /></td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap hidden lg:table-cell">{contact.assigned_to ?? '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap text-xs hidden xl:table-cell">
                  {formatDistanceToNow(new Date(contact.updated_at), { addSuffix: true })}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap text-xs hidden xl:table-cell">
                  {format(new Date(contact.created_at), 'MMM d, yyyy')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 px-1">
          <span className="text-xs text-muted-foreground">
            {sorted.length} lead{sorted.length !== 1 ? 's' : ''} — page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
