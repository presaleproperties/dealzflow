/**
 * Client-side filter that mirrors the server filters in
 * `usePaginatedCrmContacts`. Used by the Leads page (and any pill/segment
 * count UI) so the chip counts ALWAYS reflect the user's active filter set.
 *
 * Keep in sync with `usePaginatedCrmContacts.tsx`.
 */
import type { CrmContact } from '@/hooks/useCrmContacts';

export interface ClientFilterCriteria {
  search?: string;
  contactType?: string;
  statuses?: string[];
  sources?: string[];
  agents?: string[];
  projects?: string[];
  leadTypes?: string[];
  languages?: string[];
  tags?: string[];
  excludeTags?: string[];
  excludeContactTypes?: string[];
  excludeStatuses?: string[];
  excludeSources?: string[];
  excludeLeadTypes?: string[];
  propertyTypes?: string[];
  cities?: string[];
  preApproved?: string[]; // ['yes'|'no']
  campaigns?: string[];
  letterFilter?: string;
  pipelineView?: 'all' | 'active' | 'directory';
  uncontacted7?: boolean;
  stale30?: boolean;
  highScore?: boolean;
  birthdayMonth?: boolean;
  // savedView / segmentFilters intentionally NOT applied here — segment counts
  // already account for those at the segment-matching layer.
}

const DAY = 24 * 60 * 60 * 1000;

function arrAny(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || a.length === 0) return false;
  if (!b || b.length === 0) return false;
  const set = new Set(b);
  return a.some(x => set.has(x));
}

export function applyClientFilters(
  contacts: CrmContact[],
  f: ClientFilterCriteria,
): CrmContact[] {
  if (!contacts.length) return contacts;
  const search = (f.search ?? '').trim().toLowerCase();
  const tokens = search ? search.split(/\s+/).filter(Boolean) : [];
  const now = Date.now();

  return contacts.filter((c: any) => {
    // Search — name / email / phone (AND across tokens)
    if (tokens.length > 0) {
      const hay = [
        c.first_name, c.last_name, c.email, c.phone,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!tokens.every(t => hay.includes(t))) return false;
    }

    if (f.contactType && c.contact_type !== f.contactType) return false;
    if (f.statuses?.length && !f.statuses.includes(c.status ?? '')) return false;
    if (f.sources?.length && !f.sources.includes(c.source ?? '')) return false;
    if (f.agents?.length && !f.agents.includes(c.assigned_to ?? '')) return false;

    if (f.languages?.length && !f.languages.includes(c.language ?? '')) return false;
    if (f.cities?.length && !f.cities.includes(c.city_pref ?? '')) return false;
    if (f.propertyTypes?.length && !f.propertyTypes.includes(c.property_type_pref ?? '')) return false;
    if (f.campaigns?.length && !f.campaigns.includes(c.campaign_source ?? '')) return false;

    if (f.preApproved?.length === 1) {
      const want = f.preApproved[0] === 'yes';
      if (Boolean(c.is_pre_approved) !== want) return false;
    }

    if (f.leadTypes?.length) {
      const types: string[] = (c.lead_types?.length ? c.lead_types : (c.lead_type ? [c.lead_type] : []));
      if (!arrAny(f.leadTypes, types)) return false;
    }

    if (f.projects?.length) {
      const projects: string[] = (c.projects?.length ? c.projects : (c.project ? [c.project] : []));
      if (!arrAny(f.projects, projects)) return false;
    }

    if (f.tags?.length) {
      if (!arrAny(f.tags, c.tags ?? [])) return false;
    }
    if (f.excludeTags?.length) {
      if (arrAny(f.excludeTags, c.tags ?? [])) return false;
    }

    if (f.letterFilter) {
      const first = (c.first_name || c.last_name || '').trim().charAt(0).toUpperCase();
      if (first !== f.letterFilter.toUpperCase()) return false;
    }

    if (f.uncontacted7) {
      const t = c.last_touch_at ? new Date(c.last_touch_at).getTime() : 0;
      if (t && now - t < 7 * DAY) return false;
    }
    if (f.stale30) {
      const t = c.last_touch_at ? new Date(c.last_touch_at).getTime() : 0;
      if (t && now - t < 30 * DAY) return false;
    }

    return true;
  });
}
