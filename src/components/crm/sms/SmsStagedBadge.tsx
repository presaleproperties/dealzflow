import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

/**
 * Staged-queue badge for the topnav.
 *
 * After the May 2026 billing incident, outbound SMS no longer hits Twilio —
 * it is written to `crm_sms_log` with `status='staged'`. This badge surfaces
 * the staged count on every page so agents always see the safeguard is
 * active, and lets admins quickly discard staged batches.
 */
export function SmsStagedBadge() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: count = 0 } = useQuery({
    queryKey: ['crm-sms-staged-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('crm_sms_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'staged');
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['crm-sms-staged-list'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_sms_log')
        .select('id, to_number, body, channel, campaign_id, created_at, contact_id')
        .eq('status', 'staged')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const discardOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_sms_log').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-sms-staged-count'] });
      qc.invalidateQueries({ queryKey: ['crm-sms-staged-list'] });
      qc.invalidateQueries({ queryKey: ['crm-sms-log-all'] });
      toast.success('Discarded');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to discard'),
  });

  const discardAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('crm_sms_log').delete().eq('status', 'staged');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-sms-staged-count'] });
      qc.invalidateQueries({ queryKey: ['crm-sms-staged-list'] });
      qc.invalidateQueries({ queryKey: ['crm-sms-log-all'] });
      toast.success('Staged queue cleared');
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to clear'),
  });

  // Group rows by campaign for cleaner display.
  const groups = useMemo(() => {
    const byCamp = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.campaign_id || `single:${r.id}`;
      if (!byCamp.has(k)) byCamp.set(k, [] as any);
      byCamp.get(k)!.push(r as any);
    }
    return Array.from(byCamp.entries());
  }, [rows]);

  if (count === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold tracking-tight bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
          title={`${count} SMS staged — not sent`}
          aria-label={`${count} SMS staged`}
        >
          <ShieldAlert className="w-3.5 h-3.5" strokeWidth={2.2} />
          <span>{count} staged</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-[460px] p-0 flex flex-col">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="text-[15px] font-semibold tracking-tight">
            Staged SMS queue
          </SheetTitle>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Outbound SMS is currently <strong>staged, not sent</strong>, as a billing
            safeguard after the May 16 incident. {count} message{count === 1 ? '' : 's'} pending.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-5 text-[12px] text-muted-foreground">Loading…</div>}
          {!isLoading && groups.length === 0 && (
            <div className="p-5 text-[12px] text-muted-foreground">Nothing staged.</div>
          )}
          {groups.map(([k, items]) => {
            const isCamp = k.startsWith('single:') === false;
            const first = items[0]!;
            return (
              <div key={k} className="border-b">
                <div className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground">
                      {isCamp ? `Blast · ${items.length} recipient${items.length === 1 ? '' : 's'}` : 'Single send'}
                      <span className="ml-2 text-muted-foreground/70 normal-case font-normal">
                        {formatDistanceToNow(new Date(first.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {isCamp && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {first.channel === 'whatsapp' ? 'WA' : 'SMS'}
                      </span>
                    )}
                  </div>
                  <div className="text-[12.5px] text-foreground line-clamp-3 whitespace-pre-wrap leading-relaxed">
                    {first.body}
                  </div>
                  {!isCamp && (
                    <div className="mt-1.5 flex items-center justify-between">
                      <div className="text-[11px] font-mono text-muted-foreground">{first.to_number}</div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={discardOne.isPending}
                        onClick={() => discardOne.mutate(first.id)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Discard
                      </Button>
                    </div>
                  )}
                  {isCamp && (
                    <div className="mt-2 max-h-32 overflow-y-auto rounded border border-border/60 divide-y divide-border/60">
                      {items.slice(0, 50).map(r => (
                        <div key={r.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                          <span className="text-[11px] font-mono text-muted-foreground truncate">{r.to_number}</span>
                          <button
                            className="text-[10.5px] text-destructive/80 hover:text-destructive"
                            onClick={() => discardOne.mutate(r.id)}
                          >
                            discard
                          </button>
                        </div>
                      ))}
                      {items.length > 50 && (
                        <div className="px-2 py-1.5 text-[10.5px] text-muted-foreground">
                          +{items.length - 50} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between gap-3">
          <p className="text-[10.5px] text-muted-foreground leading-tight">
            Release is intentionally locked.<br />Re-enable Twilio in <code>send-sms</code> to lift stage mode.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] text-destructive border-destructive/40 hover:bg-destructive/10"
            disabled={discardAll.isPending}
            onClick={() => {
              if (confirm(`Discard all ${count} staged messages? This cannot be undone.`)) {
                discardAll.mutate();
              }
            }}
          >
            Discard all
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
