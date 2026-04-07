import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { LeadStatusBadge } from './LeadStatusBadge';
import type { CrmContact } from '@/hooks/useCrmContacts';

type SortKey = 'name' | 'phone' | 'email' | 'project' | 'source' | 'status' | 'assigned_to' | 'updated_at' | 'created_at';
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

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'project', label: 'Project' },
  { key: 'source', label: 'Source' },
  { key: 'status', label: 'Status' },
  { key: 'assigned_to', label: 'Assigned To' },
  { key: 'updated_at', label: 'Last Touch', className: 'hidden xl:table-cell' },
  { key: 'created_at', label: 'Added', className: 'hidden xl:table-cell' },
];

function getSortValue(contact: CrmContact, key: SortKey): string {
  switch (key) {
    case 'name': return `${contact.first_name} ${contact.last_name}`.toLowerCase();
    case 'phone': return contact.phone ?? '';
    case 'email': return contact.email ?? '';
    case 'project': return contact.project ?? '';
    case 'source': return contact.source ?? '';
    case 'status': return contact.status ?? '';
    case 'assigned_to': return contact.assigned_to ?? '';
    case 'updated_at': return contact.updated_at;
    case 'created_at': return contact.created_at;
  }
}

export function LeadsTable({ contacts, isLoading, selectedIds, onSelectionChange, page, onPageChange }: LeadsTableProps) {
  const navigate = useNavigate();
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
                <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">
                  {contact.first_name} {contact.last_name}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{contact.phone ?? '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap max-w-[180px] truncate">{contact.email ?? '—'}</td>
                <td className="px-3 py-2.5">
                  {contact.project ? (
                    <Badge variant="outline" className="border-0 text-[11px] font-semibold whitespace-nowrap" style={{ background: 'hsl(39 67% 55% / 0.15)', color: 'hsl(39 67% 55%)' }}>
                      {contact.project}
                    </Badge>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{contact.source ?? '—'}</td>
                <td className="px-3 py-2.5"><LeadStatusBadge status={contact.status} /></td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{contact.assigned_to ?? '—'}</td>
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

      {/* Pagination */}
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
