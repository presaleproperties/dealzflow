// zara-suggest-reply — drafts a reply with Claude and queues for human approval.
// Phase 1: heuristic intent classifier → per-intent system prompt → Haiku draft.
// If guardrails fire (legal/complaint/high-value/low-confidence/self-escalated),
// auto re-draft with Sonnet for higher quality. Persists escalate, latency,
// and escalation_model for Phase 2 analytics.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  buildZaraSystemPrompt,
  coerceUuid,
  corsHeaders,
  detectLanguage,
  evaluateGuardrails,
  guessIntent,
  resolveAssignedToUuid,
  shouldEscalateModel,
  ZARA_MODEL_DEFAULT,
  ZARA_MODEL_ESCALATION,
  type ZaraIntent,
} from '../_shared/zara-guardrails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { contactId, channel, inboundText, inboundAt, inboundEventId } = await req.json();
    if (!contactId || !channel || !inboundText) return json({ error: 'contactId, channel, inboundText required' }, 400);

    // 1. Mode gate
    const { data: settings } = await admin.from('zara_settings').select('mode').eq('id', 1).maybeSingle();
    if (!settings || settings.mode === 'off') return json({ skipped: true, reason: 'zara_off' });

    // 2. Contact gate
    const { data: contact } = await admin.from('crm_contacts').select('*').eq('id', contactId).maybeSingle();
    if (!contact) return json({ error: 'contact_not_found' }, 404);
    const tags: string[] = contact.tags ?? [];
    const isTestContact = tags.includes('zara_test_contact');
    if (!contact.zara_enabled && !isTestContact) {
      return json({ skipped: true, reason: 'zara_not_enabled_for_contact' });
    }

    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'anthropic_key_missing', message: 'Add ANTHROPIC_API_KEY to project secrets.' }, 500);
    }

    // 3. Context
    const [{ data: memoryRow }, { data: events }] = await Promise.all([
      admin.from('zara_lead_memory').select('summary, signals').eq('contact_id', contactId).maybeSingle(),
      admin
        .from('crm_engagement_events')
        .select('event_type, source, direction, occurred_at, metadata')
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: false })
        .limit(10),
    ]);

    // 4. Language detect
    const detectedLang = detectLanguage(inboundText);

    // 5. Build user prompt
    const eventLines =
      (events ?? [])
        .map((e: any) => {
          const meta = e.metadata ? JSON.stringify(e.metadata).slice(0, 180) : '';
          return `- [${e.occurred_at}] ${e.event_type} (${e.source}${e.direction ? '/' + e.direction : ''}) ${meta}`;
        })
        .join('\n') || '(no prior events)';

    const userPrompt = `LEAD:
- name: ${[contact.first_name, contact.last_name].filter(Boolean).join(' ') || '(unknown)'}
- pipeline stage: ${contact.status ?? 'unknown'}
- lead_type: ${contact.lead_type ?? 'unknown'}
- tags: ${tags.join(', ') || '(none)'}
- project: ${contact.project_interest ?? 'none specified'}
- budget hint: min=${contact.budget_min ?? '?'} max=${contact.budget_max ?? '?'}
- languages: ${(contact.languages ?? []).join(', ') || 'unknown'}
- detected inbound language: ${detectedLang}

MEMORY SUMMARY:
${memoryRow?.summary ?? '(no memory yet)'}

LAST 10 EVENTS:
${eventLines}

INBOUND MESSAGE (channel=${channel}, at=${inboundAt}):
"""${inboundText}"""

Draft Zara's reply now. Return ONLY the JSON object.`;

    // 6. Two-tier model routing.
    // Pass 1: heuristic intent + Haiku with intent-specific system prompt.
    const guessedIntent: ZaraIntent = guessIntent(inboundText);

    const callClaude = async (model: string, intent: ZaraIntent) => {
      const t0 = Date.now();
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: buildZaraSystemPrompt(intent),
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      const body = await res.json();
      return { ok: res.ok, body, latency: Date.now() - t0 };
    };

    let attempt = await callClaude(ZARA_MODEL_DEFAULT, guessedIntent);
    if (!attempt.ok) {
      console.error('[zara-suggest-reply] claude error (pass 1)', attempt.body);
      return json({ error: 'claude_failed', detail: attempt.body }, 502);
    }
    let usedModel = ZARA_MODEL_DEFAULT;
    let escalationModel: string | null = null;
    let totalLatency = attempt.latency;
    let rawText = attempt.body?.content?.[0]?.text ?? '';
    let input_tokens = attempt.body?.usage?.input_tokens ?? null;
    let output_tokens = attempt.body?.usage?.output_tokens ?? null;

    // 7. Parse JSON
    const parseDraft = (txt: string): any | null => {
      try {
        const m = txt.match(/\{[\s\S]*\}/);
        return JSON.parse(m ? m[0] : txt);
      } catch {
        return null;
      }
    };
    let parsed = parseDraft(rawText);
    if (!parsed) return json({ error: 'parse_failed', raw: rawText }, 502);

    // 8. Guardrails — run on first-pass output
    let guardrails_hit = evaluateGuardrails({
      draft_text: parsed.draft_text ?? '',
      draft_language: parsed.draft_language ?? 'en',
      detected_inbound_lang: detectedLang,
      confidence: Number(parsed.confidence ?? 0),
      escalate: Boolean(parsed.escalate),
      contact_tags: tags,
      contact_budget_max: contact.budget_max,
      context_event_texts: (events ?? []).map((e: any) => JSON.stringify(e.metadata ?? {})),
    });

    // 8b. If guardrails fire and the model's intent is known, re-draft with Sonnet
    //     using the model-reported intent (more accurate than the heuristic).
    const modelIntent: ZaraIntent = (parsed.intent as ZaraIntent) ?? guessedIntent;
    if (shouldEscalateModel(guardrails_hit, Number(parsed.confidence ?? 0))) {
      const retry = await callClaude(ZARA_MODEL_ESCALATION, modelIntent);
      if (retry.ok) {
        const retryParsed = parseDraft(retry.body?.content?.[0]?.text ?? '');
        if (retryParsed) {
          parsed = retryParsed;
          usedModel = ZARA_MODEL_ESCALATION;
          escalationModel = ZARA_MODEL_ESCALATION;
          totalLatency += retry.latency;
          input_tokens = (input_tokens ?? 0) + (retry.body?.usage?.input_tokens ?? 0);
          output_tokens = (output_tokens ?? 0) + (retry.body?.usage?.output_tokens ?? 0);
          // Re-evaluate guardrails on the escalated draft
          guardrails_hit = evaluateGuardrails({
            draft_text: parsed.draft_text ?? '',
            draft_language: parsed.draft_language ?? 'en',
            detected_inbound_lang: detectedLang,
            confidence: Number(parsed.confidence ?? 0),
            escalate: Boolean(parsed.escalate),
            contact_tags: tags,
            contact_budget_max: contact.budget_max,
            context_event_texts: (events ?? []).map((e: any) => JSON.stringify(e.metadata ?? {})),
          });
        }
      } else {
        console.warn('[zara-suggest-reply] escalation_failed (keeping pass 1)', retry.body);
      }
    }

    // Resolve contact.assigned_to (stored as display_name string) into a user UUID
    // for the zara_suggested_replies.assigned_to UUID column. Falls back to null
    // on no match or error so the insert never fails.
    const assignedUserId = await resolveAssignedToUuid(admin, contact.assigned_to);
    const safeAssignedTo = coerceUuid(assignedUserId);

    // 9. Insert draft
    const { data: draft, error: insertErr } = await admin
      .from('zara_suggested_replies')
      .insert({
        contact_id: contactId,
        inbound_event_id: inboundEventId ?? null,
        channel,
        inbound_text: inboundText,
        inbound_at: inboundAt ?? new Date().toISOString(),
        draft_text: parsed.draft_text ?? '',
        draft_subject: parsed.draft_subject ?? null,
        draft_language: parsed.draft_language ?? detectedLang,
        intent: parsed.intent ?? modelIntent,
        confidence: Number(parsed.confidence ?? 0),
        reasoning: parsed.reasoning ?? null,
        guardrails_hit,
        escalate: Boolean(parsed.escalate),
        escalate_reason: parsed.escalate_reason ?? null,
        latency_ms: totalLatency,
        escalation_model: escalationModel,
        assigned_to: safeAssignedTo,
        model: usedModel,
        input_tokens,
        output_tokens,
      })
      .select()
      .single();
    if (insertErr) {
      console.error('[zara-suggest-reply] insert_failed', {
        contact_id: contactId,
        channel,
        received_assigned_to: contact.assigned_to ?? null,
        received_assigned_to_type: typeof contact.assigned_to,
        resolved_user_id: assignedUserId,
        coerced_assigned_to: safeAssignedTo,
        pg_error: insertErr.message,
        pg_details: (insertErr as any).details ?? null,
        pg_hint: (insertErr as any).hint ?? null,
        pg_code: (insertErr as any).code ?? null,
      });
      return json({
        error: 'insert_failed',
        detail: insertErr.message,
        diagnostics: {
          received_assigned_to: contact.assigned_to ?? null,
          resolved_user_id: assignedUserId,
          coerced_assigned_to: safeAssignedTo,
        },
      }, 500);
    }

    // 10. Fire-and-forget engagement event
    admin
      .from('crm_engagement_events')
      .insert({
        contact_id: contactId,
        event_type: 'zara_handoff',
        source: 'zara',
        metadata: { draft_id: draft.id, intent: parsed.intent, confidence: parsed.confidence, guardrails_hit, latency_ms },
      })
      .then(() => {});

    // 11. Notify agent only in live mode
    if (settings.mode === 'live') {
      admin.functions.invoke('zara-notify-agent', { body: { draftId: draft.id } }).then(() => {});
    }

    return json({ ok: true, draftId: draft.id, guardrails_hit, intent: parsed.intent, confidence: parsed.confidence });
  } catch (e) {
    console.error('[zara-suggest-reply]', e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
