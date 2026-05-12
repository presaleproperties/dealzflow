import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { toast } from 'sonner';
import { Download, Trash2, Database, Search, ChevronDown, ChevronRight, Archive, Loader2 } from 'lucide-react';
import { useFullZipExport } from '@/hooks/useFullZipExport';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatContactName } from '@/lib/format';
import SourceBackfillSection from './SourceBackfillSection';
import SourceManagerSection from './SourceManagerSection';
import DuplicateReviewSection from './DuplicateReviewSection';
import { format } from 'date-fns';

const EXPORT_FIELDS = [
  'first_name', 'last_name', 'email', 'email_secondary', 'phone', 'phone_secondary',
  'address', 'city', 'province', 'postal_code', 'source', 'status', 'project',
  'projects', 'assigned_to', 'contact_type', 'budget_min', 'budget_max',
  'bedrooms_preferred', 'language', 'lead_type', 'lead_score', 'birthday',
  'notes', 'co_buyer_name', 'co_buyer_phone', 'co_buyer_email', 'co_buyer_birthday',
  'tags', 'lofty_id', 'created_at', 'updated_at', 'last_contact_at', 'next_followup_date',
];

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = Array.isArray(value) ? value.join(', ') : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function DataManagerSection() {
  const { data: contacts = [], isLoading } = useCrmContacts();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const filtered = contacts.filter(c => {
    if (typeFilter !== 'all' && c.contact_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return formatContactName(c.first_name, c.last_name).toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q) ||
        (c.source || '').toLowerCase().includes(q);
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageContacts = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = {
    total: contacts.length,
    leads: contacts.filter(c => c.contact_type === 'lead').length,
    pastClients: contacts.filter(c => c.contact_type === 'past_client').length,
    realtors: contacts.filter(c => c.contact_type === 'realtor').length,
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(c => c.id)));
  };

  const handleExport = () => {
    const data = selectedIds.size > 0 ? contacts.filter(c => selectedIds.has(c.id)) : filtered;
    const csv = [EXPORT_FIELDS.join(','), ...data.map(c => EXPORT_FIELDS.map(f => escapeCsvCell((c as Record<string, unknown>)[f])).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `crm-contacts-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} contacts`);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase.from('crm_contacts').delete().in('id', ids.slice(i, i + 100));
        if (error) throw error;
      }
      toast.success(`Deleted ${ids.length} contacts`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
    } catch (err) { toast.error(`Delete failed: ${(err as Error).message}`); }
    finally { setIsDeleting(false); }
  };

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      for (const table of ['crm_messages', 'crm_notifications', 'crm_showings', 'crm_tasks', 'crm_conversations', 'crm_contacts'] as const) {
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
      }
      toast.success('All contact data cleared');
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
    } catch (err) { toast.error(`Delete failed: ${(err as Error).message}`); }
    finally { setIsDeleting(false); }
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors rounded-t-xl">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Data Manager</span>
              <Badge variant="outline" className="text-[10px] ml-1">{stats.total} contacts</Badge>
              {stats.total > 0 && (
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  {stats.leads} leads · {stats.pastClients} clients · {stats.realtors} realtors
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {stats.total > 0 && !open && (
                <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); handleExport(); }}>
                  <Download className="h-3 w-3 mr-1" />Export
                </Button>
              )}
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-3">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input placeholder="Search…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-7 h-7 text-xs" />
              </div>
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="h-7 w-[110px] text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="lead">Leads</SelectItem>
                  <SelectItem value="past_client">Clients</SelectItem>
                  <SelectItem value="realtor">Realtors</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleExport} className="h-7 text-[11px]">
                <Download className="h-3 w-3 mr-1" />Export {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </Button>
              {selectedIds.size > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="h-7 text-[11px]" disabled={isDeleting}>
                      <Trash2 className="h-3 w-3 mr-1" />Delete ({selectedIds.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selectedIds.size} contacts?</AlertDialogTitle>
                      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteSelected}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] text-destructive hover:text-destructive" disabled={isDeleting || contacts.length === 0}>
                    Clear All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete ALL {contacts.length} contacts?</AlertDialogTitle>
                    <AlertDialogDescription>This removes all contacts, conversations, showings, tasks, and notifications permanently.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Everything</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Table */}
            {isLoading ? (
              <p className="text-xs text-muted-foreground py-2 text-center">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">No contacts found</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border border-border/40 max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 px-2"><Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} /></TableHead>
                        <TableHead className="text-[11px] px-2">Name</TableHead>
                        <TableHead className="text-[11px] px-2">Email</TableHead>
                        <TableHead className="text-[11px] px-2">Source</TableHead>
                        <TableHead className="text-[11px] px-2">Type</TableHead>
                        <TableHead className="text-[11px] px-2">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageContacts.map(c => (
                        <TableRow key={c.id} className={selectedIds.has(c.id) ? 'bg-primary/5' : ''}>
                          <TableCell className="px-2 py-1"><Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} /></TableCell>
                          <TableCell className="text-[11px] px-2 py-1 font-medium">{formatContactName(c.first_name, c.last_name)}</TableCell>
                          <TableCell className="text-[11px] px-2 py-1 text-muted-foreground max-w-[140px] truncate">{c.email || '—'}</TableCell>
                          <TableCell className="text-[11px] px-2 py-1">{c.source || '—'}</TableCell>
                          <TableCell className="px-2 py-1"><Badge variant="outline" className="text-[9px] px-1">{c.contact_type === 'past_client' ? 'Client' : c.contact_type}</Badge></TableCell>
                          <TableCell className="text-[11px] px-2 py-1">{c.status || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-6 text-[11px]" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[11px]" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              </>
            )}

            {/* Source Backfill Tool */}
            <SourceBackfillSection />

            {/* Source Library Manager — merge / rename */}
            <SourceManagerSection />

            {/* Duplicate review */}
            <DuplicateReviewSection />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
