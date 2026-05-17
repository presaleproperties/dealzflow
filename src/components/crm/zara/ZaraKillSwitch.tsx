import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Pill } from '@/components/crm/shared/Pill';
import { Power, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Mode = 'off' | 'sandbox' | 'live';

export function ZaraKillSwitch() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ['zara-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('zara_settings')
        .select('mode, autonomy_level')
        .eq('id', 1)
        .maybeSingle();
      return data as { mode: Mode; autonomy_level: number } | null;
    },
  });
  const mode: Mode = data?.mode ?? 'sandbox';

  const setMode = async (next: Mode) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('zara_settings').update({ mode: next }).eq('id', 1);
      if (error) throw error;
      toast.success(`Zara is now ${next.toUpperCase()}`);
      qc.invalidateQueries({ queryKey: ['zara-settings'] });
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to change mode');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'live') {
    return (
      <div className="mx-5 mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 flex items-center gap-2 text-[12.5px]">
        <Power className="w-3.5 h-3.5 text-emerald-500" />
        <span className="font-medium">Zara is LIVE</span>
        <Pill size="sm" tone="success">autosend enabled</Pill>
        <span className="ml-auto text-[11px] text-muted-foreground">Real messages may be sent automatically.</span>
        <button
          disabled={busy}
          onClick={() => setMode('sandbox')}
          className="ml-2 text-[11.5px] px-2.5 py-1 rounded-md border border-border hover:bg-muted/60 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Pause to Sandbox'}
        </button>
      </div>
    );
  }
  if (mode === 'sandbox') {
    return (
      <div className="mx-5 mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 flex items-center gap-2 text-[12.5px]">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        <span className="font-medium">Sandbox mode</span>
        <span className="text-muted-foreground">— Zara only sends to test contacts (tagged <code className="font-mono">zara_test_contact</code>).</span>
        <button
          disabled={busy}
          onClick={() => setMode('live')}
          className="ml-auto text-[11.5px] px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Go Live'}
        </button>
        <button
          disabled={busy}
          onClick={() => setMode('off')}
          className="text-[11.5px] px-2.5 py-1 rounded-md border border-border hover:bg-muted/60 disabled:opacity-50"
        >
          Off
        </button>
      </div>
    );
  }
  return (
    <div className="mx-5 mt-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 flex items-center gap-2 text-[12.5px]">
      <Power className="w-3.5 h-3.5 text-destructive" />
      <span className="font-medium">Zara is OFF</span>
      <span className="text-muted-foreground">— no drafts, no sends, no planner runs.</span>
      <button
        disabled={busy}
        onClick={() => setMode('sandbox')}
        className="ml-auto text-[11.5px] px-2.5 py-1 rounded-md border border-border hover:bg-muted/60 disabled:opacity-50"
      >
        Enable (Sandbox)
      </button>
    </div>
  );
}
