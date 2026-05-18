/**
 * ZaraContextStrip — compact, read-only surface that reveals the retrieval
 * stack powering Zara for a given lead. Shows the matched playbook + top
 * founder principle pulled from `zara_retrieve_context`.
 *
 * Mounted inline on the lead detail (inside ZaraSection) to make the
 * layered architecture visible without adding a separate panel.
 */
import { useQuery } from '@tanstack/react-query';
import { Layers, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type RetrievalShape = {
  playbook?: {
    name?: string;
    scenario?: string;
    talk_track?: string;
  } | null;
  principles?: Array<{
    title?: string;
    statement?: string;
    weight?: number;
    module?: string;
  }>;
  winning_examples?: Array<unknown>;
};

export function ZaraContextStrip({
  contactId,
  trigger = 'lead_open',
  className,
}: {
  contactId: string;
  trigger?: string;
  className?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['zara-retrieve-context', contactId, trigger],
    queryFn: async (): Promise<RetrievalShape | null> => {
      const { data, error } = await supabase.rpc('zara_retrieve_context', {
        _contact_id: contactId,
        _trigger: trigger,
      });
      if (error) return null;
      return (data as RetrievalShape) ?? null;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading || !data) return null;
  const pb = data.playbook;
  const principle = data.principles?.[0];
  if (!pb && !principle) return null;

  return (
    <div
      className={cn(
        'px-3 py-2.5 rounded-2xl bg-foreground/[0.03] space-y-1.5',
        className,
      )}
    >
      {pb && (
        <div className="flex items-start gap-2">
          <Layers className="w-3 h-3 mt-0.5 text-primary/80 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
              Playbook
            </div>
            <div className="text-[12px] text-foreground/85 leading-snug truncate">
              {pb.name || pb.scenario || 'Matched scenario'}
            </div>
          </div>
        </div>
      )}
      {principle && (
        <div className="flex items-start gap-2">
          <BookOpen className="w-3 h-3 mt-0.5 text-primary/80 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
              Founder lens
              {principle.module && (
                <span className="ml-1 text-muted-foreground/70 normal-case tracking-normal">
                  · {principle.module}
                </span>
              )}
            </div>
            <div className="text-[12px] text-foreground/85 leading-snug">
              {principle.statement || principle.title}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
