import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

interface Props { contactId: string }

export function HandoffBriefBanner({ contactId }: Props) {
  const qc = useQueryClient();
  const { data: brief } = useQuery({
    queryKey: ['zara-handoff', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('zara_handoff_briefs')
        .select('*')
        .eq('contact_id', contactId)
        .eq('to_agent_user_id', user.id)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!brief?.id) return;
    // If still pending, request fill
    if ((brief.brief as any)?.pending) {
      supabase.functions.invoke('zara-handoff-brief', { body: { briefId: brief.id } })
        .then(() => qc.invalidateQueries({ queryKey: ['zara-handoff', contactId] }));
    }
  }, [brief?.id]); // eslint-disable-line

  if (!brief) return null;
  const b: any = brief.brief ?? {};

  const markRead = async () => {
    await supabase.from('zara_handoff_briefs').update({ read_at: new Date().toISOString() }).eq('id', brief.id);
    qc.invalidateQueries({ queryKey: ['zara-handoff', contactId] });
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] font-semibold text-primary/90">
          <ArrowRightLeft className="w-3 h-3" /> Handoff brief
        </div>
        <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={markRead}>
          <Check className="w-3 h-3 mr-1" /> Got it
        </Button>
      </div>
      {b.pending ? (
        <p className="text-[12px] text-muted-foreground italic">Zara is preparing the brief…</p>
      ) : (
        <div className="text-[12.5px] leading-snug space-y-1 text-foreground/85">
          {brief.summary && <p className="font-medium">{brief.summary}</p>}
          {b.summary && <p className="text-foreground/75">{b.summary}</p>}
          {b.next_steps?.length > 0 && (
            <p><span className="text-[10.5px] uppercase tracking-wider text-muted-foreground mr-1">Next</span>{b.next_steps.join(' · ')}</p>
          )}
        </div>
      )}
    </div>
  );
}
