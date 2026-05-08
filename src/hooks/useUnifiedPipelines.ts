/**
 * Unified Pipelines — single source of truth for the pipeline stages used across
 * the CRM (Pipeline Kanban, Leads list dropdown, Lead Detail sidebar, bulk
 * actions, AddLead, filters).
 *
 * All pipelines come from the `crm_lead_segments` table. The "All Leads"
 * catch-all segment (no filter_config) is excluded because it isn't a stage.
 *
 * Picking a pipeline writes the canonical `pipeline_segment_id` first, plus the
 * legacy status/lead_type fields for reports and older filters.
 */
import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCrmLeadSegments, type LeadSegment } from './useCrmLeadSegments';
import { contactMatchesSegment } from '@/lib/segmentMatching';
import type { CrmContact } from './useCrmContacts';

/** All pipeline-eligible segments, ordered by `sort_order`. Excludes "All Leads". */
export function useUnifiedPipelines() {
  const { data: segments = [], isLoading, error } = useCrmLeadSegments();
  const pipelines = useMemo(
    () =>
      segments
        .filter(s => s.filter_config && Object.keys(s.filter_config).length > 0)
        .sort((a, b) => a.sort_order - b.sort_order),
    [segments],
  );
  return { pipelines, isLoading, error };
}

/** Resolve which pipeline a contact currently belongs to (first-match-wins). */
export function useActivePipelineFor(contact: CrmContact | null | undefined) {
  const { pipelines } = useUnifiedPipelines();
  return useMemo<LeadSegment | null>(() => {
    if (!contact) return null;
    const canonical = (contact as unknown as { pipeline_segment_id?: string | null }).pipeline_segment_id;
    if (canonical) {
      const direct = pipelines.find(seg => seg.id === canonical);
      if (direct) return direct;
    }
    for (const seg of pipelines) {
      if (contactMatchesSegment(contact, seg.filter_config)) return seg;
    }
    return null;
  }, [contact, pipelines]);
}

/**
 * Apply a pipeline segment to a contact. Writes status + lead_type from the
 * segment's filter_config for compatibility, but `pipeline_segment_id` is the
 * canonical source of truth used by every CRM surface.
 */
export function useSetContactPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contact,
      segment,
    }: {
      contact: CrmContact;
      segment: LeadSegment;
    }) => {
      const fc = segment.filter_config as Record<string, unknown>;
      const updates: Record<string, unknown> = { pipeline_segment_id: segment.id };
      if (Array.isArray(fc.status) && (fc.status as string[]).length > 0) {
        updates.status = (fc.status as string[])[0];
        updates.status_changed_at = new Date().toISOString();
        updates.stage_changed_at = new Date().toISOString();
      }
      if (Array.isArray(fc.lead_type) && (fc.lead_type as string[]).length > 0) {
        updates.lead_type = (fc.lead_type as string[])[0];
      }
      if (Object.keys(updates).length === 0) {
        throw new Error(`"${segment.name}" has no stage rules`);
      }
      const { error } = await supabase.from('crm_contacts').update(updates).eq('id', contact.id);
      if (error) throw error;
      return updates;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-contact'] });
      qc.invalidateQueries({ queryKey: ['crm-contacts'] });
      qc.invalidateQueries({ queryKey: ['crm-contacts-lite'] });
      qc.invalidateQueries({ queryKey: ['crm-contacts-paginated'] });
      qc.invalidateQueries({ queryKey: ['crm-segment-counts'] });
      qc.invalidateQueries({ queryKey: ['crm-pipeline-snapshot'] });
      qc.invalidateQueries({ queryKey: ['crm-dashboard-kpis'] });
    },
  });
}
