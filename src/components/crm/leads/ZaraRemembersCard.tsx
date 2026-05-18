import { useState } from 'react';
import { Sparkles, ChevronDown, AlertCircle, Quote, RefreshCw } from 'lucide-react';
import { useZaraLeadMemory, isMemoryStale, type ZaraLeadFacts } from '@/hooks/useZaraLeadMemory';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  contactId: string;
}

function fmtMoney(n?: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${n}`;
}

function budgetRange(f: ZaraLeadFacts): string | null {
  const lo = fmtMoney(f.budget_min);
  const hi = fmtMoney(f.budget_max);
  if (lo && hi) return lo === hi ? lo : `${lo} – ${hi}`;
  return lo || hi || null;
}

interface Row { label: string; value: string; }

function buildRows(f: ZaraLeadFacts): Row[] {
  const rows: Row[] = [];
  const budget = budgetRange(f);
  if (budget) rows.push({ label: 'Budget', value: budget });
  if (f.timeline) rows.push({ label: 'Timeline', value: f.timeline });
  if (f.timing_concerns) rows.push({ label: 'Timing', value: f.timing_concerns });
  if (f.financing_status) rows.push({ label: 'Financing', value: f.financing_status });
  if (f.investor_vs_enduser) rows.push({ label: 'Buyer', value: f.investor_vs_enduser === 'investor' ? 'Investor' : f.investor_vs_enduser === 'end_user' ? 'End-user' : 'Mixed' });
  if (f.preferred_property_type) rows.push({ label: 'Type', value: f.preferred_property_type });
  if (f.preferred_cities?.length) rows.push({ label: 'Cities', value: f.preferred_cities.join(', ') });
  else if (f.preferred_neighborhoods?.length) rows.push({ label: 'Areas', value: f.preferred_neighborhoods.join(', ') });
  if (f.project_interest) rows.push({ label: 'Project', value: f.project_interest });
  if (f.projects_compared?.length) rows.push({ label: 'Comparing', value: f.projects_compared.slice(0, 4).join(', ') });
  if (f.viewed_projects?.length) rows.push({ label: 'Viewed', value: f.viewed_projects.slice(0, 4).join(', ') });
  if (f.downloaded_floorplans?.length) rows.push({ label: 'Floorplans', value: f.downloaded_floorplans.slice(0, 4).join(', ') });
  if (f.school_preferences) rows.push({ label: 'Schools', value: f.school_preferences });
  if (f.commute_concerns) rows.push({ label: 'Commute', value: f.commute_concerns });
  if (f.must_haves?.length) rows.push({ label: 'Must-haves', value: f.must_haves.join(', ') });
  if (f.dealbreakers?.length) rows.push({ label: 'Dealbreakers', value: f.dealbreakers.join(', ') });
  if (f.motivations?.length) rows.push({ label: 'Why', value: f.motivations.join(', ') });
  if (f.decision_makers?.length) rows.push({ label: 'Decision', value: f.decision_makers.join(', ') });
  if (f.family_situation) rows.push({ label: 'Family', value: f.family_situation });
  if (f.emotional_hesitation) rows.push({ label: 'Hesitation', value: f.emotional_hesitation });
  if (f.emotional_objections?.length) rows.push({ label: 'Concerns', value: f.emotional_objections.join(' · ') });
  if (f.last_objection) rows.push({ label: 'Objection', value: f.last_objection });
  if (f.appointment_history?.length) {
    const a = f.appointment_history.slice(0, 3).map(x => `${x.kind ?? 'visit'}${x.project ? ` @ ${x.project}` : ''}${x.when ? ` (${x.when})` : ''}`).join(' · ');
    rows.push({ label: 'Visits', value: a });
  }
  if (f.next_steps?.length) rows.push({ label: 'Next', value: f.next_steps.join(' · ') });
  return rows;
}

function urgencyTone(signal?: string | null): { dot: string; label: string } | null {
  if (!signal) return null;
  const s = signal.toLowerCase();
  if (s.startsWith('hot')) return { dot: 'bg-red-500', label: signal };
  if (s.startsWith('warm')) return { dot: 'bg-amber-400', label: signal };
  if (s.startsWith('cold')) return { dot: 'bg-sky-400', label: signal };
  return { dot: 'bg-muted-foreground', label: signal };
}

export function ZaraRemembersCard({ contactId }: Props) {
  const { data: memory, isLoading } = useZaraLeadMemory(contactId);
  const [showQuotes, setShowQuotes] = useState(false);

  if (isLoading || !memory) return null;

  const facts = memory.facts || {};
  const rows = buildRows(facts);
  const urgency = urgencyTone(facts.urgency_signal);
  const quotes = facts.key_quotes ?? [];
  const stale = isMemoryStale(memory.refreshed_at);

  if (rows.length === 0 && !memory.summary) return null;

  return (
    <div
      className={cn(
        'relative rounded-xl border bg-card/80 backdrop-blur-sm overflow-hidden',
        'border-primary/25',
      )}
      style={{
        boxShadow: '0 1px 0 hsl(var(--primary) / 0.05) inset, 0 8px 24px -16px hsl(var(--primary) / 0.35)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-primary/90">
            Zara remembers
          </span>
        </div>
        <span
          className="text-[10px] text-muted-foreground tabular-nums"
          title={`Refreshed ${new Date(memory.refreshed_at).toLocaleString()} · ${memory.turn_count} turns`}
        >
          {formatDistanceToNow(new Date(memory.refreshed_at), { addSuffix: true })}
        </span>
      </div>

      {/* Urgency strip */}
      {urgency && (
        <div className="px-3 pb-2 flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full', urgency.dot)} />
          <span className="text-[11.5px] text-foreground/85 leading-tight">{urgency.label}</span>
        </div>
      )}

      {/* Summary */}
      {memory.summary && (
        <p className="px-3 pb-2.5 text-[12.5px] leading-snug text-foreground/85">
          {memory.summary}
        </p>
      )}

      {/* Facts table */}
      {rows.length > 0 && (
        <dl className="px-3 pb-2.5 space-y-1">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[68px_1fr] gap-2 items-baseline">
              <dt className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium">{r.label}</dt>
              <dd className="text-[12px] text-foreground/90 leading-snug">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Stale warning */}
      {stale && (
        <div className="px-3 pb-2 flex items-center gap-1.5 text-[10.5px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-3 h-3" />
          <span>Memory hasn't refreshed in 60+ days — confirm before relying on it.</span>
        </div>
      )}

      {/* Why we know (quotes) */}
      {quotes.length > 0 && (
        <button
          type="button"
          onClick={() => setShowQuotes((v) => !v)}
          className="w-full px-3 py-2 border-t border-border/40 flex items-center justify-between text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Why we know · {quotes.length}</span>
          <ChevronDown className={cn('w-3 h-3 transition-transform', showQuotes && 'rotate-180')} />
        </button>
      )}
      {showQuotes && quotes.length > 0 && (
        <ul className="px-3 pb-3 pt-1 space-y-1.5">
          {quotes.map((q, i) => (
            <li key={i} className="text-[11.5px] italic text-foreground/70 leading-snug border-l-2 border-primary/40 pl-2">
              "{q}"
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
