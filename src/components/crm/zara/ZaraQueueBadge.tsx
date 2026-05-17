import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

export function ZaraQueueBadge() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: count = 0 } = useQuery({
    queryKey: ['zara-pending-count', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from('zara_suggested_replies')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .or(`assigned_to.eq.${user!.id},assigned_to.is.null`);
      return count ?? 0;
    },
    staleTime: 15000,
  });

  useEffect(() => {
    const ch = supabase
      .channel('zara-queue-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zara_suggested_replies' }, () => {
        qc.invalidateQueries({ queryKey: ['zara-pending-count'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const tone =
    count === 0 ? 'bg-muted text-muted-foreground' :
    count <= 10 ? 'bg-warning/15 text-warning' :
                  'bg-destructive/15 text-destructive';

  return (
    <Link
      to="/crm/zara/queue"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium ${tone}`}
      title="Zara approval queue"
    >
      <span>Zara</span><span>{count}</span>
    </Link>
  );
}
