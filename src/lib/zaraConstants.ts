// Constants shared by Zara admin pages + edge functions.
export const ZARA_TEAM_ID = 'e8d34039-c314-4220-a840-9909a45d2f08';
export const ZARA_SLUG = 'zara';

// Hardcoded list of edge functions Zara owns. Update when new ones land.
export const ZARA_EDGE_FUNCTIONS = [
  'zara-reply',
  'zara-plan-outbound',
  'zara-draft-action',
  'zara-sync-identity',
  'zara-api',
  'zara-insight-generator',
] as const;

// Approximate $/1M tokens (input, output) for cost estimates.
// Update when pricing changes.
export const MODEL_RATES: Record<string, { in: number; out: number; bucket: string }> = {
  'google/gemini-2.5-pro':           { in: 1.25, out: 10.00, bucket: 'Sonnet-class' },
  'google/gemini-2.5-flash':         { in: 0.30, out: 2.50,  bucket: 'Haiku-class' },
  'google/gemini-2.5-flash-lite':    { in: 0.10, out: 0.40,  bucket: 'Haiku-class' },
  'google/gemini-3-flash-preview':   { in: 0.30, out: 2.50,  bucket: 'Haiku-class' },
  'google/gemini-3.1-pro-preview':   { in: 1.25, out: 10.00, bucket: 'Sonnet-class' },
  'openai/gpt-5':                    { in: 1.25, out: 10.00, bucket: 'Sonnet-class' },
  'openai/gpt-5-mini':               { in: 0.25, out: 2.00,  bucket: 'Haiku-class' },
  'voyage':                          { in: 0.06, out: 0.06,  bucket: 'Voyage' },
};

export function modelBucket(model: string): string {
  return MODEL_RATES[model]?.bucket ?? 'Other';
}

export function estimateCost(model: string, inTok: number, outTok: number): number {
  const r = MODEL_RATES[model];
  if (!r) return 0;
  return (inTok / 1_000_000) * r.in + (outTok / 1_000_000) * r.out;
}
