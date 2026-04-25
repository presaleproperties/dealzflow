import { useMemo, useState } from 'react';
import { useCrmSources } from '@/hooks/useCrmSources';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Layers, Merge, Pencil, Search } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export default function SourceManagerSection() {
  const { data: sources, isLoading } = useCrmSources();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [renameOpen, setRenameOpen] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const list = sources ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(s => s.name.toLowerCase().includes(q));
  }, [sources, search]);

  const toggle = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const openMerge = () => {
    if (selected.size < 2) {
      toast.error('Select at least 2 sources to merge');
      return;
    }
    // Default target = the most-used selected source
    const sortedSelected = (sources ?? [])
      .filter(s => selected.has(s.name))
      .sort((a, b) => b.usage_count - a.usage_count);
    setMergeTarget(sortedSelected[0]?.name ?? '');
    setMergeOpen(true);
  };

  const runMerge = async () => {
    if (!mergeTarget.trim()) {
      toast.error('Destination name is required');
      return;
    }
    setBusy(true);
    const fromNames = Array.from(selected);
    const { data, error } = await supabase.rpc('merge_crm_sources', {
      _from_names: fromNames,
      _to_name: mergeTarget.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const moved = (data as any)?.moved_contacts ?? 0;
    toast.success(`Merged ${fromNames.length} sources → "${mergeTarget.trim()}" (${moved} leads updated)`);
    setSelected(new Set());
    setMergeOpen(false);
    queryClient.invalidateQueries({ queryKey: ['crm-sources'] });
  };

  const runRename = async () => {
    if (!renameOpen || !renameValue.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('rename_crm_source', {
      _from_name: renameOpen,
      _to_name: renameValue.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const moved = (data as any)?.moved_contacts ?? 0;
    toast.success(`Renamed to "${renameValue.trim()}" (${moved} leads updated)`);
    setRenameOpen(null);
    queryClient.invalidateQueries({ queryKey: ['crm-sources'] });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <CardTitle>Source Library Manager</CardTitle>
        </div>
        <CardDescription>
          Merge duplicate sources (e.g. "Facebook Ad" + "Facebook Ads") or rename them. Changes apply to every lead instantly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search sources…"
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{selected.size} selected</Badge>
            <Button size="sm" onClick={openMerge} disabled={selected.size < 2}>
              <Merge className="h-4 w-4 mr-1" /> Merge selected
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="border rounded-md divide-y max-h-[480px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground p-6 text-center">No sources match.</div>
            ) : filtered.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 hover:bg-muted/40">
                <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                  <Checkbox checked={selected.has(s.name)} onCheckedChange={() => toggle(s.name)} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.usage_count} lead{s.usage_count === 1 ? '' : 's'}</div>
                  </div>
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setRenameOpen(s.name); setRenameValue(s.name); }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Merge dialog */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge sources</DialogTitle>
            <DialogDescription>
              All selected sources will be replaced by the destination name. This rewrites the source on every lead and removes the duplicates from the library.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium mb-1">Merging from:</div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(selected).map(n => <Badge key={n} variant="secondary">{n}</Badge>)}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Into (destination name):</div>
              <Input value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMergeOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={runMerge} disabled={busy}>{busy ? 'Merging…' : 'Merge'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameOpen} onOpenChange={(o) => !o && setRenameOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename source</DialogTitle>
            <DialogDescription>
              Renaming "{renameOpen}" updates every lead currently using it. If the new name already exists, the two will be merged.
            </DialogDescription>
          </DialogHeader>
          <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(null)} disabled={busy}>Cancel</Button>
            <Button onClick={runRename} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
