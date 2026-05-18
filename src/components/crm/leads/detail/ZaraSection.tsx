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
                className="zara-meta"
                title={`Refreshed ${new Date(memory!.refreshed_at).toLocaleString()} · ${memory!.turn_count} turns`}
              >
                refreshed {refreshedLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="zara-meta hover:text-foreground transition-colors flex items-center gap-1"
          >
            {expanded ? 'Less' : 'More'}
            <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>

        {/* The single whisper line */}
        <p className="text-[13.5px] leading-relaxed text-foreground/90 tracking-[-0.005em]">
          {busy === 'summarize_lead'
            ? <span className="zara-shimmer">Refreshing memory…</span>
            : whisper}
        </p>

        {/* Primary lane — text-only links with middot separators */}
        <div className="mt-3 zara-dot-row text-[12.5px] text-foreground/80">
          <button
            type="button"
            onClick={() => run('follow_up_now')}
            disabled={busy !== null}
            className="zara-link disabled:opacity-40"
          >
            {busy === 'follow_up_now' ? <Loader2 className="w-3 h-3 inline animate-spin -mt-0.5" /> : 'Follow up'}
          </button>
          <button
            type="button"
            onClick={() => run('summarize_lead')}
            disabled={busy !== null}
            className="zara-link disabled:opacity-40"
          >
            Refresh memory
          </button>
          <button
            type="button"
            onClick={() => setShowing(true)}
            className="zara-link"
          >
            Book showing
          </button>
        </div>

        {stale && !expanded && (
          <div className="mt-2 flex items-center gap-1.5 zara-meta text-amber-600 dark:text-amber-400/90">
            <AlertCircle className="w-3 h-3" />
            <span>Memory hasn't refreshed in 60+ days.</span>
          </div>
        )}

        {/* ── Expanded surface ── */}
        {expanded && (
          <div className="mt-5 space-y-5 animate-fade-in">
            {/* Retrieval intelligence — flat, no card */}
            <ZaraContextStrip contactId={contactId} className="!bg-transparent !p-0" />

            {rows.length > 0 && (
              <div>
                <div className="zara-section-head">What Zara knows</div>
                <dl className="space-y-1.5">
                  {rows.map((r) => (
                    <div key={r.label} className="grid grid-cols-[88px_1fr] gap-3 items-baseline">
                      <dt className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/90 font-medium">{r.label}</dt>
                      <dd className="text-[12.5px] text-foreground/90 leading-snug">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <hr className="zara-rule" />

            {/* Channel + Schedule */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="zara-section-head !mb-0">Channel</span>
                <div className="flex items-center gap-1">
                  {(['email', 'sms', 'whatsapp'] as const).map((c) => {
                    const isEnabled = c === 'email' ? !!contact.email : !!contact.phone;
                    return (
                      <button
                        key={c}
                        onClick={() => isEnabled && setChannel(c)}
                        disabled={!isEnabled}
                        data-active={channel === c}
                        className="zara-chip disabled:opacity-30"
                      >
                        {c === 'whatsapp' ? 'WhatsApp' : c.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-baseline justify-between gap-3">
                <span className="zara-section-head !mb-0">Schedule</span>
                <div className="flex items-center gap-1">
                  {SCHEDULE_PRESETS.map((p) => (
                    <button
                      key={p.v}
                      onClick={() => setSched(p.v)}
                      data-active={scheduleHours === p.v}
                      className="zara-chip"
                    >
                      {p.l}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => run('schedule_followup', { in_hours: scheduleHours })}
                    disabled={busy !== null}
                    className="zara-link ml-2 text-[11.5px]"
                  >
                    {busy === 'schedule_followup'
                      ? <Loader2 className="w-3 h-3 inline animate-spin" />
                      : 'Set'}
                  </button>
                </div>
              </div>
            </div>

            <hr className="zara-rule" />

            {/* Ask box */}
            <div>
              <div className="zara-section-head">Ask Zara</div>
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
                placeholder="Tell Zara what to do…  ⌘⏎ to send"
                className="zara-input resize-none min-h-[56px]"
              />
              <div className="flex items-center justify-between gap-2 pt-2">
                <div className="flex gap-1 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      onClick={() => setPrompt(q)}
                      className="shrink-0 zara-chip whitespace-nowrap"
                    >
                      {q.length > 28 ? q.slice(0, 28) + '…' : q}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => prompt.trim() && run('custom', { prompt: prompt.trim() })}
                  disabled={!prompt.trim() || busy !== null}
                  className="zara-link text-[12px] disabled:opacity-40"
                >
                  {busy === 'custom' ? <Loader2 className="w-3 h-3 inline animate-spin" /> : 'Send'}
                </button>
              </div>
            </div>

            {/* Quotes */}
            {quotes.length > 0 && (
              <>
                <hr className="zara-rule" />
                <div>
                  <button
                    type="button"
                    onClick={() => setShowQuotes((v) => !v)}
                    className="flex items-center justify-between w-full zara-section-head !mb-2 hover:text-foreground transition-colors"
                  >
                    <span>Why we know · {quotes.length}</span>
                    <ChevronDown className={cn('w-3 h-3 transition-transform', showQuotes && 'rotate-180')} />
                  </button>
                  {showQuotes && (
                    <ul className="space-y-1.5">
                      {quotes.map((q, i) => (
                        <li key={i} className="text-[12px] italic text-foreground/70 leading-snug pl-3 border-l border-primary/30">
                          "{q}"
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            <hr className="zara-rule" />

            {/* Trust */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-foreground/90">Autonomous replies</div>
                <div className="zara-meta leading-snug mt-0.5">Off by default. Enable once you trust the tone.</div>
              </div>
              <Switch checked={enabled} onCheckedChange={toggle} />
            </div>

            <button
              type="button"
              onClick={() => setShowTrain(true)}
              className="zara-link text-[12px] block"
            >
              Train Zara on this win →
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
