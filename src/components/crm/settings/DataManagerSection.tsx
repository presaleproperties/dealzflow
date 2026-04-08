import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { toast } from 'sonner';
import { Download, Trash2, Database, Users, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
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
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  // Filter contacts
  const filtered = contacts.filter(c => {
    if (typeFilter !== 'all' && c.contact_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.source || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageContacts = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Stats
  const stats = {
    total: contacts.length,
    leads: contacts.filter(c => c.contact_type === 'lead').length,
    pastClients: contacts.filter(c => c.contact_type === 'past_client').length,
    realtors: contacts.filter(c => c.contact_type === 'realtor').length,
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const handleExport = () => {
    const dataToExport = selectedIds.size > 0
      ? contacts.filter(c => selectedIds.has(c.id))
      : filtered;

    const header = EXPORT_FIELDS.join(',');
    const rows = dataToExport.map(c =>
      EXPORT_FIELDS.map(f => escapeCsvCell((c as Record<string, unknown>)[f])).join(',')
    );

    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-contacts-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${dataToExport.length} contacts`);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      // Delete in batches of 100
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        const { error } = await supabase.from('crm_contacts').delete().in('id', batch);
        if (error) throw error;
      }
      toast.success(`Deleted ${ids.length} contacts`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
    } catch (err) {
      toast.error(`Delete failed: ${(err as Error).message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      // Delete related data first, then contacts
      const tables = ['crm_messages', 'crm_notifications', 'crm_showings', 'crm_tasks', 'crm_conversations', 'crm_contacts'] as const;
      for (const table of tables) {
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
      }
      toast.success('All contact data cleared');
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
    } catch (err) {
      toast.error(`Delete failed: ${(err as Error).message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Data Manager</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Users className="h-3 w-3 mr-1" />
              {stats.total} total
            </Badge>
          </div>
        </div>
        <CardDescription>View, export, and manage all imported CRM contacts</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats row */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/30 border border-border/30">
            <span className="text-xs text-muted-foreground">Leads:</span>
            <span className="text-sm font-semibold text-foreground">{stats.leads}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/30 border border-border/30">
            <span className="text-xs text-muted-foreground">Clients:</span>
            <span className="text-sm font-semibold text-foreground">{stats.pastClients}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/30 border border-border/30">
            <span className="text-xs text-muted-foreground">Realtors:</span>
            <span className="text-sm font-semibold text-foreground">{stats.realtors}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="lead">Leads</SelectItem>
              <SelectItem value="past_client">Clients</SelectItem>
              <SelectItem value="realtor">Realtors</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport} className="h-8 text-xs">
            <Download className="h-3.5 w-3.5 mr-1" />
            Export {selectedIds.size > 0 ? `(${selectedIds.size})` : `(${filtered.length})`}
          </Button>
          {selectedIds.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="h-8 text-xs" disabled={isDeleting}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete ({selectedIds.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedIds.size} contacts?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
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
              <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" disabled={isDeleting || contacts.length === 0}>
                Clear All Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete ALL {contacts.length} contacts?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove all contacts and their related conversations, showings, tasks, and notifications. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading contacts…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No contacts found</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-border/40">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === filtered.length && filtered.length > 0}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Phone</TableHead>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageContacts.map(c => (
                    <TableRow key={c.id} className={selectedIds.has(c.id) ? 'bg-primary/5' : ''}>
                      <TableCell>
                        <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                      </TableCell>
                      <TableCell className="text-xs font-medium">{c.first_name} {c.last_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{c.email || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.phone || '—'}</TableCell>
                      <TableCell className="text-xs">{c.source || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {c.contact_type === 'past_client' ? 'Client' : c.contact_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{c.status || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.created_at ? format(new Date(c.created_at), 'MMM d, yyyy') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
