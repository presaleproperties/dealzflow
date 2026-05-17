/**
 * Shared bucketing: counts contacts into the unified pipelines via the same
 * first-match-wins logic used by Kanban / Leads / Lead Detail. Single source
 * of truth so dashboards never drift from the canonical pipelines defined in
 * `crm_lead_segments`.
 */
import { useMemo } from 'react';
import { useUnifiedPipelines } from './useUnifiedPipelines';
import { contactMatchesSegment, orderSegmentsBySpecificity } from '@/lib/segmentMatching';
import type { CrmContact } from './useCrmContacts';
import type { LeadSegment } from './useCrmLeadSegments';

export interface PipelineBucket {
  segment: LeadSegment;
  count: number;
}

export function useContactsByPipeline(contacts: CrmContact[] | undefined) {
  const { pipelines, isLoading } = useUnifiedPipelines();

  return useMemo(() => {
    const counts: Record<string, number> = {};
    pipelines.forEach(p => (counts[p.id] = 0));

    const ordered = orderSegmentsBySpecificity(pipelines);
    (contacts ?? []).forEach(ct => {
      const segId = (ct as unknown as { pipeline_segment_id?: string | null })
        .pipeline_segment_id;
      if (segId && counts[segId] !== undefined) {
        counts[segId]++;
        return;
      }
      for (const p of ordered) {
        if (contactMatchesSegment(ct, p.filter_config, p.id)) {
          counts[p.id]++;
          return;
        }
      }
    });

    const buckets: PipelineBucket[] = pipelines.map(segment => ({
      segment,
      count: counts[segment.id] ?? 0,
    }));
    const total = buckets.reduce((s, b) => s + b.count, 0);

    return { pipelines, buckets, total, isLoading };
  }, [pipelines, contacts, isLoading]);
}
