import type { CrmContact } from '@/hooks/useCrmContacts';
import type { LeadSegment } from '@/hooks/useCrmLeadSegments';

/**
 * Check if a contact matches a segment's filter_config.
 * Shared between Pipeline Kanban and Leads page for consistent behavior.
 */
export function contactMatchesSegment(contact: CrmContact, filter: Record<string, unknown>): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;

  if (filter.status && Array.isArray(filter.status) && (filter.status as string[]).length > 0) {
    if (!(filter.status as string[]).includes(contact.status ?? '')) return false;
  }
  if (filter.lead_type && Array.isArray(filter.lead_type) && (filter.lead_type as string[]).length > 0) {
    if (!(filter.lead_type as string[]).includes(contact.lead_type ?? '')) return false;
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
    for (const seg of pipelineSegments) {
      if (contactMatchesSegment(c, seg.filter_config)) {
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
      counts[s.id] = contacts.filter(c => contactMatchesSegment(c, s.filter_config)).length;
    }
  });
  return counts;
}
