import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const LABELS: Record<number, { label: string; desc: string }> = {
  1: { label: 'Suggest only', desc: 'Zara never sends. Every action waits for you.' },
  2: { label: 'Suggest + draft', desc: 'Zara drafts but does not autosend.' },
  3: { label: 'Smart auto', desc: 'Autosend safe nudges; escalate risky moves.' },
  4: { label: 'Aggressive', desc: 'Autosend most things including project showcases.' },
  5: { label: 'Full auto', desc: 'Zara runs the whole outbound playbook.' },
};

export function AutonomyControl() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['zara-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('zara_settings').select('autonomy_level, mode').eq('id', 1).maybeSingle();
      return (data as { autonomy_level: number; mode: string } | null) ?? { autonomy_level: 3, mode: 'sandbox' };
    },
  });
  const level = data?.autonomy_level ?? 3;

  const setLevel = async (next: number) => {
    const { error } = await supabase.from('zara_settings').update({ autonomy_level: next }).eq('id', 1);
    if (error) { toast.error(error.message); return; }
    toast.success(`Autonomy → ${next} · ${LABELS[next].label}`);
    qc.invalidateQueries({ queryKey: ['zara-settings'] });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Autonomy</span>
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setLevel(n)}
            title={`${LABELS[n].label} — ${LABELS[n].desc}`}
            className={`w-6 h-6 rounded text-[11px] font-semibold tabular-nums transition-colors ${
              n <= level ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/60'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="text-[11px] text-muted-foreground hidden md:inline">{LABELS[level].label}</span>
    </div>
  );
}
