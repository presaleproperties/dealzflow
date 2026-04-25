import { useEffect, useState } from 'react';
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
import { Users, Merge, ExternalLink, RefreshCw, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
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

interface RelatedCounts {
  contact_id: string;
  notes_count: number;
  tasks_count: number;
  showings_count: number;
  messages_count: number;
  emails_count: number;
  total_count: number;
}

type WizardStep = 1 | 2 | 3;

function fullName(c: DupContact) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)';
}

export default function DuplicateReviewSection() {
  const queryClient = useQueryClient();
  const [activeGroup, setActiveGroup] = useState<DupGroup | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<Record<string, RelatedCounts> | null>(null);
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
    setWinnerId(group.contacts[0]?.id ?? null);
    setStep(1);
    setPreview(null);
  };

  const closeWizard = () => {
    setActiveGroup(null);
    setWinnerId(null);
    setStep(1);
    setPreview(null);
  };

  // Load preview counts when entering step 2
  useEffect(() => {
    if (step !== 2 || !activeGroup) return;
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      const ids = activeGroup.contacts.map(c => c.id);
      const { data, error } = await supabase.rpc('contact_related_counts', { _contact_ids: ids });
      setPreviewLoading(false);
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        return;
      }
      const map: Record<string, RelatedCounts> = {};
      ((data ?? []) as RelatedCounts[]).forEach(r => { map[r.contact_id] = r; });
      setPreview(map);
    })();
    return () => { cancelled = true; };
  }, [step, activeGroup]);

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
    closeWizard();
    queryClient.invalidateQueries({ queryKey: ['potential-duplicates'] });
    queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
    if (stats) fetchStats();
  };

  const winner = activeGroup?.contacts.find(c => c.id === winnerId) ?? null;
  const losers = activeGroup?.contacts.filter(c => c.id !== winnerId) ?? [];

  const totalsToMove = losers.reduce(
    (acc, l) => {
      const r = preview?.[l.id];
      if (!r) return acc;
      acc.notes += Number(r.notes_count);
      acc.tasks += Number(r.tasks_count);
      acc.showings += Number(r.showings_count);
      acc.messages += Number(r.messages_count);
      acc.emails += Number(r.emails_count);
      return acc;
    },
    { notes: 0, tasks: 0, showings: 0, messages: 0, emails: 0 },
  );

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

      <Dialog open={!!activeGroup} onOpenChange={(o) => !o && closeWizard()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Merge duplicates</DialogTitle>
            <DialogDescription>
              Step {step} of 3 — {step === 1 ? 'select the winner' : step === 2 ? 'preview what will be re-linked' : 'confirm the merge'}.
            </DialogDescription>
          </DialogHeader>

          {/* Stepper */}
          <div className="flex items-center gap-2 text-xs">
            {[1, 2, 3].map((n, i) => (
              <div key={n} className="flex items-center gap-2 flex-1">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center font-semibold ${
                  step >= n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>{n}</div>
                <div className={step >= n ? 'font-medium' : 'text-muted-foreground'}>
                  {n === 1 ? 'Pick winner' : n === 2 ? 'Preview' : 'Confirm'}
                </div>
                {i < 2 && <div className={`flex-1 h-px ${step > n ? 'bg-primary' : 'bg-border'}`} />}
              </div>
            ))}
          </div>

          {/* STEP 1 — pick winner */}
          {step === 1 && activeGroup && (
            <RadioGroup
              value={winnerId ?? ''}
              onValueChange={setWinnerId}
              className="space-y-2 max-h-[420px] overflow-y-auto"
            >
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

          {/* STEP 2 — preview re-links */}
          {step === 2 && activeGroup && winner && (
            <div className="space-y-3 max-h-[420px] overflow-y-auto">
              <div className="border rounded-md p-3 bg-primary/5">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Winner (kept)</div>
                <div className="font-semibold">{fullName(winner)}</div>
                <div className="text-xs text-muted-foreground">{winner.email || '—'} · {winner.phone || '—'}</div>
              </div>

              {previewLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : losers.length === 0 ? (
                <div className="text-sm text-muted-foreground">No other contacts to merge.</div>
              ) : (
                <>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Will be merged in & deleted</div>
                  {losers.map(l => {
                    const r = preview?.[l.id];
                    const total = r ? Number(r.total_count) : 0;
                    return (
                      <div key={l.id} className="border rounded-md p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{fullName(l)}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {l.email || '—'} · {l.phone || '—'}
                            </div>
                          </div>
                          <Badge variant={total > 0 ? 'default' : 'secondary'} className="text-[10px]">
                            {total} record{total === 1 ? '' : 's'} re-linked
                          </Badge>
                        </div>
                        {r && (
                          <div className="grid grid-cols-5 gap-2 mt-2 text-xs">
                            <Stat label="Notes" value={r.notes_count} />
                            <Stat label="Tasks" value={r.tasks_count} />
                            <Stat label="Showings" value={r.showings_count} />
                            <Stat label="Messages" value={r.messages_count} />
                            <Stat label="Emails" value={r.emails_count} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="border-t pt-3 mt-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Total re-linked to winner</div>
                    <div className="grid grid-cols-5 gap-2 text-xs">
                      <Stat label="Notes" value={totalsToMove.notes} highlight />
                      <Stat label="Tasks" value={totalsToMove.tasks} highlight />
                      <Stat label="Showings" value={totalsToMove.showings} highlight />
                      <Stat label="Messages" value={totalsToMove.messages} highlight />
                      <Stat label="Emails" value={totalsToMove.emails} highlight />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 3 — confirm */}
          {step === 3 && activeGroup && winner && (
            <div className="space-y-3">
              <div className="border rounded-md p-3 bg-primary/5">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Winner (kept)</div>
                <div className="font-semibold">{fullName(winner)}</div>
                <div className="text-xs text-muted-foreground">{winner.email || '—'} · {winner.phone || '—'}</div>
              </div>

              <div className="border rounded-md p-3 bg-destructive/5 border-destructive/40">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                  <div className="text-sm">
                    <div className="font-semibold text-destructive">
                      {losers.length} contact{losers.length === 1 ? '' : 's'} will be permanently deleted
                    </div>
                    <ul className="text-xs text-muted-foreground mt-1 list-disc pl-4 space-y-0.5">
                      {losers.map(l => (
                        <li key={l.id}>{fullName(l)} — {l.email || l.phone || '—'}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="border rounded-md p-3 text-sm">
                <div className="font-medium mb-2">Records being re-linked to winner</div>
                <div className="grid grid-cols-5 gap-2 text-xs">
                  <Stat label="Notes" value={totalsToMove.notes} highlight />
                  <Stat label="Tasks" value={totalsToMove.tasks} highlight />
                  <Stat label="Showings" value={totalsToMove.showings} highlight />
                  <Stat label="Messages" value={totalsToMove.messages} highlight />
                  <Stat label="Emails" value={totalsToMove.emails} highlight />
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                This action cannot be undone. Click <strong>Confirm merge</strong> to proceed.
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between sm:justify-between gap-2">
            <Button variant="ghost" onClick={closeWizard} disabled={busy}>Cancel</Button>
            <div className="flex gap-2">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep((step - 1) as WizardStep)} disabled={busy}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              )}
              {step < 3 && (
                <Button
                  onClick={() => setStep((step + 1) as WizardStep)}
                  disabled={!winnerId || (step === 2 && previewLoading)}
                >
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {step === 3 && (
                <Button onClick={runMerge} disabled={busy || !winnerId}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {busy ? 'Merging…' : 'Confirm merge'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-2 text-center ${highlight ? 'bg-primary/5 border-primary/30' : 'bg-muted/30'}`}>
      <div className="text-base font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
