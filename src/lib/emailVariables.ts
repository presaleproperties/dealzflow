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

// Legacy / Presale / Lofty alias → canonical token (used by preview AND send).
// Keep this list in sync with the `legacy` map inside renderForRecipient
// below and the server-side `renderForLead` in crm-mass-send-email.
const LEGACY_ALIAS: Record<string, string> = {
  // Lead name
  name: 'lead.first_name',
  first_name: 'lead.first_name',
  firstname: 'lead.first_name',
  lead_first_name: 'lead.first_name',
  last_name: 'lead.last_name',
  lastname: 'lead.last_name',
  lead_last_name: 'lead.last_name',
  full_name: 'lead.full_name',
  lead_name: 'lead.full_name',
  contact_name: 'lead.full_name',
  // Lead contact
  email: 'lead.email',
  phone: 'lead.phone',
  // Lead location / preferences
  city: 'lead.city',
  preferred_city: 'lead.city',
  lead_city: 'lead.city',
  // Sender / agent
  agent_name: 'sender.full_name',
  agent_first_name: 'sender.first_name',
  agent_email: 'sender.email',
  agent_phone: 'sender.phone',
  sender_name: 'sender.full_name',
  sender_email: 'sender.email',
  // Project (Presale templates)
  project_name: 'project.name',
  project_location: 'project.city',
  project_city: 'project.city',
  project_url: 'project.url',
  project_developer: 'project.developer',
  brochure_url: 'project.brochure_url',
  // Links
  unsubscribe: 'link.unsubscribe',
  unsubscribe_link: 'link.unsubscribe',
};

/** Replace {{token}} occurrences with example values, leaving unknown tokens highlighted. */
export function renderWithSampleData(input: string): string {
  if (!input) return input;
  const lookup = (raw: string): string | undefined => {
    if (sampleMap[raw] !== undefined) return sampleMap[raw];
    const aliased = LEGACY_ALIAS[raw.toLowerCase()];
    if (aliased && sampleMap[aliased] !== undefined) return sampleMap[aliased];
    return undefined;
  };
  return input
    .replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, tok) => {
      const v = lookup(tok);
      if (v !== undefined) return v;
      return `<mark style="background:#fde68a;padding:0 2px;border-radius:2px">{{${tok}}}</mark>`;
    })
    .replace(/\{\s*\$\s*([a-zA-Z0-9_.]+)\s*\}/g, (_, tok) => {
      const v = lookup(tok);
      return v !== undefined ? v : `<mark style="background:#fde68a;padding:0 2px;border-radius:2px">{${'$'}${tok}}</mark>`;
    });
}

// ---------------------------------------------------------------------------
// Per-recipient rendering
// ---------------------------------------------------------------------------

export interface RecipientLead {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  intent?: string | null;
  budget_max?: number | string | null;
  timeframe?: string | null;
  home_type?: string | null;
  property_type_pref?: string | null;
  co_buyer_name?: string | null;
  co_buyer_email?: string | null;
  [key: string]: unknown;
}

export interface RecipientSender {
  first_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  signature?: string | null;
}

export interface RenderContext {
  lead?: RecipientLead | null;
  sender?: RecipientSender | null;
  links?: Partial<Record<'book_call' | 'unsubscribe' | 'preferences' | 'lead_portal', string>>;
  /** Free-form extras, e.g. deal/project fields when known. Keys use dot.notation. */
  extras?: Record<string, string | null | undefined>;
}

const fmtCurrency = (v: number | string | null | undefined): string => {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : v;
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
};

const todayValues = () => {
  const d = new Date();
  return {
    'today.date': d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    'today.year': String(d.getFullYear()),
  };
};

/**
 * Build the token → value map for a single recipient. Unknown / empty values
 * fall back to an empty string so the recipient never sees a raw `{{token}}`.
 */
export function buildRecipientValues(ctx: RenderContext): Record<string, string> {
  const lead = ctx.lead ?? {};
  const sender = ctx.sender ?? {};
  const links = ctx.links ?? {};
  const firstName = (lead.first_name ?? '').toString().trim();
  const lastName = (lead.last_name ?? '').toString().trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const senderFull = (sender.full_name ?? '').toString().trim();
  const senderFirst = (sender.first_name ?? senderFull.split(' ')[0] ?? '').toString().trim();

  const map: Record<string, string> = {
    'lead.first_name': firstName,
    'lead.last_name': lastName,
    'lead.full_name': fullName,
    'lead.email': (lead.email ?? '').toString(),
    'lead.phone': (lead.phone ?? '').toString(),
    'lead.city': (lead.city ?? '').toString(),
    'lead.intent': (lead.intent ?? '').toString(),
    'lead.budget_max': fmtCurrency(lead.budget_max ?? null),
    'lead.timeframe': (lead.timeframe ?? '').toString(),
    'lead.home_type': (lead.home_type ?? lead.property_type_pref ?? '').toString(),

    'cobuyer.full_name': (lead.co_buyer_name ?? '').toString(),
    'cobuyer.email': (lead.co_buyer_email ?? '').toString(),

    'sender.first_name': senderFirst,
    'sender.full_name': senderFull,
    'sender.email': (sender.email ?? '').toString(),
    'sender.phone': (sender.phone ?? '').toString(),
    'sender.signature': (sender.signature ?? '').toString(),

    'link.book_call': links.book_call ?? '',
    'link.unsubscribe': links.unsubscribe ?? '',
    'link.preferences': links.preferences ?? '',
    'link.lead_portal': links.lead_portal ?? '',

    ...todayValues(),
  };

  if (ctx.extras) {
    for (const [k, v] of Object.entries(ctx.extras)) {
      if (v !== undefined && v !== null) map[k] = String(v);
    }
  }
  return map;
}

/**
 * Replace every `{{token}}` (canonical or legacy alias) with the recipient's
 * actual value. Unknown / empty tokens render as an empty string — the
 * recipient never sees raw merge syntax.
 *
 * Legacy aliases supported (for older Presale templates):
 *   {{first_name}}    → lead.first_name
 *   {{last_name}}     → lead.last_name
 *   {{lead_name}}     → lead.full_name
 *   {{agent_name}}    → sender.full_name
 *   {{agent_email}}   → sender.email
 *   {{agent_phone}}   → sender.phone
 *   {{company_name}}  → "The Presale Properties Group"
 */
export function renderForRecipient(input: string, ctx: RenderContext): string {
  if (!input) return input;
  const values = buildRecipientValues(ctx);
  const legacy: Record<string, string> = {
    // Lead name
    name: values['lead.first_name'] ?? '',
    first_name: values['lead.first_name'] ?? '',
    firstname: values['lead.first_name'] ?? '',
    lead_first_name: values['lead.first_name'] ?? '',
    last_name: values['lead.last_name'] ?? '',
    lastname: values['lead.last_name'] ?? '',
    lead_last_name: values['lead.last_name'] ?? '',
    full_name: values['lead.full_name'] ?? '',
    lead_name: values['lead.full_name'] ?? '',
    contact_name: values['lead.full_name'] ?? '',
    email: values['lead.email'] ?? '',
    phone: values['lead.phone'] ?? '',
    // Lead location
    city: values['lead.city'] ?? '',
    preferred_city: values['lead.city'] ?? '',
    lead_city: values['lead.city'] ?? '',
    // Agent / sender
    agent_name: values['sender.full_name'] ?? '',
    agent_first_name: values['sender.first_name'] ?? '',
    agent_email: values['sender.email'] ?? '',
    agent_phone: values['sender.phone'] ?? '',
    sender_name: values['sender.full_name'] ?? '',
    sender_email: values['sender.email'] ?? '',
    // Project (Presale)
    project_name: values['project.name'] ?? '',
    project_location: values['project.city'] ?? '',
    project_city: values['project.city'] ?? '',
    project_url: values['project.url'] ?? '',
    project_developer: values['project.developer'] ?? '',
    brochure_url: values['project.brochure_url'] ?? '',
    company_name: 'The Presale Properties Group',
    unsubscribe: values['link.unsubscribe'] ?? '',
    unsubscribe_link: values['link.unsubscribe'] ?? '',
  };
  const resolve = (raw: string): string => {
    const tok = String(raw);
    if (tok in values) return values[tok];
    const lower = tok.toLowerCase();
    if (lower in legacy) return legacy[lower];
    return '';
  };
  // Run replacements in order so a later pattern doesn't accidentally re-match
  // an already-substituted value:
  //   1. {{token}}              — canonical Lovable syntax
  //   2. {{ lead.first_name }}  — same, with whitespace
  //   3. {$token}               — Lofty / Presale syntax (e.g. {$name}, {$unsubscribe})
  //   4. ${token}               — JS template-literal style
  return input
    .replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, raw) => resolve(raw))
    .replace(/\{\s*\$\s*([a-zA-Z0-9_.]+)\s*\}/g, (_, raw) => resolve(raw))
    .replace(/\$\{\s*([a-zA-Z0-9_.]+)\s*\}/g, (_, raw) => resolve(raw));
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
