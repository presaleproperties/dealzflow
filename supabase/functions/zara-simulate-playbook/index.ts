// zara-simulate-playbook — preview a playbook without saving anything.
// POST { contact_id?, sample_lead?, trigger_conditions, behavior_sequence }
// Returns { trigger_match, match_reasons[], lead_summary, steps[{...,preview?}] }
// NEVER inserts drafts, never sends messages, never logs gaps.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FALLBACK_SYSTEM_PROMPT = `You are Zara, the digital concierge for The Presale Properties Group, a Surrey BC presale condo brokerage.
You draft OUTBOUND messages to warm leads. Match contact's preferred language. 1–2 sentences. ONE micro-CTA. Never invent prices or completion dates.
For SMS/WhatsApp: max ~280 chars, no greeting, no signature. For Email: warm subject (max 50 chars), 2–4 short lines, no signature.
Return STRICT JSON: { "subject": "string|null", "body": "string", "reasoning": "1 line", "confidence": 0.0-1.0, "language": "en|pa|hi" }`;

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function callAI(model: string, system: string, user: string): Promise<any> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Error('LOVABLE_API_KEY missing');
  const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`AI ${r.status}: ${text.slice(0, 300)}`);
  const parsed = JSON.parse(text);
  return JSON.parse(parsed?.choices?.[0]?.message?.content ?? '{}');
}

type TriggerConditions = {
  tags?: string[];           // ALL must be present
  any_tags?: string[];       // ANY must be present
  score_min?: number;        // engagement / behavior score
  buyer_type?: string;       // contact_type or buyer_type match
  status?: string | string[];
  language?: string | string[];
  has_email?: boolean;
  has_phone?: boolean;
};

function evaluateTrigger(lead: any, score: number, t: TriggerConditions): { match: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let ok = true;
  const tags: string[] = (lead.tags as string[] | null) ?? [];

  if (t.tags?.length) {
    const missing = t.tags.filter((x) => !tags.includes(x));
    if (missing.length) { ok = false; reasons.push(`missing tags: ${missing.join(', ')}`); }
    else reasons.push(`has all required tags`);
  }
  if (t.any_tags?.length) {
    const has = t.any_tags.some((x) => tags.includes(x));
    if (!has) { ok = false; reasons.push(`needs any of: ${t.any_tags.join(', ')}`); }
    else reasons.push(`matches any-of tag list`);
  }
  if (typeof t.score_min === 'number') {
    if (score < t.score_min) { ok = false; reasons.push(`score ${score} < ${t.score_min}`); }
    else reasons.push(`score ${score} ≥ ${t.score_min}`);
  }
  if (t.buyer_type) {
    const bt = (lead.contact_type ?? lead.buyer_type ?? '').toString().toLowerCase();
    if (bt !== t.buyer_type.toLowerCase()) { ok = false; reasons.push(`buyer_type=${bt || '∅'} ≠ ${t.buyer_type}`); }
    else reasons.push(`buyer_type matches`);
  }
  if (t.status) {
    const want = Array.isArray(t.status) ? t.status : [t.status];
    if (!want.includes(lead.status ?? '')) { ok = false; reasons.push(`status ${lead.status ?? '∅'} ∉ [${want.join(',')}]`); }
    else reasons.push(`status matches`);
  }
  if (t.language) {
    const want = Array.isArray(t.language) ? t.language : [t.language];
    if (!want.map((s) => s.toLowerCase()).includes((lead.language ?? '').toLowerCase())) {
      ok = false; reasons.push(`language ${lead.language ?? '∅'} ∉ [${want.join(',')}]`);
    } else reasons.push(`language matches`);
  }
  if (t.has_email && !lead.email) { ok = false; reasons.push('no email on file'); }
  if (t.has_phone && !lead.phone) { ok = false; reasons.push('no phone on file'); }

  if (!t || Object.keys(t).length === 0) {
    return { match: true, reasons: ['no trigger conditions — always matches'] };
  }
  return { match: ok, reasons };
}

function fmtDelay(min?: number): string {
  if (!min || min <= 0) return 'immediately';
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round((min / 60) * 10) / 10} h`;
  return `${Math.round((min / 1440) * 10) / 10} d`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: {
    contact_id?: string;
    sample_lead?: any;
    trigger_conditions?: TriggerConditions;
    behavior_sequence?: any[];
    playbook_name?: string;
  };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  const trig = body.trigger_conditions ?? {};
  const seq = Array.isArray(body.behavior_sequence) ? body.behavior_sequence : [];
  if (seq.length === 0) return json({ error: 'behavior_sequence is empty' }, 400);

  // Resolve the test lead.
  let lead: any;
  if (body.contact_id) {
    const { data, error } = await admin
      .from('crm_contacts')
      .select('id, first_name, last_name, email, phone, language, tags, status, contact_type, last_touch_at, created_at')
      .eq('id', body.contact_id)
      .maybeSingle();
    if (error || !data) return json({ error: 'contact_not_found' }, 404);
    lead = data;
  } else {
    lead = {
      id: 'sample',
      first_name: body.sample_lead?.first_name ?? 'Sample',
      last_name: body.sample_lead?.last_name ?? 'Lead',
      email: body.sample_lead?.email ?? 'sample@example.com',
      phone: body.sample_lead?.phone ?? null,
      language: body.sample_lead?.language ?? 'en',
      tags: Array.isArray(body.sample_lead?.tags) ? body.sample_lead.tags : [],
      status: body.sample_lead?.status ?? 'New Lead',
      contact_type: body.sample_lead?.contact_type ?? null,
      last_touch_at: null,
      created_at: new Date().toISOString(),
    };
  }

  // Pull a behavior/engagement score if available.
  let score = 0;
  try {
    const { data } = await admin.rpc('crm_zara_behavior_score' as any);
    if (typeof data === 'number') score = data;
  } catch { /* function may not exist; ignore */ }
  if (lead.id !== 'sample') {
    try {
      const { data } = await admin.from('crm_contacts').select('engagement_score').eq('id', lead.id).maybeSingle();
      if (data && typeof (data as any).engagement_score === 'number') score = (data as any).engagement_score;
    } catch { /* optional */ }
  } else if (typeof body.sample_lead?.score === 'number') {
    score = body.sample_lead.score;
  }

  const evalResult = evaluateTrigger(lead, score, trig);

  // Load active system prompt + custom instructions.
  const [{ data: activePrompt }, { data: orgCtx }, { data: settings }] = await Promise.all([
    admin.from('zara_system_prompts').select('prompt_text').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('zara_org_context').select('custom_instructions').eq('id', 1).maybeSingle(),
    admin.from('crm_zara_settings').select('model_draft, model_classify').eq('id', 1).maybeSingle(),
  ]);
  let systemPrompt = activePrompt?.prompt_text || FALLBACK_SYSTEM_PROMPT;
  if (orgCtx?.custom_instructions?.trim()) {
    systemPrompt += `\n\nAdditional workspace context:\n${orgCtx.custom_instructions.trim()}`;
  }
  const model = settings?.model_draft || settings?.model_classify || 'google/gemini-3-flash-preview';

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead';
  const sendChannels = new Set(['email', 'sms', 'whatsapp']);

  // Render preview for each step. Only AI-call sending steps; otherwise label-only.
  const steps: any[] = [];
  let cumulativeMin = 0;
  for (let i = 0; i < seq.length; i++) {
    const s = seq[i] ?? {};
    const action = String(s.action ?? s.type ?? 'send').toLowerCase();
    const channel = String(s.channel ?? (action === 'send_sms' ? 'sms' : action === 'send_whatsapp' ? 'whatsapp' : 'email')).toLowerCase();
    const delay = Number(s.delay_minutes ?? s.delay ?? 0);
    cumulativeMin += delay;

    const isSend = sendChannels.has(channel) && (action.startsWith('send') || action === 'message' || action === 'reach_out' || action === 'check_in' || action === 'nudge' || action === 'follow_up');

    const stepEntry: any = {
      step: i + 1,
      action,
      channel: isSend ? channel : (s.channel ?? null),
      delay_minutes: delay,
      delay_label: fmtDelay(delay),
      cumulative_after: fmtDelay(cumulativeMin),
      exit_on_reply: !!s.exit_on_reply,
      raw: s,
    };

    if (!isSend) {
      stepEntry.preview = { kind: 'noop', note: s.note ?? `${action} step (no message)` };
      steps.push(stepEntry);
      continue;
    }

    if (!evalResult.match) {
      stepEntry.preview = { kind: 'skipped', note: 'trigger did not match — message not generated' };
      steps.push(stepEntry);
      continue;
    }

    const intent = String(s.intent ?? s.purpose ?? action).replace(/_/g, ' ');
    const userMsg = `Playbook: ${body.playbook_name ?? 'Untitled'}
Step ${i + 1} of ${seq.length} — ${action}
Channel: ${channel}
Delay since previous step: ${fmtDelay(delay)} (cumulative since enrollment: ${fmtDelay(cumulativeMin)})
Intent: ${intent}
Contact: ${fullName} (lang: ${lead.language || 'en'}, status: ${lead.status ?? 'unknown'}, tags: ${(lead.tags ?? []).join(', ') || 'none'})
${s.context ? `Extra context: ${s.context}\n` : ''}
Draft this step's outbound message per the system rules. Strict JSON only.`;

    try {
      const ai = await callAI(model, systemPrompt, userMsg);
      const text = String(ai?.body ?? '').trim();
      const subject = channel === 'email' ? (String(ai?.subject ?? '').trim() || `Quick note for ${lead.first_name ?? 'you'}`) : null;
      stepEntry.preview = {
        kind: 'message',
        subject,
        body: text,
        reasoning: String(ai?.reasoning ?? '').slice(0, 240),
        confidence: Math.max(0, Math.min(1, Number(ai?.confidence ?? 0.6))),
        language: ai?.language ?? lead.language ?? 'en',
      };
    } catch (e) {
      stepEntry.preview = { kind: 'error', error: String(e) };
    }
    steps.push(stepEntry);
  }

  return json({
    ok: true,
    trigger_match: evalResult.match,
    match_reasons: evalResult.reasons,
    lead_summary: {
      id: lead.id,
      name: fullName,
      email: lead.email,
      phone: lead.phone,
      language: lead.language,
      status: lead.status,
      tags: lead.tags,
      score,
    },
    model,
    total_duration: fmtDelay(cumulativeMin),
    step_count: steps.length,
    steps,
  });
});
