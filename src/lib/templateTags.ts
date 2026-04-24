// Derive filter tags for read-only Presale templates surfaced via the bridge.
// Tags are inferred from name + subject + category (no DB write needed).

import type { BridgeTemplate } from '@/hooks/useBridgeEmail';

export type TemplateTag =
  | 'Presale'
  | 'Resale'
  | 'Offer'
  | 'Newsletter'
  | 'Welcome'
  | 'Follow-up'
  | 'Other';

export const TEMPLATE_TAG_ORDER: TemplateTag[] = [
  'Presale',
  'Resale',
  'Offer',
  'Newsletter',
  'Welcome',
  'Follow-up',
  'Other',
];

const RULES: Array<{ tag: TemplateTag; test: RegExp }> = [
  { tag: 'Offer', test: /\b(offer|promo|incentive|discount|deal|exclusive|limited|bonus)\b/i },
  { tag: 'Welcome', test: /\b(welcome|introduction|intro|onboard|nice to meet)\b/i },
  { tag: 'Follow-up', test: /\b(follow[-\s]?up|check[-\s]?in|reminder|nudge|touch[-\s]?base)\b/i },
  { tag: 'Newsletter', test: /\b(newsletter|weekly|monthly|digest|market update|update)\b/i },
  { tag: 'Resale', test: /\b(resale|re-sale|listing|mls|sold|just listed|open house)\b/i },
  { tag: 'Presale', test: /\b(presale|pre-sale|launch|new project|floor plan|brochure|deposit)\b/i },
];

export function inferTemplateTags(t: BridgeTemplate): TemplateTag[] {
  const haystack = [t.name, t.subject, t.category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const tags = new Set<TemplateTag>();
  for (const { tag, test } of RULES) {
    if (test.test(haystack)) tags.add(tag);
  }
  // Category fallback — Presale's API uses lower-cased category strings.
  const cat = (t.category || '').toLowerCase();
  if (cat.includes('presale')) tags.add('Presale');
  if (cat.includes('resale')) tags.add('Resale');
  if (cat.includes('offer') || cat.includes('promo')) tags.add('Offer');
  if (cat.includes('newsletter')) tags.add('Newsletter');
  if (cat.includes('welcome')) tags.add('Welcome');

  if (tags.size === 0) tags.add('Other');
  return [...tags].sort(
    (a, b) => TEMPLATE_TAG_ORDER.indexOf(a) - TEMPLATE_TAG_ORDER.indexOf(b),
  );
}

/** Returns count map of tag → number of templates carrying that tag. */
export function countTags(templates: BridgeTemplate[]): Record<TemplateTag, number> {
  const counts: Record<TemplateTag, number> = {
    Presale: 0, Resale: 0, Offer: 0, Newsletter: 0, Welcome: 0, 'Follow-up': 0, Other: 0,
  };
  for (const t of templates) {
    for (const tag of inferTemplateTags(t)) counts[tag]++;
  }
  return counts;
}
