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
import { fetchToneSample } from '../_shared/zara-email-enhance.ts';

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

    // 1. Mode + kill switch gate
    const { data: settings } = await admin
      .from('zara_settings')
      .select('mode, kill_switch, kill_switch_reason, never_quote')
      .eq('id', 1)
      .maybeSingle();
    if (!settings || settings.mode === 'off') return json({ skipped: true, reason: 'zara_off' });
    if (settings.kill_switch) return json({ skipped: true, reason: 'kill_switch', detail: settings.kill_switch_reason ?? null });
    const neverQuote = (settings as any).never_quote ?? null;

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
      admin.from('zara_lead_memory').select('summary, signals, facts, turn_count, version, last_rolled_at').eq('contact_id', contactId).maybeSingle(),
      admin
        .from('crm_engagement_events')
        .select('event_type, source, direction, occurred_at, metadata')
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: false })
        .limit(10),
    ]);

    // 3b. Tone sample — last 1-2 inbound messages so the draft matches the
    // lead's register (formal/casual, short/long, language) instead of
    // reading as a form letter.
    const toneSample = await fetchToneSample(admin, contactId, 2);

    // 4. Language detect
    const detectedLang = detectLanguage(inboundText);

    // 4b. Phase-3 RAG: embed the inbound + the lead's project hint, then pull
    // the top-3 most relevant presale projects so Zara reasons over real
    // facts (price band, deposit, completion, objections, fit) instead of
    // hallucinating. Failures are non-fatal — drafts still work without RAG.
    let ragContext = "";
    let ragProjects: Array<{ name: string; similarity: number }> = [];
    let citations: Array<{
      n: number;
      name: string;
      source: string;
      id: string | null;
      slug: string | null;
      city: string | null;
      neighborhood: string | null;
      similarity: number;
    }> = [];
    try {
      const ragQuery = [
        contact.project_interest ?? "",
        inboundText,
      ].join(" \n ").slice(0, 4000);

      const embedRes = await fetch(
        `${SUPABASE_URL}/functions/v1/zara-embed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ texts: [ragQuery] }),
        },
      );
      const embedJson = await embedRes.json().catch(() => null);
      const qvec = embedJson?.embeddings?.[0];
      if (Array.isArray(qvec)) {
        const { data: matches, error: matchErr } = await admin.rpc(
          "zara_match_projects",
          { query_embedding: qvec, match_count: 3, city_filter: null },
        );
        if (matchErr) {
          console.warn("[zara-suggest-reply] zara_match_projects error", matchErr);
        } else if (Array.isArray(matches) && matches.length > 0) {
          ragProjects = matches.map((m: any) => ({
            name: m.name,
            similarity: Number(m.similarity ?? 0),
          }));
          citations = matches.map((m: any, i: number) => ({
            n: i + 1,
            name: String(m.name ?? `Project ${i + 1}`),
            source: String(m.source ?? "presale"),
            id: m.id ?? null,
            slug: m.slug ?? null,
            city: m.city ?? null,
            neighborhood: m.neighborhood ?? null,
            similarity: Number(m.similarity ?? 0),
          }));
          ragContext = matches
            .map((m: any, i: number) => {
              const price = [m.price_range_low, m.price_range_high]
                .filter((v: any) => v != null)
                .map((v: number) => `$${Number(v).toLocaleString()}`)
                .join(" - ");
              return [
                `[${i + 1}] ${m.name}${m.developer ? " (" + m.developer + ")" : ""}` +
                  ` — ${m.city ?? "?"}${m.neighborhood ? " / " + m.neighborhood : ""}` +
                  ` — status: ${m.status ?? "?"} — completion: ${m.completion_year ?? "?"}`,
                price ? `  price: ${price}` : null,
                m.uzair_pitch ? `  pitch: ${String(m.uzair_pitch).slice(0, 320)}` : null,
                m.who_this_fits ? `  who-fits: ${String(m.who_this_fits).slice(0, 240)}` : null,
                m.common_objections?.length
                  ? `  objections: ${(m.common_objections as string[]).slice(0, 3).join(" | ")}`
                  : null,
                m.honest_caveats ? `  caveats: ${String(m.honest_caveats).slice(0, 240)}` : null,
                `  similarity: ${m.similarity?.toFixed?.(3) ?? "?"}`,
              ].filter(Boolean).join("\n");
            })
            .join("\n\n");
        }
      } else {
        console.warn(
          "[zara-suggest-reply] embed unavailable for RAG (status=" + embedRes.status + ")",
        );
      }
    } catch (e) {
      console.warn("[zara-suggest-reply] RAG retrieval skipped:", e);
    }

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

MEMORY SUMMARY (rolling, ${memoryRow?.turn_count ?? 0} turns merged):
${memoryRow?.summary ?? '(no memory yet)'}

MEMORY FACTS (durable deal context — trust these unless the inbound contradicts them):
${memoryRow?.facts && Object.keys(memoryRow.facts).length > 0 ? JSON.stringify(memoryRow.facts, null, 2) : '(no facts captured yet)'}

RELEVANT PROJECT KNOWLEDGE (retrieved via vector search — use these facts, do not invent others. Each project is prefixed with a [N] tag; when you state a project-specific fact (price, deposit, completion year, location, pitch line) append the matching [N] marker inline, e.g. "completing 2027 [1]". Use markers sparingly — at most one per sentence, only for facts pulled from the knowledge block below. Do NOT cite memory, events, or general knowledge.):
${ragContext || '(no project matches above similarity floor — answer from memory only, do not quote specific prices, deposit terms, or completion dates, and do not emit any [N] citation markers)'}

LAST 10 EVENTS:
${eventLines}

INBOUND MESSAGE (channel=${channel}, at=${inboundAt}):
"""${inboundText}"""

${toneSample ? `TONE SAMPLE (recent inbound messages from this lead — match their register, length, formality, emoji use, and language. Do not copy phrasing verbatim; mirror the cadence):
${toneSample}

` : ''}Draft Zara's reply now. Return ONLY the JSON object.`;

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
          system: buildZaraSystemPrompt(intent, { neverQuote, mode: (memoryRow as any)?.signals?.mode ?? null }),
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

    // 8c. Email branding — render the model's plain draft inside the team's
    //     branded HTML scaffold + agent signature so the email looks like the
    //     other agent emails (not bare <p>{{text}}</p>). SMS / WhatsApp stay
    //     plain text. Failures are non-fatal — execute-send falls back to a
    //     plain wrapper.
    let draft_html: string | null = null;
    let template_id_used: string | null = null;
    let renderedSubject: string | null = parsed.draft_subject ?? null;
    if (channel === 'email') {
      try {
        const { renderBrandedEmail } = await import('../_shared/zara-email-render.ts');
        const rendered = await renderBrandedEmail(admin, {
          userId: assignedUserId ?? '00000000-0000-0000-0000-000000000000',
          contactId,
          intent: (parsed.intent ?? modelIntent) as string,
          bodyText: parsed.draft_text ?? '',
          subject: renderedSubject,
        });
        draft_html = rendered.html;
        template_id_used = rendered.template_id_used;
        if (rendered.subject) renderedSubject = rendered.subject;
      } catch (e) {
        console.warn('[zara-suggest-reply] branded email render failed', e);
      }
    }

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
        draft_html,
        template_id_used,
        draft_subject: renderedSubject,
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
        citations,
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
        metadata: { draft_id: draft.id, intent: parsed.intent, confidence: parsed.confidence, guardrails_hit, latency_ms: totalLatency, rag_projects: ragProjects },
      })
      .then(() => {});

    // 10b. Roll per-lead memory using the inbound + the (not-yet-sent) draft.
    //      Fire-and-forget; failures must not affect the caller.
    fetch(`${SUPABASE_URL}/functions/v1/zara-roll-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        contact_id: contactId,
        inbound_text: inboundText,
        draft_text: parsed.draft_text ?? null,
        kind: 'draft',
      }),
    }).catch((e) => console.warn('[zara-suggest-reply] roll-memory kick failed', e));

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
