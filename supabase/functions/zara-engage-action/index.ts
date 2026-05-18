// zara-engage-action — single entry point for the in-lead "Engage Zara" panel.
// Handles four explicit agent intents:
//   - follow_up_now      → kicks zara-suggest-reply with an agent-requested marker
//   - schedule_followup  → inserts a zara_proactive_nudge with scheduled_for
//   - summarize_lead     → refreshes the rolling memory + returns the new summary
//   - custom             → free-text prompt — routes to zara-suggest-reply as inbound
//
// The function is intentionally thin: it owns auth + validation + audit, then
// delegates to the existing Zara primitives.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/zara-guardrails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

type Action =
  | { kind: 'follow_up_now'; contactId: string; channel?: 'email' | 'sms' | 'whatsapp'; prompt?: string }
  | { kind: 'schedule_followup'; contactId: string; in_hours: number; channel?: 'email' | 'sms' | 'whatsapp'; note?: string }
  | { kind: 'summarize_lead'; contactId: string }
  | { kind: 'custom'; contactId: string; prompt: string; channel?: 'email' | 'sms' | 'whatsapp' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const action = (await req.json()) as Action;
    if (!action?.kind || !action.contactId) return json({ error: 'kind + contactId required' }, 400);

    // RLS-style sanity check — caller must see the contact.
    const { data: canSee } = await admin.rpc('crm_can_see_contact_id', { _uid: user.id, _cid: action.contactId });
    if (canSee === false) return json({ error: 'forbidden' }, 403);

    const channel = (action as any).channel ?? 'email';

    switch (action.kind) {
      case 'follow_up_now':
      case 'custom': {
        const inboundText =
          action.kind === 'custom'
            ? `(agent-requested via Engage panel) ${action.prompt}`
            : `(agent-requested follow-up via Engage panel) ${action.prompt ?? 'Please follow up with this lead now.'}`;
        // Ensure zara_enabled so suggest-reply doesn't short-circuit.
        await admin
          .from('crm_contacts')
          .update({ zara_enabled: true, zara_enabled_at: new Date().toISOString(), zara_enabled_by: user.id })
          .eq('id', action.contactId)
          .is('zara_enabled', null as any);
        const { data, error } = await admin.functions.invoke('zara-suggest-reply', {
          body: {
            contactId: action.contactId,
            channel,
            inboundText,
            inboundAt: new Date().toISOString(),
          },
        });
        if (error) return json({ error: error.message }, 502);
        return json({ ok: true, draft: data });
      }

      case 'schedule_followup': {
        const hours = Math.max(1, Math.min(24 * 30, Number(action.in_hours) || 24));
        const scheduledFor = new Date(Date.now() + hours * 3600 * 1000);
        const dedupe = `engage_followup:${action.contactId}:${scheduledFor.toISOString().slice(0, 13)}`;
        const { data, error } = await admin
          .from('zara_proactive_nudges')
          .insert({
            kind: 'risk_scan', // reuse existing CHECK constraint bucket; payload.kind disambiguates UI
            agent_user_id: user.id,
            contact_id: action.contactId,
            dedupe_key: dedupe,
            scheduled_for: scheduledFor.toISOString(),
            created_by: user.id,
            title: `Follow up scheduled in ${hours}h`,
            body: action.note ?? null,
            payload: { kind: 'engage_followup', channel, in_hours: hours, requested_by: user.id, note: action.note ?? null },
          })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        // Also log a timeline event so the agent sees it on the lead.
        await admin.from('crm_engagement_events').insert({
          contact_id: action.contactId,
          event_type: 'zara_handoff',
          source: 'zara',
          actor_id: user.id,
          metadata: { channel, intent: 'scheduled_followup', scheduled_for: scheduledFor.toISOString(), note: action.note ?? null },
        });
        return json({ ok: true, nudge: data });
      }

      case 'summarize_lead': {
        const { error } = await admin.functions.invoke('zara-refresh-memory', {
          body: { contact_id: action.contactId },
        });
        if (error) return json({ error: error.message }, 502);
        const { data: memory } = await admin
          .from('zara_lead_memory')
          .select('summary, facts, last_rolled_at')
          .eq('contact_id', action.contactId)
          .maybeSingle();
        return json({ ok: true, memory });
      }
    }
  } catch (e) {
    console.error('[zara-engage-action]', e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
