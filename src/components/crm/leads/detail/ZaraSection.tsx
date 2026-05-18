/**
 * ZaraSection — single, consolidated Zara surface for the lead detail right rail.
 *
 * Replaces the previous trio (ZaraEngagePanel + ZaraRemembersCard + ZaraLeadCard)
 * which stacked three borders, three "Sparkles · Zara" headers, two memory
 * summaries, two refresh/summarize buttons, and two channel selectors.
 *
 * Layout: one bordered tile, three quiet sub-sections separated by hairlines:
 *   1. Memory       — urgency · summary · compact facts
 *   2. Act          — 4 quick actions + channel switcher
 *   3. Ask / More   — composer; "More" collapses quotes + train-on-win + per-lead toggle
 */
import { useEffect, useState } from 'react';
import {
  Sparkles, Send, Clock, RefreshCw, CalendarDays, Loader2,
  AlertCircle, ChevronDown, Trophy,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useZaraLeadMemory, isMemoryStale, type ZaraLeadFacts } from '@/hooks/useZaraLeadMemory';
import { BookShowingDialog } from '../BookShowingDialog';
import { TrainOnWinDialog } from './TrainOnWinDialog';
import type { CrmContact } from '@/hooks/useCrmContacts';

type Channel = 'email' | 'sms' | 'whatsapp';
type ActionKind = 'follow_up_now' | 'schedule_followup' | 'summarize_lead' | 'custom';

const SCHEDULE_PRESETS = [
  { l: '1h',  v: 1   },
  { l: '24h', v: 24  },
  { l: '3d',  v: 72  },
  { l: '7d',  v: 168 },
];

const QUICK_PROMPTS = [
  'Follow up — they went quiet for a week',
  'Ask if they have time for a 15-min call this week',
  'Share next steps and a calendar link',
  'Check in on financing — broker intro if needed',
];

/* ---------- memory helpers ---------- */

function fmtMoney(n?: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${n}`;
}
function budgetRange(f: ZaraLeadFacts): string | null {
  const lo = fmtMoney(f.budget_min); const hi = fmtMoney(f.budget_max);
  if (lo && hi) return lo === hi ? lo : `${lo} – ${hi}`;
  return lo || hi || null;
}
function buildRows(f: ZaraLeadFacts): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const budget = budgetRange(f);
  if (budget) rows.push({ label: 'Budget', value: budget });
  if (f.timeline) rows.push({ label: 'Timeline', value: f.timeline });
  if (f.financing_status) rows.push({ label: 'Financing', value: f.financing_status });
  if (f.preferred_neighborhoods?.length) rows.push({ label: 'Areas', value: f.preferred_neighborhoods.join(', ') });
  if (f.project_interest) rows.push({ label: 'Project', value: f.project_interest });
  if (f.must_haves?.length) rows.push({ label: 'Must-haves', value: f.must_haves.join(', ') });
  if (f.dealbreakers?.length) rows.push({ label: 'Dealbreakers', value: f.dealbreakers.join(', ') });
  if (f.next_steps?.length) rows.push({ label: 'Next', value: f.next_steps.join(' · ') });
  if (f.last_objection) rows.push({ label: 'Objection', value: f.last_objection });
  return rows;
}
function urgencyTone(signal?: string | null): { dot: string; label: string } | null {
  if (!signal) return null;
  const s = signal.toLowerCase();
  if (s.startsWith('hot'))  return { dot: 'bg-red-500',         label: signal };
  if (s.startsWith('warm')) return { dot: 'bg-amber-400',       label: signal };
  if (s.startsWith('cold')) return { dot: 'bg-sky-400',         label: signal };
  return { dot: 'bg-muted-foreground', label: signal };
}

/* ---------- component ---------- */

export function ZaraSection({ contact }: { contact: CrmContact }) {
  const qc = useQueryClient();
  const contactId = contact.id;
  const { data: memory } = useZaraLeadMemory(contactId);

  const [enabled, setEnabled]       = useState(false);
  const [channel, setChannel]       = useState<Channel>(contact.email ? 'email' : 'sms');
  const [busy, setBusy]             = useState<ActionKind | null>(null);
  const [prompt, setPrompt]         = useState('');
  const [scheduleHours, setSched]   = useState(24);
  const [showShowing, setShowing]   = useState(false);
  const [showTrain, setShowTrain]   = useState(false);
  const [showQuotes, setShowQuotes] = useState(false);
  const [moreOpen, setMoreOpen]     = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('crm_contacts').select('zara_enabled').eq('id', contactId).maybeSingle();
      if (active && data) setEnabled(!!(data as any).zara_enabled);
    })();
    return () => { active = false; };
  }, [contactId]);

  const facts   = memory?.facts || {};
  const rows    = buildRows(facts);
  const urgency = urgencyTone(facts.urgency_signal);
  const quotes  = facts.key_quotes ?? [];
  const stale   = memory ? isMemoryStale(memory.refreshed_at) : false;

  const run = async (kind: ActionKind, payload: Record<string, any> = {}) => {
    setBusy(kind);
    try {
      const { data, error } = await supabase.functions.invoke('zara-engage-action', {
        body: { kind, contactId, channel, ...payload },
      });
      if (error) throw error;
      switch (kind) {
        case 'follow_up_now':
        case 'custom':
          toast.success('Zara is drafting — review the gold chip above the timeline.', { duration: 5000 });
          qc.invalidateQueries({ queryKey: ['zara-lead-draft', contactId] });
          break;
        case 'schedule_followup':
          toast.success(`Scheduled in ${payload.in_hours ?? 24}h`);
          qc.invalidateQueries({ queryKey: ['engagement-events', contactId] });
          break;
        case 'summarize_lead': {
          const summary = (data as any)?.memory?.summary;
          toast.success('Memory refreshed', { description: summary ? summary.slice(0, 120) : undefined });
          qc.invalidateQueries({ queryKey: ['zara-lead-memory', contactId] });
          break;
        }
      }
      if (kind === 'custom') setPrompt('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Zara action failed');
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (next: boolean) => {
    const { data: user } = await supabase.auth.getUser();
    const prev = enabled;
    setEnabled(next);
    const { error } = await supabase.from('crm_contacts').update({
      zara_enabled: next,
      zara_enabled_at: next ? new Date().toISOString() : null,
      zara_enabled_by: next ? user.user?.id : null,
    } as any).eq('id', contactId);
    if (error) { setEnabled(prev); toast.error(error.message); return; }
    toast.success(next ? 'Zara enabled for this lead' : 'Zara disabled');
  };

  const refreshedLabel = memory
    ? formatDistanceToNow(new Date(memory.refreshed_at), { addSuffix: true })
    : null;

  return (
    <>
      <div
        className="rounded-xl border border-primary/25 bg-card/80 overflow-hidden"
        style={{ boxShadow: '0 1px 0 hsl(var(--primary) / 0.04) inset, 0 8px 24px -18px hsl(var(--primary) / 0.3)' }}
      >
        {/* ── header ── */}
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-primary/15 bg-gradient-to-b from-primary/[0.05] to-transparent">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </span>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold tracking-tight leading-tight">Zara</div>
              {refreshedLabel && (
                <div
                  className="text-[10px] text-muted-foreground leading-tight tabular-nums"
                  title={`Refreshed ${new Date(memory!.refreshed_at).toLocaleString()} · ${memory!.turn_count} turns`}
                >
                  refreshed {refreshedLabel}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 1. Memory ── */}
        {(memory?.summary || rows.length > 0 || urgency) && (
          <div className="px-3 pt-2.5 pb-2.5">
            {urgency && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={cn('w-1.5 h-1.5 rounded-full', urgency.dot)} />
                <span className="text-[11px] text-foreground/80 leading-tight">{urgency.label}</span>
              </div>
            )}
            {memory?.summary && (
              <p className="text-[12.5px] leading-snug text-foreground/85">{memory.summary}</p>
            )}
            {rows.length > 0 && (
              <dl className="mt-2 space-y-0.5">
                {rows.map((r) => (
                  <div key={r.label} className="grid grid-cols-[68px_1fr] gap-2 items-baseline">
                    <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{r.label}</dt>
                    <dd className="text-[11.5px] text-foreground/90 leading-snug">{r.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {stale && (
              <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-3 h-3" />
                <span>Memory hasn't refreshed in 60+ days.</span>
              </div>
            )}
          </div>
        )}

        {/* ── 2. Act ── */}
        <div className="px-3 py-2.5 border-t border-border/40 space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              size="sm"
              onClick={() => run('follow_up_now')}
              disabled={busy !== null}
              className="h-8 text-[11.5px] gap-1.5 justify-start bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {busy === 'follow_up_now' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Follow up
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => run('schedule_followup', { in_hours: scheduleHours })}
              disabled={busy !== null}
              className="h-8 text-[11.5px] gap-1.5 justify-start"
            >
              {busy === 'schedule_followup' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3 text-primary" />}
              In {scheduleHours}h
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => run('summarize_lead')}
              disabled={busy !== null}
              className="h-8 text-[11.5px] gap-1.5 justify-start"
            >
              {busy === 'summarize_lead' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 text-primary" />}
              Summarize
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => setShowing(true)}
              className="h-8 text-[11.5px] gap-1.5 justify-start"
            >
              <CalendarDays className="w-3 h-3 text-primary" />
              Showing
            </Button>
          </div>

          {/* compact meta row: channel + schedule presets */}
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <div className="flex items-center gap-1">
              <span className="uppercase tracking-wider text-muted-foreground mr-0.5">Ch</span>
              {(['email', 'sms', 'whatsapp'] as const).map((c) => {
                const isEnabled = c === 'email' ? !!contact.email : !!contact.phone;
                return (
                  <button
                    key={c}
                    onClick={() => isEnabled && setChannel(c)}
                    disabled={!isEnabled}
                    className={cn(
                      'px-1.5 py-0.5 rounded border transition-colors uppercase tracking-wider',
                      channel === c
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border text-muted-foreground hover:border-primary/40 disabled:opacity-40',
                    )}
                  >
                    {c === 'whatsapp' ? 'wa' : c}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1">
              <span className="uppercase tracking-wider text-muted-foreground mr-0.5">In</span>
              {SCHEDULE_PRESETS.map((p) => (
                <button
                  key={p.v}
                  onClick={() => setSched(p.v)}
                  className={cn(
                    'px-1.5 py-0.5 rounded border transition-colors',
                    scheduleHours === p.v
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border text-muted-foreground hover:border-primary/40',
                  )}
                >
                  {p.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 3. Ask ── */}
        <div className="px-3 py-2.5 border-t border-border/40">
          <div className="rounded-lg border border-border bg-card focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 transition p-1.5">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && prompt.trim()) {
                  e.preventDefault();
                  run('custom', { prompt: prompt.trim() });
                }
              }}
              rows={2}
              placeholder="Tell Zara what to do…"
              className="w-full resize-none bg-transparent outline-none text-[12px] px-1.5 py-1 min-h-[40px]"
            />
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => setPrompt(q)}
                    className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-background hover:bg-muted/60 hover:border-primary/40 whitespace-nowrap text-muted-foreground"
                  >
                    {q.length > 28 ? q.slice(0, 28) + '…' : q}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                onClick={() => prompt.trim() && run('custom', { prompt: prompt.trim() })}
                disabled={!prompt.trim() || busy !== null}
                className="h-7 px-2 text-[11px] gap-1 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
              >
                {busy === 'custom' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Ask
              </Button>
            </div>
          </div>
        </div>

        {/* ── More ── */}
        {(quotes.length > 0 || true) && (
          <div className="border-t border-border/40">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="w-full px-3 py-2 flex items-center justify-between text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>More</span>
              <ChevronDown className={cn('w-3 h-3 transition-transform', moreOpen && 'rotate-180')} />
            </button>
            {moreOpen && (
              <div className="px-3 pb-3 pt-0 space-y-2.5">
                {/* per-lead enable */}
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-medium">Let Zara reply autonomously</div>
                    <div className="text-[10px] text-muted-foreground leading-snug">Off by default. Enable only after you trust the tone on this lead.</div>
                  </div>
                  <Switch checked={enabled} onCheckedChange={toggle} />
                </div>

                {/* quotes */}
                {quotes.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowQuotes((v) => !v)}
                      className="flex items-center justify-between w-full text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      <span>Why we know · {quotes.length}</span>
                      <ChevronDown className={cn('w-3 h-3 transition-transform', showQuotes && 'rotate-180')} />
                    </button>
                    {showQuotes && (
                      <ul className="pt-1.5 space-y-1.5">
                        {quotes.map((q, i) => (
                          <li key={i} className="text-[11px] italic text-foreground/70 leading-snug border-l-2 border-primary/40 pl-2">
                            "{q}"
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* train on win */}
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setShowTrain(true)}
                  className="w-full h-8 text-[11.5px] gap-1.5 border border-dashed border-border hover:border-primary/40 hover:bg-primary/5"
                >
                  <Trophy className="w-3 h-3 text-primary" />
                  Train Zara on this win
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <BookShowingDialog
        contactId={contactId}
        project={(contact as any).project}
        open={showShowing}
        onOpenChange={setShowing}
      />
      <TrainOnWinDialog
        contactId={contactId}
        contactName={[contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || '(unknown)'}
        open={showTrain}
        onOpenChange={setShowTrain}
      />
    </>
  );
}
