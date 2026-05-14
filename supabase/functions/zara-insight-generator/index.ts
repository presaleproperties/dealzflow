// zara-insight-generator — daily 7am UTC cron.
// Summarizes the last 7d of Zara audit log + draft outcomes via Sonnet-class
// model and writes 1-3 insight rows to crm_zara_insights.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { logModelCall, estimateTokens } from '../_shared/zara-logging.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = `You are Zara's coach. You analyze the last 7 days of her behavior and produce
1 to 3 short insights. Each insight is a single sentence diagnosing a pattern, plus a
suggested action. Return STRICT JSON: { "insights": [ { "insight": "...", "suggested_action": "...", "severity": "info|warning|critical" } ] }`;

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const startDate = since.slice(0, 10);

  // Aggregate audit log buckets
  const { data: audit } = await admin.from('crm_audit_log')
    .select('action, meta')
    .eq('actor_label', 'zara')
    .gte('occurred_at', since)
    .limit(1000);

  const counts: Record<string, number> = {};
  (audit ?? []).forEach((r: any) => { counts[r.action] = (counts[r.action] ?? 0) + 1; });

  // Draft outcomes
  const { data: drafts } = await admin.from('crm_zara_drafts')
    .select('status, trigger_kind, channel')
    .gte('created_at', since)
    .limit(1000);

  const draftStats: Record<string, number> = {};
  (drafts ?? []).forEach((d: any) => {
    const k = `${d.status}:${d.trigger_kind}`;
    draftStats[k] = (draftStats[k] ?? 0) + 1;
  });

  // Unresolved gaps
  const { count: unresolvedGaps } = await admin
    .from('crm_zara_knowledge_gaps')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false);

  const summary = {
    audit_action_counts: counts,
    draft_outcome_counts: draftStats,
    unresolved_knowledge_gaps: unresolvedGaps ?? 0,
    period: `${startDate} to ${today}`,
  };

  const userMsg = `Here's Zara's last 7 days:\n\n${JSON.stringify(summary, null, 2)}\n\nProduce 1-3 insights as STRICT JSON.`;
  const model = 'google/gemini-2.5-pro';
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return json({ ok: false, error: 'LOVABLE_API_KEY missing' }, 500);

  const t0 = Date.now();
  let aiOut: any = null;
  let errMsg: string | null = null;
  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg }],
        response_format: { type: 'json_object' },
      }),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`ai ${r.status}: ${text.slice(0, 200)}`);
    const parsed = JSON.parse(text);
    aiOut = JSON.parse(parsed?.choices?.[0]?.message?.content ?? '{}');
  } catch (e) {
    errMsg = String(e);
  }

  await logModelCall(admin, {
    function_called: 'zara-insight-generator',
    model,
    input_tokens: estimateTokens(SYSTEM + userMsg),
    output_tokens: aiOut ? estimateTokens(JSON.stringify(aiOut)) : 0,
    latency_ms: Date.now() - t0,
    success: !errMsg,
    error: errMsg,
  });

  if (errMsg) return json({ ok: false, error: errMsg }, 500);

  const insights = Array.isArray(aiOut?.insights) ? aiOut.insights.slice(0, 3) : [];
  let written = 0;
  for (const ins of insights) {
    const insight_text = String(ins?.insight ?? '').trim();
    if (!insight_text) continue;
    const severity = ['info', 'warning', 'critical'].includes(ins?.severity) ? ins.severity : 'info';
    await admin.from('crm_zara_insights').insert({
      period_start: startDate,
      period_end: today,
      insight_text,
      suggested_action: String(ins?.suggested_action ?? '').trim() || null,
      severity,
    });
    written++;
  }

  await admin.from('crm_audit_log').insert({
    action: 'zara.tick.insights',
    actor_label: 'zara',
    meta: { insights_written: written, success: true },
  });

  return json({ ok: true, insights_written: written });
});
