/**
 * ZaraLeadIntelligenceCard — visible "Lead Intelligence Profile" on the
 * lead detail. Built from agent notes via zara-analyze-note. Manual
 * notes are the highest-priority intelligence Zara has on a lead, so
 * this card sits near the top of the right rail.
 */
import { useState } from 'react';
import { Sparkles, RefreshCw, Loader2, Quote } from 'lucide-react';
import { useZaraNoteIntelligence } from '@/hooks/useZaraNoteIntelligence';
import { useZaraLeadMemory } from '@/hooks/useZaraLeadMemory';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface Props {
  contactId: string;
}

function uniqMerge(...arrs: (string[] | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arrs) {
    for (const v of (a ?? [])) {
      const s = String(v || '').trim();
      if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); }
    }
  }
  return out;
}

function tierLabel(n: number | null | undefined, kind: 'trust' | 'ready'): string | null {
  if (n == null) return null;
  if (kind === 'trust') return ['cold', 'distant', 'building', 'warm', 'high-trust'][Math.max(0, Math.min(4, n - 1))];
  return ['just looking', 'curious', 'considering', 'shortlisting', 'ready to write'][Math.max(0, Math.min(4, n - 1))];
}

export function ZaraLeadIntelligenceCard({ contactId }: Props) {
  const qc = useQueryClient();
  const { data: intel = [], isLoading } = useZaraNoteIntelligence(contactId);
  const { data: memory } = useZaraLeadMemory(contactId);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('zara-analyze-note', {
        body: { contact_id: contactId, force_rollup: true },
      });
      if (error) throw error;
      const n = (data as any)?.analyzed ?? 0;
      toast.success(n > 0 ? `Zara analyzed ${n} note${n === 1 ? '' : 's'}` : 'Intelligence refreshed');
      qc.invalidateQueries({ queryKey: ['zara-note-intelligence', contactId] });
      qc.invalidateQueries({ queryKey: ['zara-lead-memory', contactId] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Refresh failed');
    } finally { setBusy(false); }
  };

  // Latest non-null wins for single-value fields
  const latest = intel[0];
  const emotional = intel.find(r => r.emotional_state)?.emotional_state;
  const investor  = intel.find(r => r.investor_vs_enduser)?.investor_vs_enduser;
  const commitment = intel.find(r => r.commitment_level)?.commitment_level;
  const family    = intel.find(r => r.family_context)?.family_context;
  const style     = memory?.recommended_style || intel.find(r => r.recommended_style)?.recommended_style;
  const nextStep  = memory?.recommended_next_step || intel.find(r => r.recommended_next_step)?.recommended_next_step;
  const summary   = memory?.intelligence_summary || latest?.summary;

  const trust = (() => {
    const vals = intel.map(r => r.trust_level).filter((x): x is number => typeof x === 'number');
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b, i) => a + b * (vals.length - i), 0) / vals.reduce((a, _, i) => a + (vals.length - i), 0));
  })();
  const ready = (() => {
    const vals = intel.map(r => r.buying_readiness).filter((x): x is number => typeof x === 'number');
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b, i) => a + b * (vals.length - i), 0) / vals.reduce((a, _, i) => a + (vals.length - i), 0));
  })();

  const objections   = uniqMerge(...intel.map(r => r.objections)).slice(0, 6);
  const motivations  = uniqMerge(...intel.map(r => r.motivations)).slice(0, 6);
  const financial    = uniqMerge(...intel.map(r => r.financial_concerns)).slice(0, 6);
  const timing       = uniqMerge(...intel.map(r => r.timing_signals)).slice(0, 6);
  const areas        = uniqMerge(...intel.map(r => r.preferred_areas)).slice(0, 6);
  const escalation   = uniqMerge(...intel.map(r => r.escalation_signals)).slice(0, 4);
  const quotes       = intel.map(r => r.key_quote).filter(Boolean).slice(0, 4) as string[];

  const hasAnything = intel.length > 0 || summary;

  if (isLoading) {
    return (
      <div className="zara-glass rounded-2xl p-4 animate-pulse">
        <div className="h-3 w-32 bg-muted/40 rounded mb-3" />
        <div className="h-3 w-full bg-muted/30 rounded mb-2" />
        <div className="h-3 w-4/5 bg-muted/30 rounded" />
      </div>
    );
  }

  return (
    <div className="zara-glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="zara-eyebrow">Lead Intelligence</span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="zara-quiet-action text-[11px]"
          title="Re-analyze recent notes"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          <span className="ml-1">{busy ? 'Analyzing…' : 'Refresh'}</span>
        </button>
      </div>

      {!hasAnything && (
        <div className="px-4 pb-4 text-[12.5px] text-muted-foreground leading-relaxed">
          No agent notes analyzed yet. Add a manual note (call summary, meeting recap, observation) and Zara will extract emotional state, objections, motivations, and a recommended next step automatically.
        </div>
      )}

      {hasAnything && (
        <div className="px-4 pb-4 space-y-3.5">
          {summary && (
            <p className="text-[13px] leading-relaxed text-foreground/90">{summary}</p>
          )}

          {/* Tier signals */}
          {(trust != null || ready != null || emotional || investor || commitment) && (
            <div className="flex flex-wrap gap-1.5">
              {emotional && <Chip tone="amber">{emotional}</Chip>}
              {trust != null && <Chip tone="primary">trust · {tierLabel(trust, 'trust')}</Chip>}
              {ready != null && <Chip tone="primary">{tierLabel(ready, 'ready')}</Chip>}
              {investor && <Chip>{investor === 'investor' ? 'Investor' : investor === 'end_user' ? 'End-user' : 'Mixed'}</Chip>}
              {commitment && <Chip>commitment · {commitment}</Chip>}
            </div>
          )}

          {nextStep && (
            <Row label="Next step" value={nextStep} accent />
          )}
          {style && (
            <Row label="Tone" value={style} />
          )}
          {!!motivations.length    && <RowList label="Why" items={motivations} />}
          {!!objections.length     && <RowList label="Concerns" items={objections} />}
          {!!financial.length      && <RowList label="Money" items={financial} />}
          {!!timing.length         && <RowList label="Timing" items={timing} />}
          {!!areas.length          && <RowList label="Areas" items={areas} />}
          {family                  && <Row label="Family" value={family} />}
          {!!escalation.length     && <RowList label="Urgency" items={escalation} accent />}

          {quotes.length > 0 && (
            <div className="pt-1 border-t border-border/30 mt-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Quote className="w-3 h-3 text-primary/70" />
                <span className="zara-eyebrow">In their words</span>
              </div>
              <ul className="space-y-1">
                {quotes.map((q, i) => (
                  <li key={i} className="text-[12px] italic text-foreground/75 leading-snug pl-2.5 border-l border-primary/30">
                    "{q}"
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-[10px] uppercase tracking-wider text-muted-foreground pt-1">
            From {intel.length} analyzed note{intel.length === 1 ? '' : 's'}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: 'primary' | 'amber' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-[10.5px] tracking-[0.02em] px-2 py-0.5 rounded-full border',
        tone === 'primary' && 'bg-primary/10 border-primary/25 text-primary/90',
        tone === 'amber'   && 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300',
        !tone              && 'bg-muted/50 border-border/40 text-foreground/75',
      )}
    >
      {children}
    </span>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="grid grid-cols-[68px_1fr] gap-2.5 items-baseline">
      <dt className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground font-medium">{label}</dt>
      <dd className={cn('text-[12.5px] leading-snug', accent ? 'text-primary/95 font-medium' : 'text-foreground/90')}>
        {value}
      </dd>
    </div>
  );
}

function RowList({ label, items, accent }: { label: string; items: string[]; accent?: boolean }) {
  return <Row label={label} value={items.join(' · ')} accent={accent} />;
}
