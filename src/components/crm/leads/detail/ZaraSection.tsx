/**
 * ZaraSection — calm whisper card for the lead detail right rail.
 *
 * Apple Intelligence visual language: glass, no borders, soft halo, content
 * floats. Collapsed by default — shows one line of memory + the primary
 * suggestion. Expand to access actions, ask box, quotes, autonomy toggle.
 *
 * Reuses all underlying state + actions from the previous bordered version,
 * only the chrome changes.
 */
import { useEffect, useState } from 'react';
import {
  Loader2, AlertCircle, ChevronDown,
} from 'lucide-react';

import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useZaraLeadMemory, isMemoryStale, type ZaraLeadFacts } from '@/hooks/useZaraLeadMemory';
import { BookShowingDialog } from '../BookShowingDialog';
import { TrainOnWinDialog } from './TrainOnWinDialog';
import { ZaraContextStrip } from '@/components/zara/ZaraContextStrip';
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

/* ---------- component ---------- */

export function ZaraSection({ contact }: { contact: CrmContact }) {
  const qc = useQueryClient();
  const contactId = contact.id;
  const { data: memory } = useZaraLeadMemory(contactId);

  const [enabled, setEnabled]     = useState(false);
  const [channel, setChannel]     = useState<Channel>(contact.email ? 'email' : 'sms');
  const [busy, setBusy]           = useState<ActionKind | null>(null);
  const [prompt, setPrompt]       = useState('');
  const [scheduleHours, setSched] = useState(24);
  const [showShowing, setShowing] = useState(false);
  const [showTrain, setShowTrain] = useState(false);
  const [showQuotes, setShowQuotes] = useState(false);
  const [expanded, setExpanded]   = useState(false);

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

  // The single-line whisper: prefer memory.summary, fall back to a soft prompt.
  const whisper = memory?.summary?.trim() || 'I haven\'t met them yet — refresh to pull what we know.';

  return (
    <>
      <div className="zara-whisper">
        {/* Eyebrow row */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="zara-eyebrow">Zara</span>
            {refreshedLabel && (
              <span
                className="text-[10.5px] text-muted-foreground/80 tabular-nums"
                title={`Refreshed ${new Date(memory!.refreshed_at).toLocaleString()} · ${memory!.turn_count} turns`}
              >
                · {refreshedLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10.5px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            {expanded ? 'Less' : 'More'}
            <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>

        {/* The single whisper line */}
        <p className="text-[13px] leading-relaxed text-foreground/90">{whisper}</p>

        {/* Two-button primary lane — always visible, no chrome */}
        <div className="mt-3 flex items-center gap-1 -mx-2">
          <button
            type="button"
            onClick={() => run('follow_up_now')}
            disabled={busy !== null}
            className="zara-quiet-action disabled:opacity-50"
          >
            {busy === 'follow_up_now'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Send className="w-3.5 h-3.5" />}
            Follow up
          </button>
          <button
            type="button"
            onClick={() => run('summarize_lead')}
            disabled={busy !== null}
            className="zara-quiet-action disabled:opacity-50"
          >
            {busy === 'summarize_lead'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowing(true)}
            className="zara-quiet-action"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Showing
          </button>
        </div>

        {stale && !expanded && (
          <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-3 h-3" />
            <span>Memory hasn't refreshed in 60+ days.</span>
          </div>
        )}

        {/* ── Expanded surface ── */}
        {expanded && (
          <div className="mt-4 space-y-4 animate-fade-in">
            {/* Retrieval intelligence (playbook + founder lens) — no border */}
            <ZaraContextStrip contactId={contactId} className="!bg-transparent !border-0 px-0" />

            {/* Facts grid */}
            {rows.length > 0 && (
              <dl className="space-y-1">
                {rows.map((r) => (
                  <div key={r.label} className="grid grid-cols-[72px_1fr] gap-2 items-baseline">
                    <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{r.label}</dt>
                    <dd className="text-[12px] text-foreground/90 leading-snug">{r.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {/* Schedule + channel row */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-[10.5px]">
              <div className="flex items-center gap-1.5">
                <span className="uppercase tracking-wider text-muted-foreground">Channel</span>
                {(['email', 'sms', 'whatsapp'] as const).map((c) => {
                  const isEnabled = c === 'email' ? !!contact.email : !!contact.phone;
                  return (
                    <button
                      key={c}
                      onClick={() => isEnabled && setChannel(c)}
                      disabled={!isEnabled}
                      className={cn(
                        'px-2 py-0.5 rounded-full transition-colors',
                        channel === c
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:text-foreground disabled:opacity-30',
                      )}
                    >
                      {c === 'whatsapp' ? 'wa' : c}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="uppercase tracking-wider text-muted-foreground">Schedule</span>
                {SCHEDULE_PRESETS.map((p) => (
                  <button
                    key={p.v}
                    onClick={() => setSched(p.v)}
                    className={cn(
                      'px-2 py-0.5 rounded-full transition-colors',
                      scheduleHours === p.v
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {p.l}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => run('schedule_followup', { in_hours: scheduleHours })}
                  disabled={busy !== null}
                  className="zara-quiet-action !py-0.5"
                >
                  {busy === 'schedule_followup'
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Clock className="w-3 h-3" />}
                  Schedule
                </button>
              </div>
            </div>

            {/* Ask box — no border, just a faint base */}
            <div className="rounded-2xl bg-foreground/[0.03] p-2">
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
                className="w-full resize-none bg-transparent outline-none text-[12.5px] px-1.5 py-1 min-h-[40px]"
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex gap-1 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      onClick={() => setPrompt(q)}
                      className="shrink-0 text-[10.5px] px-2 py-0.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                    >
                      {q.length > 28 ? q.slice(0, 28) + '…' : q}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => prompt.trim() && run('custom', { prompt: prompt.trim() })}
                  disabled={!prompt.trim() || busy !== null}
                  className="zara-quiet-action !py-1 disabled:opacity-40"
                >
                  {busy === 'custom' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  Ask
                </button>
              </div>
            </div>

            {/* Quotes (collapsed by default) */}
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
                  <ul className="pt-2 space-y-1.5">
                    {quotes.map((q, i) => (
                      <li key={i} className="text-[11.5px] italic text-foreground/70 leading-snug border-l-2 border-primary/30 pl-2">
                        "{q}"
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Trust controls */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-foreground/5">
              <div className="min-w-0">
                <div className="text-[11.5px] font-medium">Let Zara reply autonomously</div>
                <div className="text-[10px] text-muted-foreground leading-snug">Off by default. Enable only after you trust the tone on this lead.</div>
              </div>
              <Switch checked={enabled} onCheckedChange={toggle} />
            </div>

            <button
              type="button"
              onClick={() => setShowTrain(true)}
              className="zara-quiet-action w-full justify-center !py-1.5"
            >
              <Trophy className="w-3.5 h-3.5" />
              Train Zara on this win
            </button>
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
