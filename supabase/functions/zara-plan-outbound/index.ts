// zara-plan-outbound — generates outbound drafts for Zara-assigned leads.
// Triggers: cold_nudge, new_lead_welcome, presale_burst, post_showing.
// NEVER sends. Inserts into crm_zara_drafts with status='pending'.
// Invoke: GET/POST (cron). Optional body: { trigger?: string, dry_run?: boolean, limit?: number }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { logModelCall, captureLookupGaps, estimateTokens } from '../_shared/zara-logging.ts';
import { autoSendDraft } from '../_shared/zara-send.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FALLBACK_SYSTEM_PROMPT = `You are Zara, the digital concierge for The Presale Properties Group, a Surrey BC presale condo brokerage owned by Uzair Muhammad.

You draft OUTBOUND messages to warm leads. A human (Uzair) reviews every draft before it sends — write like you're already trusted, but never push.

Rules:
- 1–2 sentences max. Conversational, no real-estate-cliché openers ("I hope this finds you well").
- ALWAYS write in English, regardless of the contact's preferred language. The language field is internal metadata for human agents — never translate or write in any other language.
- ONE clear micro-CTA per message (a question, a floorplan offer, a quick check-in).
- Never invent prices, deposits, completion dates, or unit counts. If the trigger context mentions a project, only reference it by name.
- For SMS/WhatsApp: max ~280 chars, no greeting line, no signature.
- For Email: warm subject (max 50 chars), body 2–4 short lines, no signature (it's appended automatically).

Return STRICT JSON only:
{ "subject": "string|null (null for sms/whatsapp)", "body": "string (English only)", "reasoning": "1 line explaining why now", "confidence": 0.0-1.0, "language": "en" }`;

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function callAI(model: string, system: string, user: string): Promise<{ json: any; in_tok: number; out_tok: number; latency_ms: number }> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Error('LOVABLE_API_KEY missing');
  const t0 = Date.now();
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
  const latency_ms = Date.now() - t0;
  if (!r.ok) throw new Error(`AI ${r.status}: ${text.slice(0, 300)}`);
  const parsed = JSON.parse(text);
  const content = parsed?.choices?.[0]?.message?.content ?? '{}';
  const usage = parsed?.usage ?? {};
  return {
    json: JSON.parse(content),
    in_tok: usage.prompt_tokens ?? estimateTokens(system + user),
    out_tok: usage.completion_tokens ?? estimateTokens(content),
    latency_ms,
  };
}

function pickChannel(contact: any): 'email' | 'sms' | 'whatsapp' {
  // Prefer existing engagement channel; default email if available, else sms/whatsapp by phone.
  if (contact?.email) return 'email';
  if (contact?.phone) return 'sms';
  return 'email';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let opts: { trigger?: string; dry_run?: boolean; limit?: number; contact_id?: string } = {};
  if (req.method === 'POST') { try { opts = await req.json(); } catch { /* ignore */ } }
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);

  const { data: settings } = await admin.from('crm_zara_settings').select('*').eq('id', 1).maybeSingle();
  if (!settings?.outbound_planner_enabled) {
    return json({ ok: false, reason: 'planner_disabled' });
  }
  if (!settings?.enabled) {
    return json({ ok: false, reason: 'kill_switch_off' });
  }
  const { data: modeSettings } = await admin.from('zara_settings').select('mode').eq('id', 1).maybeSingle();
  const sandboxMode = modeSettings?.mode === 'sandbox';

  // Workspace pending cap
  const { data: pendingCount } = await admin.rpc('crm_zara_pending_drafts_count');
  const pending = (pendingCount as number) ?? 0;
  const remaining = Math.max((settings.max_workspace_pending ?? 50) - pending, 0);
  if (remaining <= 0) {
    return json({ ok: true, reason: 'workspace_cap_reached', pending, generated: 0 });
  }

  const { data: zara } = await admin.from('crm_team').select('id, display_name').eq('slug', 'zara').maybeSingle();
  if (!zara?.id) return json({ ok: false, reason: 'zara_not_found' }, 500);
  // crm_contacts.assigned_to is text and stores either the team UUID or display_name. Match both.
  const zaraAssignedKeys = [zara.id as string, zara.display_name as string].filter(Boolean) as string[];

  const coldDays = settings.cold_nudge_days ?? 7;
  const perLeadWeekly = settings.max_drafts_per_lead_per_week ?? 2;
  const model = settings.model_draft || settings.model_classify || 'google/gemini-3-flash-preview';

  // Load active system prompt + workspace custom instructions
  const [{ data: activePrompt }, { data: orgCtx }] = await Promise.all([
    admin.from('zara_system_prompts').select('prompt_text').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('zara_org_context').select('custom_instructions').eq('id', 1).maybeSingle(),
  ]);
  let systemPrompt = activePrompt?.prompt_text || FALLBACK_SYSTEM_PROMPT;
  if (orgCtx?.custom_instructions?.trim()) {
    systemPrompt += `\n\nAdditional workspace context:\n${orgCtx.custom_instructions.trim()}`;
  }

  // Pull Zara-assigned, non-muted, non-deleted candidates.
  // When `contact_id` is provided (e.g. kicked from zara-reply), scope to that one lead.
  let leadsQuery = admin
    .from('crm_contacts')
    .select('id, first_name, last_name, email, phone, language, tags, status, last_touch_at, created_at, assigned_to')
    .in('assigned_to', zaraAssignedKeys)
    .is('deleted_at', null);
  if (opts.contact_id) {
    leadsQuery = leadsQuery.eq('id', opts.contact_id);
  } else {
    leadsQuery = leadsQuery.order('last_touch_at', { ascending: true, nullsFirst: true }).limit(200);
  }
  const { data: leads, error: leadsErr } = await leadsQuery;

  if (leadsErr) return json({ ok: false, error: leadsErr.message }, 500);

  const wantTrigger = opts.trigger ?? null;
  const now = Date.now();
  const generated: any[] = [];
  const skipped: any[] = [];

  const writeAudit = async (row: Record<string, unknown>) => {
    try { await admin.from('crm_zara_outbound_audit').insert(row); }
    catch (e) { console.warn('audit insert failed', e); }
  };

  for (const lead of leads ?? []) {
    if (generated.length >= remaining || generated.length >= limit) break;
    const tags: string[] = (lead.tags as string[] | null) ?? [];
    if (tags.includes('zara:muted')) {
      skipped.push({ id: lead.id, reason: 'muted' });
      await writeAudit({
        contact_id: lead.id, decision: 'skipped', decision_reason: 'lead is muted (zara:muted tag)',
        rule_evaluation: { tag_muted: true, requested_trigger: wantTrigger },
      });
      continue;
    }

    // Per-lead weekly cap
    const { count: recent } = await admin
      .from('crm_zara_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', lead.id)
      .gte('created_at', new Date(now - 7 * 86400_000).toISOString());
    if ((recent ?? 0) >= perLeadWeekly) {
      skipped.push({ id: lead.id, reason: 'lead_cap' });
      await writeAudit({
        contact_id: lead.id, decision: 'skipped', decision_reason: `per-lead weekly cap reached (${recent}/${perLeadWeekly})`,
        rule_evaluation: { weekly_drafts: recent, per_lead_weekly_cap: perLeadWeekly, requested_trigger: wantTrigger },
      });
      continue;
    }

    // Pick a trigger
    let trigger: string | null = null;
    let context = '';

    const lastTouch = lead.last_touch_at ? new Date(lead.last_touch_at).getTime() : null;
    const created = lead.created_at ? new Date(lead.created_at).getTime() : null;

    if ((!wantTrigger || wantTrigger === 'new_lead_welcome') && created && (now - created) < 5 * 60_000 && !lastTouch) {
      trigger = 'new_lead_welcome';
      context = `New lead just assigned to Zara. No outbound exists yet. Status: ${lead.status ?? 'new'}.`;
    } else if (!wantTrigger || wantTrigger === 'presale_burst') {
      const since = new Date(now - 7 * 86400_000).toISOString();
      const { data: events } = await admin
        .from('crm_activity_events')
        .select('type, project_slug, occurred_at, metadata')
        .eq('contact_id', lead.id)
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(10);
      const burst = (events ?? []).filter((e: any) =>
        ['floorplan_download', 'deck_revisit', 'email_open'].includes(e.type)
      );
      const hot = burst.length >= 2 || burst.some((e: any) => e.type === 'floorplan_download');
      if (hot) {
        trigger = 'presale_burst';
        const projects = Array.from(new Set(burst.map((e: any) => e.project_slug).filter(Boolean))).slice(0, 2);
        context = `Presale activity burst (${burst.length} events in 7d): ${burst.map((e: any) => e.type).join(', ')}. Projects: ${projects.join(', ') || 'unknown'}.`;
      }
    }

    if (!trigger && (!wantTrigger || wantTrigger === 'post_showing')) {
      const since = new Date(now - 36 * 3600_000).toISOString();
      const cutoff = new Date(now - 24 * 3600_000).toISOString();
      const { data: showings } = await admin
        .from('crm_showings')
        .select('id, project_name, starts_at, status')
        .eq('contact_id', lead.id)
        .lte('starts_at', cutoff)
        .gte('starts_at', since)
        .limit(1);
      if ((showings?.length ?? 0) > 0) {
        trigger = 'post_showing';
        const s = showings![0] as any;
        context = `Showing 24h ago at ${s.project_name ?? 'project'} (${s.status ?? 'completed'}). Light follow-up.`;
      }
    }

    if (!trigger && (!wantTrigger || wantTrigger === 'cold_nudge')) {
      const idleMs = lastTouch ? (now - lastTouch) : (created ? (now - created) : 0);
      if (idleMs >= coldDays * 86400_000) {
        trigger = 'cold_nudge';
        const days = Math.round(idleMs / 86400_000);
        context = `No outbound or reply in ${days} days. Status: ${lead.status ?? 'unknown'}. Re-engage with one warm question.`;
      }
    }

    // Initial introduction: Zara has never written to this lead. Always say hi
    // once per assigned lead so she doesn't sit silent on contacts she owns.
    if (!trigger && (!wantTrigger || wantTrigger === 'initial_outreach')) {
      const { count: priorDrafts } = await admin
        .from('crm_zara_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', lead.id);
      if ((priorDrafts ?? 0) === 0) {
        trigger = 'initial_outreach';
        context = `First touch from Zara. Lead is assigned to her but she has never written. Status: ${lead.status ?? 'new'}. Warm introduction + ONE light question — do not pitch.`;
      }
    }

    if (!trigger) { skipped.push({ id: lead.id, reason: 'no_trigger' }); continue; }

    // Dedupe: don't create another pending draft for same lead+trigger
    const { count: existingPending } = await admin
      .from('crm_zara_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', lead.id)
      .eq('trigger_kind', trigger)
      .in('status', ['pending', 'snoozed']);
    if ((existingPending ?? 0) > 0) { skipped.push({ id: lead.id, reason: 'duplicate_pending' }); continue; }

    const channel = pickChannel(lead);
    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Lead';
    const userMsg = `Trigger: ${trigger}
Channel: ${channel}
Contact: ${fullName} (internal note — lead also speaks: ${lead.language || 'en'}; STILL reply in English)
Context: ${context}

Draft the outbound message per the system rules. Strict JSON only.`;

    let aiResult: { json: any; in_tok: number; out_tok: number; latency_ms: number };
    try {
      aiResult = await callAI(model, systemPrompt, userMsg);
      await logModelCall(admin, {
        function_called: 'zara-plan-outbound',
        contact_id: lead.id,
        model,
        input_tokens: aiResult.in_tok,
        output_tokens: aiResult.out_tok,
        latency_ms: aiResult.latency_ms,
        success: true,
      });
    } catch (e) {
      await logModelCall(admin, {
        function_called: 'zara-plan-outbound', contact_id: lead.id, model,
        success: false, error: String(e),
      });
      skipped.push({ id: lead.id, reason: 'ai_error', error: String(e) });
      continue;
    }
    const ai = aiResult.json;

    const body = String(ai?.body ?? '').trim();
    if (!body) { skipped.push({ id: lead.id, reason: 'empty_body' }); continue; }

    const subject = channel === 'email' ? (String(ai?.subject ?? '').trim() || `Quick note for ${lead.first_name ?? 'you'}`) : null;
    const confidence = Math.max(0, Math.min(1, Number(ai?.confidence ?? 0.6)));

    if (opts.dry_run) {
      generated.push({ contact_id: lead.id, trigger, channel, subject, body, reasoning: ai?.reasoning, confidence });
      continue;
    }

    const { data: inserted, error: insErr } = await admin
      .from('crm_zara_drafts')
      .insert({
        contact_id: lead.id,
        channel,
        trigger_kind: trigger,
        subject,
        body,
        reasoning: String(ai?.reasoning ?? '').slice(0, 500),
        confidence,
        scheduled_for: new Date().toISOString(),
        source_event: { trigger, context, model, lang: 'en', lead_language: lead.language ?? 'en' },
      })
      .select('id')
      .single();

    if (insErr) { skipped.push({ id: lead.id, reason: 'insert_error', error: insErr.message }); continue; }

    // Capture {LOOKUP:...} placeholders as knowledge gaps
    await captureLookupGaps(admin, `${subject ?? ''}\n${body}`, lead.id, inserted.id);

    await admin.from('crm_audit_log').insert({
      action: 'zara.draft_created',
      table_name: 'crm_zara_drafts',
      record_id: inserted.id,
      actor_label: 'zara',
      meta: { trigger, channel, contact_id: lead.id, confidence, autonomous: !!settings.autonomous_outbound },
    });

    // Autonomous send: if enabled, send immediately and update draft → 'sent'.
    // SANDBOX GATE: block autonomous sends to non-test contacts when mode=sandbox.
    const isTestContact = tags.includes('zara_test_contact');
    if (settings.autonomous_outbound && sandboxMode && !isTestContact) {
      await admin.from('crm_zara_drafts').update({ status: 'sandbox_blocked' }).eq('id', inserted.id);
      generated.push({ id: inserted.id, contact_id: lead.id, trigger, channel, autonomous: true, sent: false, blocked: 'sandbox_real_lead' });
    } else if (settings.autonomous_outbound) {
      const sent = await autoSendDraft(admin, inserted.id);
      generated.push({ id: inserted.id, contact_id: lead.id, trigger, channel, autonomous: true, sent: sent.ok, error: sent.error });
    } else {
      generated.push({ id: inserted.id, contact_id: lead.id, trigger, channel });
    }
  }

  return json({ ok: true, pending_before: pending, generated: generated.length, skipped: skipped.length, generated_items: generated, skipped_items: skipped.slice(0, 20) });
});
