// Shared helpers for Zara edge functions: model-call logging + gap insertion.
// Imported via relative path from supabase/functions/<fn>/index.ts.

const MODEL_RATES: Record<string, { in: number; out: number }> = {
  'google/gemini-2.5-pro':         { in: 1.25, out: 10.00 },
  'google/gemini-2.5-flash':       { in: 0.30, out: 2.50 },
  'google/gemini-2.5-flash-lite':  { in: 0.10, out: 0.40 },
  'google/gemini-3-flash-preview': { in: 0.30, out: 2.50 },
  'google/gemini-3.1-pro-preview': { in: 1.25, out: 10.00 },
  'openai/gpt-5':                  { in: 1.25, out: 10.00 },
  'openai/gpt-5-mini':             { in: 0.25, out: 2.00 },
};

export function estimateCost(model: string, inTok: number, outTok: number): number {
  const r = MODEL_RATES[model];
  if (!r) return 0;
  return (inTok / 1_000_000) * r.in + (outTok / 1_000_000) * r.out;
}

export async function logModelCall(admin: any, opts: {
  function_called: string;
  contact_id?: string | null;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
  success?: boolean;
  error?: string | null;
}) {
  const inTok = opts.input_tokens ?? 0;
  const outTok = opts.output_tokens ?? 0;
  try {
    await admin.from('crm_zara_model_calls').insert({
      function_called: opts.function_called,
      contact_id: opts.contact_id ?? null,
      model: opts.model,
      input_tokens: inTok,
      output_tokens: outTok,
      cost_usd: estimateCost(opts.model, inTok, outTok),
      latency_ms: opts.latency_ms ?? null,
      success: opts.success ?? true,
      error: opts.error ?? null,
    });
  } catch (e) {
    console.warn('[zara] logModelCall failed', e);
  }
}

export async function recordKnowledgeGap(admin: any, opts: {
  contact_id?: string | null;
  gap_type: 'project_fact' | 'area_fact' | 'faq_miss' | 'unit_data' | 'brochure_missing' | 'other';
  missing_value: string;
  draft_id?: string | null;
}) {
  try {
    await admin.from('crm_zara_knowledge_gaps').insert({
      contact_id: opts.contact_id ?? null,
      gap_type: opts.gap_type,
      missing_value: opts.missing_value.slice(0, 200),
      draft_id: opts.draft_id ?? null,
    });
  } catch (e) {
    console.warn('[zara] recordKnowledgeGap failed', e);
  }
}

// Extract {LOOKUP:...} placeholders from draft text and record each as a gap.
export async function captureLookupGaps(admin: any, text: string, contact_id: string | null, draft_id: string | null) {
  const matches = Array.from(text.matchAll(/\{LOOKUP:([^}]+)\}/gi));
  for (const m of matches) {
    const value = (m[1] || '').trim();
    if (!value) continue;
    let gap_type: any = 'other';
    if (/project|building|tower|condo/i.test(value)) gap_type = 'project_fact';
    else if (/area|neighbor|surrey|langley|fraser/i.test(value)) gap_type = 'area_fact';
    else if (/faq|question/i.test(value)) gap_type = 'faq_miss';
    else if (/unit|floorplan|sqft|bedroom/i.test(value)) gap_type = 'unit_data';
    else if (/deck|brochure|pdf/i.test(value)) gap_type = 'brochure_missing';
    await recordKnowledgeGap(admin, { contact_id, gap_type, missing_value: value, draft_id });
  }
}

// Estimate token counts when the model didn't return usage.
export function estimateTokens(s: string): number {
  return Math.ceil((s || '').length / 4);
}
