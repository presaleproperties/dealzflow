import { useEffect, useState } from 'react';
import { AlertOctagon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

/** Top-of-app banner when Zara kill switch is engaged. Visible to all agents. */
export function KillSwitchBanner() {
  const { data, refetch } = useQuery({
    queryKey: ['zara-kill-switch'],
    queryFn: async () => {
      const { data } = await supabase
        .from('zara_settings')
        .select('kill_switch, kill_switch_reason, kill_switch_at')
        .eq('id', 1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 60_000,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const ch = supabase
      .channel('zara-settings-kill')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'zara_settings' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  if (!data?.kill_switch || dismissed) return null;

  return (
    <div
      className="sticky top-0 z-50 w-full bg-red-600 text-white px-4 flex items-center justify-between text-[12.5px] font-medium shadow-md"
      style={{
        paddingTop: 'calc(8px + env(safe-area-inset-top))',
        paddingBottom: '8px',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertOctagon className="w-4 h-4 shrink-0" />
        <span className="truncate">
          Zara is paused team-wide
          {data.kill_switch_reason ? ` — ${data.kill_switch_reason}` : ''}
        </span>
      </div>
      <button onClick={() => setDismissed(true)} className="text-white/80 hover:text-white text-[11px] underline ml-3 shrink-0 min-h-[32px]">
        Hide
      </button>
    </div>
  );
}
