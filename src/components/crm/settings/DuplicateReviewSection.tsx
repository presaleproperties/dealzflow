import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Users, Merge, ExternalLink, RefreshCw } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface DupContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string | null;
  assigned_to: string | null;
  created_at: string;
  last_touch_at: string | null;
  tags: string[] | null;
  projects: string[] | null;
  lead_type: string | null;
}

interface DupGroup {
  match_key: string;
  match_type: string;
  dup_count: number;
  contacts: DupContact[];
}

function fullName(c: DupContact) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)';
}

export default function DuplicateReviewSection() {
  const queryClient = useQueryClient();
  const [activeGroup, setActiveGroup] = useState<DupGroup | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<{ groups: number; records: number; extra: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchStats = async () => {
    setStatsLoading(true);
    const { data, error } = await supabase.rpc('count_potential_duplicates');
    setStatsLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      setStats({ groups: 0, records: 0, extra: 0 });
      return;
    }
    setStats({
      groups: Number(row.groups_count ?? 0),
      records: Number(row.records_count ?? 0),
      extra: Number(row.extra_records ?? 0),
    });
    toast.success('Duplicate stats refreshed');
  };

  const { data: groups, isLoading } = useQuery({
    queryKey: ['potential-duplicates'],
    queryFn: async (): Promise<DupGroup[]> => {
      const { data, error } = await supabase.rpc('list_potential_duplicates', { _limit: 100 });
      if (error) throw error;
      return (data ?? []) as unknown as DupGroup[];
    },
    staleTime: 30_000,
  });

  const openMerge = (group: DupGroup) => {
    setActiveGroup(group);
    // Default winner = the contact with most-recent activity (first in the array, since SQL sorted that way).
    setWinnerId(group.contacts[0]?.id ?? null);
  };

  const runMerge = async () => {
    if (!activeGroup || !winnerId) return;
    const losers = activeGroup.contacts.filter(c => c.id !== winnerId).map(c => c.id);
    if (losers.length === 0) {
      toast.error('Pick a winner — there are no other contacts to merge');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('merge_crm_contacts', {
      _winner_id: winnerId,
      _loser_ids: losers,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const removed = (data as { losers_removed?: number } | null)?.losers_removed ?? losers.length;
    toast.success(`Merged ${removed} duplicate(s) into the winner`);
    setActiveGroup(null);
    setWinnerId(null);
    queryClient.invalidateQueries({ queryKey: ['potential-duplicates'] });
    queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <CardTitle>Review Potential Duplicates</CardTitle>
        </div>
        <CardDescription>
          Contacts sharing a phone number + first name. Open a group to compare side-by-side and merge — notes, tasks,
          showings and emails will all move to the chosen winner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap border rounded-md p-3 bg-muted/30">
          <div className="flex items-center gap-4 flex-wrap text-sm">
            {stats ? (
              <>
                <div><span className="text-muted-foreground">Groups:</span> <span className="font-semibold">{stats.groups}</span></div>
                <div><span className="text-muted-foreground">Records involved:</span> <span className="font-semibold">{stats.records}</span></div>
                <div><span className="text-muted-foreground">Removable on merge:</span> <span className="font-semibold">{stats.extra}</span></div>
              </>
            ) : (
              <span className="text-muted-foreground">Click refresh to count current potential duplicates.</span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={fetchStats} disabled={statsLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${statsLoading ? 'animate-spin' : ''}`} />
            {statsLoading ? 'Counting…' : 'Refresh count'}
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !groups || groups.length === 0 ? (
          <div className="text-sm text-muted-foreground p-6 text-center border rounded-md">
            🎉 No duplicate groups detected.
          </div>
        ) : (
          <div className="border rounded-md divide-y max-h-[520px] overflow-y-auto">
            {groups.map((g) => (
              <div key={g.match_key} className="p-3 flex items-center justify-between gap-3 hover:bg-muted/40">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{fullName(g.contacts[0])}</span>
                    <Badge variant="outline" className="text-[10px]">{g.dup_count} contacts</Badge>
                    <Badge variant="secondary" className="text-[10px]">{g.match_type}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {g.contacts.map(c => c.email || c.phone || '—').join(' · ')}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => openMerge(g)}>
                  <Merge className="h-4 w-4 mr-1" /> Review
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!activeGroup} onOpenChange={(o) => !o && setActiveGroup(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review duplicates</DialogTitle>
            <DialogDescription>
              Pick the winner — its data is preserved. Other contacts' notes, tasks, showings and emails are moved into it,
              then the duplicate records are deleted.
            </DialogDescription>
          </DialogHeader>

          {activeGroup && (
            <RadioGroup value={winnerId ?? ''} onValueChange={setWinnerId} className="space-y-2 max-h-[420px] overflow-y-auto">
              {activeGroup.contacts.map(c => (
                <label
                  key={c.id}
                  htmlFor={`winner-${c.id}`}
                  className="flex items-start gap-3 border rounded-md p-3 cursor-pointer hover:bg-muted/40"
                >
                  <RadioGroupItem id={`winner-${c.id}`} value={c.id} className="mt-1" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{fullName(c)}</span>
                      {c.id === winnerId && <Badge>Winner</Badge>}
                      {c.status && <Badge variant="outline" className="text-[10px]">{c.status}</Badge>}
                      {c.assigned_to && <Badge variant="secondary" className="text-[10px]">{c.assigned_to}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-0.5">
                      <span>📧 {c.email || '—'}</span>
                      <span>📱 {c.phone || '—'}</span>
                      <span>Source: {c.source || '—'}</span>
                      <span>Created: {format(new Date(c.created_at), 'MMM d, yyyy')}</span>
                      <span className="col-span-2">
                        Last activity: {c.last_touch_at ? format(new Date(c.last_touch_at), 'MMM d, yyyy h:mm a') : '—'}
                      </span>
                    </div>
                    {(c.tags?.length || c.projects?.length) && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {c.tags?.map(t => <Badge key={`t-${t}`} variant="outline" className="text-[10px]">{t}</Badge>)}
                        {c.projects?.map(p => <Badge key={`p-${p}`} variant="secondary" className="text-[10px]">{p}</Badge>)}
                      </div>
                    )}
                    <Link
                      to={`/crm/leads/${c.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open lead <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </label>
              ))}
            </RadioGroup>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setActiveGroup(null)} disabled={busy}>Cancel</Button>
            <Button onClick={runMerge} disabled={busy || !winnerId}>
              {busy ? 'Merging…' : 'Merge into winner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
