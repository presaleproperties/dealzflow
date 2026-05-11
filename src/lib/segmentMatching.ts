import type { CrmContact } from '@/hooks/useCrmContacts';
import type { LeadSegment } from '@/hooks/useCrmLeadSegments';

/**
 * Check if a contact matches a segment's filter_config.
 * Shared between Pipeline Kanban and Leads page for consistent behavior.
 */
/**
 * Matches a contact against a segment filter.
 *
 * Supports two filter "shapes":
 *
 *  Strict (legacy):
 *    { status: [...], lead_type: [...], source: [...], tags: [...], contact_type, assigned_to }
 *    — exact, case-sensitive matching. AND across keys.
 *
 *  Loose / case-insensitive (new):
 *    { tags_any_ci: [...], lead_type_ci: [...] }
 *    — case-insensitive, OR across the two keys (a contact matches if EITHER its
 *      lead_type/lead_types OR its tags overlap any of the values, ignoring case).
 *      Used by the seeded Pre-Sale 🔥 / Re-Sale 🔥 / Commercial chips because the
 *      imported data is inconsistent ('Pre-Sale' as lead_type, 'presale' as a tag).
 *
 * Strict and loose can coexist on the same filter — strict keys are AND-applied
 * first, then the loose keys must also pass.
 */
export function contactMatchesSegment(
  contact: CrmContact,
  filter: Record<string, unknown>,
  segmentId?: string,
): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;

  const canonicalSegmentId = (contact as unknown as { pipeline_segment_id?: string | null }).pipeline_segment_id;

  // Canonical-id short-circuit: if the caller passed a segmentId AND the
  // contact has been canonically stamped to it, this is a guaranteed match.
  // We DO NOT fall through to "false" when the canonical id points to a
  // different segment — fall through to evaluate the filter rules instead,
  // so segments without a canonical assignment can still match by filter.
  if (segmentId && canonicalSegmentId && canonicalSegmentId === segmentId) {
    return true;
  }

  // Legacy: a filter that itself names a target pipeline_segment_id only
  // matches contacts canonically stamped to that segment.
  const filterSegmentId = typeof filter.pipeline_segment_id === 'string' ? filter.pipeline_segment_id : null;
  if (filterSegmentId) return canonicalSegmentId === filterSegmentId;

  // ── Strict keys ──
  if (filter.status && Array.isArray(filter.status) && (filter.status as string[]).length > 0) {
    if (!(filter.status as string[]).includes(contact.status ?? '')) return false;
  }
  if (filter.lead_type && Array.isArray(filter.lead_type) && (filter.lead_type as string[]).length > 0) {
    const wanted = filter.lead_type as string[];
    const contactTypes: string[] = ((contact as any).lead_types as string[] | undefined)?.length
      ? ((contact as any).lead_types as string[])
      : contact.lead_type ? [contact.lead_type] : [];
    if (!wanted.some(w => contactTypes.includes(w))) return false;
  }
  if (filter.source && Array.isArray(filter.source) && (filter.source as string[]).length > 0) {
    if (!(filter.source as string[]).includes(contact.source ?? '')) return false;
  }
  if (filter.tags && Array.isArray(filter.tags) && (filter.tags as string[]).length > 0) {
    const contactTags = contact.tags ?? [];
    if (!(filter.tags as string[]).some(t => contactTags.includes(t))) return false;
  }
  if (filter.contact_type && typeof filter.contact_type === 'string') {
    if (contact.contact_type !== filter.contact_type) return false;
  }
  if (filter.assigned_to && typeof filter.assigned_to === 'string') {
    if (contact.assigned_to !== filter.assigned_to) return false;
  }

  // ── Loose / case-insensitive keys (OR'd together) ──
  const looseTagsCi = (filter.tags_any_ci as string[] | undefined) ?? [];
  const looseTypesCi = (filter.lead_type_ci as string[] | undefined) ?? [];
  if (looseTagsCi.length > 0 || looseTypesCi.length > 0) {
    const wantedTags = looseTagsCi.map(t => t.toLowerCase());
    const wantedTypes = looseTypesCi.map(t => t.toLowerCase());

    const contactTags = (contact.tags ?? []).map(t => (t ?? '').toLowerCase());
    const rawContactTypes: string[] = ((contact as any).lead_types as string[] | undefined)?.length
      ? ((contact as any).lead_types as string[])
      : contact.lead_type ? [contact.lead_type] : [];
    const contactTypesCi = rawContactTypes.map(t => (t ?? '').toLowerCase());

    const tagHit = wantedTags.length > 0 && wantedTags.some(t => contactTags.includes(t));
    const typeHit = wantedTypes.length > 0 && wantedTypes.some(t => contactTypesCi.includes(t));

    if (!tagHit && !typeHit) return false;
  }

  return true;
}

/**
 * Assign each contact to its first matching segment (first-match-wins).
 * Returns a map of segmentId → contacts[].
 * This is the same logic used by the Pipeline Kanban board.
 */
export function assignContactsToSegments(
  contacts: CrmContact[],
  segments: LeadSegment[],
): Record<string, CrmContact[]> {
  // Only segments with actual filters (excludes "All Leads" catch-all)
  const pipelineSegments = segments.filter(
    s => s.filter_config && Object.keys(s.filter_config).length > 0,
  );

  const map: Record<string, CrmContact[]> = {};
  pipelineSegments.forEach(s => { map[s.id] = []; });

  contacts.forEach(c => {
    const canonicalSegmentId = (c as unknown as { pipeline_segment_id?: string | null }).pipeline_segment_id;
    if (canonicalSegmentId && map[canonicalSegmentId]) {
      map[canonicalSegmentId].push(c);
      return;
    }
    for (const seg of pipelineSegments) {
      if (contactMatchesSegment(c, seg.filter_config, seg.id)) {
        map[seg.id].push(c);
        break; // first match wins
      }
    }
  });

  return map;
}

/**
 * Compute segment counts using DIRECT matching (not first-match-wins).
 * Each contact is counted in EVERY segment it matches — this mirrors what
 * the user sees when clicking a pill (the DB query filters by that segment alone).
 * Prevents the bug where a presale lead with status="New Lead" was only counted
 * under "New Leads" and made the "Pre-Sale 🔥" pill show 0.
 */
export function computeSegmentCounts(
  contacts: CrmContact[],
  segments: LeadSegment[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  segments.forEach(s => {
    if (!s.filter_config || Object.keys(s.filter_config).length === 0) {
      counts[s.id] = contacts.length;
    } else {
      counts[s.id] = contacts.filter(c => contactMatchesSegment(c, s.filter_config, s.id)).length;
    }
  });
  return counts;
}
