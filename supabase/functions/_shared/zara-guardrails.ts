// Shared Zara helpers: language detection, guardrails, Levenshtein.
export function detectLanguage(text: string): 'en' | 'hi' | 'ur' | 'pa' | 'te' {
  if (/[\u0900-\u097F]/.test(text)) return 'hi'; // Devanagari → Hindi
  if (/[\u0A00-\u0A7F]/.test(text)) return 'pa'; // Gurmukhi → Punjabi
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) return 'ur'; // Arabic → Urdu
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te'; // Telugu
  return 'en';
}

export interface GuardrailContext {
  draft_text: string;
  draft_language: string;
  detected_inbound_lang: string;
  confidence: number;
  escalate: boolean;
  contact_tags: string[];
  contact_budget_max?: number | null;
  context_event_texts: string[]; // concatenated history text for the "is price already in context" check
}

export function evaluateGuardrails(g: GuardrailContext): string[] {
  const hits: string[] = [];
  const draftLower = g.draft_text.toLowerCase();

  // 1. price_quoted_without_source — regex $ amounts or deposit/%
  const priceRegex = /\$[\d,]{4,}|\d+\s?%|\bdeposit\b/i;
  if (priceRegex.test(g.draft_text)) {
    const ctxText = g.context_event_texts.join(' ').toLowerCase();
    const draftMatches = g.draft_text.match(/\$[\d,]{4,}/g) || [];
    const allInCtx = draftMatches.every((m) => ctxText.includes(m.toLowerCase()));
    if (!allInCtx || !priceRegex.test(g.context_event_texts.join(' '))) {
      hits.push('price_quoted_without_source');
    }
  }

  // 2. legal_or_financial_topic
  if (/\b(lawyer|legal|mortgage|tax|immigrat|gst|ptt)\b/i.test(draftLower)) {
    hits.push('legal_or_financial_topic');
  }

  // 3. complaint_signal
  if (/\b(complain|refund|cancel|sue)\b/i.test(draftLower)) {
    hits.push('complaint_signal');
  }

  // 4. high_value_lead
  if ((g.contact_budget_max ?? 0) >= 1_500_000 || g.contact_tags.includes('vip')) {
    hits.push('high_value_lead');
  }

  // 5. low_confidence
  if (g.confidence < 0.7) hits.push('low_confidence');

  // 6. language_mismatch
  if (g.draft_language !== g.detected_inbound_lang) hits.push('language_mismatch');

  // 7. self_escalated
  if (g.escalate) hits.push('self_escalated');

  return hits;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Strict v1–v5 UUID matcher. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns the input as a normalized UUID string if it's a valid UUID, else null. */
export function coerceUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return UUID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

/**
 * Resolve a crm_contacts.assigned_to value (which may be a display-name OR a
 * raw UUID OR garbage) into a guaranteed-valid crm_team.user_id UUID.
 *
 * Order of attempts:
 *   1. Already a valid UUID? pass through.
 *   2. Look up crm_team by display_name.
 *   3. Look up crm_team by email (some imports stash the email here).
 *   4. Fail → null.
 *
 * Final result is re-validated against UUID_RE before being returned, so the
 * caller can safely insert into a UUID-typed column without risking a 500.
 */
export async function resolveAssignedToUuid(
  admin: any,
  raw: string | null | undefined,
): Promise<string | null> {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;

  // 1. Pass-through if already a UUID
  const direct = coerceUuid(value);
  if (direct) return direct;

  // 2. & 3. Lookup by display_name or email
  try {
    const { data, error } = await admin
      .from('crm_team')
      .select('user_id')
      .or(`display_name.eq.${value},email.eq.${value.toLowerCase()}`)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('[resolveAssignedToUuid] query error:', error.message, 'for', value);
      return null;
    }
    return coerceUuid(data?.user_id);
  } catch (e) {
    console.warn('[resolveAssignedToUuid] caught:', e, 'for', value);
    return null;
  }
}


export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export const ZARA_SYSTEM_PROMPT = `You are Zara, the AI assistant at The Presale Properties Group, a Surrey BC team exclusively representing BUYERS for new construction presale condos/townhomes in Metro Vancouver / Fraser Valley (Surrey, Langley, Abbotsford, Coquitlam, Delta, Burnaby South).

Draft the next reply for a human to approve. Tone: warm, direct, no fluff. Match the lead's language exactly (en|hi|ur|pa|te) and formality.

Hard rules:
(1) Never quote price/deposit/completion-date/sqft you weren't given in context — say "Let me pull the latest from the developer" and set escalate=true.
(2) Never give legal/tax/mortgage/immigration advice — escalate.
(3) Never promise units, lock pricing, or commit on team's behalf. Default CTA: book 15-min call with Uzair.
(4) Complaints/anger — brief, acknowledge, escalate.
(5) Budget >=$1.5M or 'vip' tag — draft as usual but set escalate=true.
(6) South Asian code-switching is fine, match the lead's style.

Brand voice: represent buyer never developer, "400+ clients only 2 defaults" as proof when relevant, "VIP pricing not public" only when relevant.

Output ONLY valid JSON: {"draft_text":string, "draft_subject":string|null (email only), "draft_language":"en"|"hi"|"ur"|"pa"|"te", "intent":"greeting"|"pricing_ask"|"project_info"|"booking_ask"|"objection"|"complaint"|"unknown", "confidence":number, "reasoning":string, "escalate":boolean, "escalate_reason":string|null}`;
