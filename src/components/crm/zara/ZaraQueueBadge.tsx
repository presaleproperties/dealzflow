import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  className?: string;
}

export function ZaraQueueBadge({ className = '' }: Props) {
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

  if (!count) return null;

  const tone =
    count <= 10 ? 'bg-warning/15 text-warning' :
                  'bg-destructive/15 text-destructive';

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold ${tone} ${className}`}
      title={`${count} pending Zara draft${count === 1 ? '' : 's'}`}
    >
      {count}
    </span>
  );
}
