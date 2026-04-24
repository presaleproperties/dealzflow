// Canonical catalog of email merge variables available across all CRM templates.
// Use {{token}} syntax in templates; the send pipeline replaces these with live data.

export interface EmailVariable {
  token: string;          // e.g. "lead.first_name"
  label: string;          // human label shown in the picker
  example: string;        // sample value rendered in the preview
  group: string;          // sidebar grouping
  description?: string;
}

export const EMAIL_VARIABLE_GROUPS = [
  'Lead',
  'Co-Buyer',
  'Deal',
  'Project',
  'Sender',
  'Links',
  'System',
] as const;

export const EMAIL_VARIABLES: EmailVariable[] = [
  // Lead
  { group: 'Lead', token: 'lead.first_name', label: 'First name', example: 'Sarah' },
  { group: 'Lead', token: 'lead.last_name', label: 'Last name', example: 'Patel' },
  { group: 'Lead', token: 'lead.full_name', label: 'Full name', example: 'Sarah Patel' },
  { group: 'Lead', token: 'lead.email', label: 'Email', example: 'sarah@example.com' },
  { group: 'Lead', token: 'lead.phone', label: 'Phone', example: '604-555-0142' },
  { group: 'Lead', token: 'lead.city', label: 'City', example: 'Vancouver' },
  { group: 'Lead', token: 'lead.intent', label: 'Buying intent', example: 'Buy in 3-6 months' },
  { group: 'Lead', token: 'lead.budget_max', label: 'Budget (max)', example: '$1,200,000' },
  { group: 'Lead', token: 'lead.timeframe', label: 'Timeframe', example: '3-6 months' },
  { group: 'Lead', token: 'lead.home_type', label: 'Preferred home type', example: 'Townhome' },

  // Co-buyer
  { group: 'Co-Buyer', token: 'cobuyer.full_name', label: 'Co-buyer name', example: 'Aman Patel' },
  { group: 'Co-Buyer', token: 'cobuyer.email', label: 'Co-buyer email', example: 'aman@example.com' },

  // Deal
  { group: 'Deal', token: 'deal.address', label: 'Property address', example: '1234 Oak St, Vancouver' },
  { group: 'Deal', token: 'deal.unit', label: 'Unit', example: 'Unit 408' },
  { group: 'Deal', token: 'deal.price', label: 'Price', example: '$895,000' },
  { group: 'Deal', token: 'deal.closing_date', label: 'Closing date', example: 'Mar 14, 2026' },
  { group: 'Deal', token: 'deal.stage', label: 'Stage', example: 'Under Contract' },
  { group: 'Deal', token: 'deal.link', label: 'Deal link (CRM)', example: 'https://dealzflow.ca/crm/deals/abc' },

  // Project
  { group: 'Project', token: 'project.name', label: 'Project name', example: 'Eden Phase 2' },
  { group: 'Project', token: 'project.developer', label: 'Developer', example: 'Polygon Homes' },
  { group: 'Project', token: 'project.city', label: 'Project city', example: 'Surrey' },
  { group: 'Project', token: 'project.url', label: 'Project page URL', example: 'https://presaleproperties.com/eden' },
  { group: 'Project', token: 'project.brochure_url', label: 'Brochure link', example: 'https://...' },

  // Sender
  { group: 'Sender', token: 'sender.first_name', label: 'Your first name', example: 'Uzair' },
  { group: 'Sender', token: 'sender.full_name', label: 'Your full name', example: 'Uzair Muhammad' },
  { group: 'Sender', token: 'sender.email', label: 'Your email', example: 'uzair@dealzflow.ca' },
  { group: 'Sender', token: 'sender.phone', label: 'Your phone', example: '604-555-0100' },
  { group: 'Sender', token: 'sender.signature', label: 'Email signature', example: '— Uzair, DealzFlow' },

  // Links
  { group: 'Links', token: 'link.book_call', label: 'Book a call link', example: 'https://calendly.com/uzair/intro' },
  { group: 'Links', token: 'link.unsubscribe', label: 'Unsubscribe link', example: 'https://...unsubscribe' },
  { group: 'Links', token: 'link.preferences', label: 'Email preferences', example: 'https://...preferences' },
  { group: 'Links', token: 'link.lead_portal', label: 'Lead portal', example: 'https://presaleproperties.com/portal' },

  // System
  { group: 'System', token: 'today.date', label: 'Today’s date', example: 'April 24, 2026' },
  { group: 'System', token: 'today.year', label: 'Current year', example: '2026' },
];

export const VARIABLE_TOKENS = new Set(EMAIL_VARIABLES.map(v => v.token));

const sampleMap: Record<string, string> = Object.fromEntries(
  EMAIL_VARIABLES.map(v => [v.token, v.example]),
);

/** Replace {{token}} occurrences with example values, leaving unknown tokens highlighted. */
export function renderWithSampleData(input: string): string {
  if (!input) return input;
  return input.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, tok) => {
    if (sampleMap[tok] !== undefined) return sampleMap[tok];
    return `<mark style="background:#fde68a;padding:0 2px;border-radius:2px">{{${tok}}}</mark>`;
  });
}

/** Find all merge tokens used in a string (deduped). */
export function extractTokens(input: string): string[] {
  if (!input) return [];
  const out = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) out.add(m[1]);
  return [...out];
}

/** Tokens used in template that don't exist in the catalog (likely typos). */
export function findUnknownTokens(input: string): string[] {
  return extractTokens(input).filter(t => !VARIABLE_TOKENS.has(t));
}
