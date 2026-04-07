import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, X } from 'lucide-react';
import { useCrmContacts, LEAD_STATUSES, LEAD_SOURCES, AGENTS, PROJECTS } from '@/hooks/useCrmContacts';
import { LeadsTable } from '@/components/crm/leads/LeadsTable';
import { AddLeadDialog } from '@/components/crm/leads/AddLeadDialog';
import { BulkActionsBar } from '@/components/crm/leads/BulkActionsBar';

export default function CrmLeadsPage() {
  const { data: contacts = [], isLoading } = useCrmContacts();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);

  const activeFilters = [
    filterStatus && { label: `Status: ${filterStatus}`, clear: () => setFilterStatus('') },
    filterSource && { label: `Source: ${filterSource}`, clear: () => setFilterSource('') },
    filterProject && { label: `Project: ${filterProject}`, clear: () => setFilterProject('') },
    filterAgent && { label: `Agent: ${filterAgent}`, clear: () => setFilterAgent('') },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  const filtered = useMemo(() => {
    let list = contacts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
          (c.email?.toLowerCase().includes(q)) ||
          (c.phone?.includes(q)) ||
          (c.project?.toLowerCase().includes(q))
      );
    }
    if (filterStatus) list = list.filter((c) => c.status === filterStatus);
    if (filterSource) list = list.filter((c) => c.source === filterSource);
    if (filterProject) list = list.filter((c) => c.project === filterProject);
    if (filterAgent) list = list.filter((c) => c.assigned_to === filterAgent);
    return list;
  }, [contacts, search, filterStatus, filterSource, filterProject, filterAgent]);

  // Reset page when filters change
  const handleFilterChange = (setter: (v: string) => void) => (val: string) => {
    setter(val);
    setPage(1);
  };

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-xl font-bold text-foreground">Leads</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search leads..."
                className="pl-8 h-9 w-52 text-sm"
              />
            </div>

            <Select value={filterStatus} onValueChange={handleFilterChange(setFilterStatus)}>
              <SelectTrigger className="h-9 w-auto text-xs gap-1">
                <span>Status</span>
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterSource} onValueChange={handleFilterChange(setFilterSource)}>
              <SelectTrigger className="h-9 w-auto text-xs gap-1">
                <span>Source</span>
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterProject} onValueChange={handleFilterChange(setFilterProject)}>
              <SelectTrigger className="h-9 w-auto text-xs gap-1">
                <span>Project</span>
              </SelectTrigger>
              <SelectContent>
                {PROJECTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterAgent} onValueChange={handleFilterChange(setFilterAgent)}>
              <SelectTrigger className="h-9 w-auto text-xs gap-1">
                <span>Agent</span>
              </SelectTrigger>
              <SelectContent>
                {AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>

            <Button onClick={() => setShowAdd(true)} size="sm" className="h-9 bg-primary text-primary-foreground gap-1.5">
              <Plus className="w-4 h-4" /> Add Lead
            </Button>
          </div>
        </div>

        {/* Filter pills */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {activeFilters.map((f) => (
              <Badge key={f.label} variant="secondary" className="gap-1 text-xs cursor-pointer pr-1.5" onClick={f.clear}>
                {f.label}
                <X className="w-3 h-3" />
              </Badge>
            ))}
            <button
              onClick={() => { setFilterStatus(''); setFilterSource(''); setFilterProject(''); setFilterAgent(''); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Bulk actions */}
        <BulkActionsBar selectedIds={selectedIds} onClearSelection={() => setSelectedIds([])} />

        {/* Table */}
        <LeadsTable
          contacts={filtered}
          isLoading={isLoading}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          page={page}
          onPageChange={setPage}
        />
      </div>

      <AddLeadDialog open={showAdd} onOpenChange={setShowAdd} />
    </>
  );
}
