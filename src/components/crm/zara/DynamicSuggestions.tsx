import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useZaraPin } from '@/hooks/useZaraPin';

type Props = { onPick: (text: string) => void };

/** Suggestion chips derived from current pipeline state — replaces static quick actions. */
export function DynamicSuggestions({ onPick }: Props) {
  const { pinnedLead } = useZaraPin();

  const { data } = useQuery({
    queryKey: ['zara-suggestions-pulse'],
    queryFn: async () => {
      const [{ count: hot }, { count: pending }, { count: stale }] = await Promise.all([
        supabase.from('crm_contacts').select('id', { count: 'exact', head: true }).gte('engagement_score', 60).is('deleted_at', null),
        supabase.from('zara_suggested_replies').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('crm_contacts').select('id', { count: 'exact', head: true })
          .lt('last_touch_at', new Date(Date.now() - 14 * 86400_000).toISOString())
          .is('deleted_at', null),
      ]);
      return { hot: hot ?? 0, pending: pending ?? 0, stale: stale ?? 0 };
    },
    staleTime: 60_000,
  });

  const suggestions: string[] = [];
  if (pinnedLead) {
    suggestions.push(`Summarize the pinned lead's last 30 days`);
    suggestions.push(`Draft a follow-up email for the pinned lead`);
    suggestions.push(`Recommend 3 projects for the pinned lead`);
  } else {
    if ((data?.hot ?? 0) > 0) suggestions.push(`Show me my ${data?.hot} hot leads and what to do next`);
    if ((data?.pending ?? 0) > 0) suggestions.push(`Walk me through ${data?.pending} drafts pending approval`);
    if ((data?.stale ?? 0) > 0) suggestions.push(`${data?.stale} leads have gone cold — who should I re-engage first?`);
    suggestions.push(`Plan tomorrow's outbound`);
    suggestions.push(`What needs my attention right now?`);
    suggestions.push(`Morning briefing`);
  }

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {suggestions.slice(0, 6).map((s) => (
        <button
          key={s}
          onClick={() => onPick(s)}
          className="text-[12px] px-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted/60 hover:border-primary/40 transition-colors"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
