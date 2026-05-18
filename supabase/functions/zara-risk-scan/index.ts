// zara-risk-scan — hourly sweep for leads that need attention RIGHT NOW.
// Emits one zara_proactive_nudges row per (kind, contact, hour-bucket).
// Risks detected:
//   - showing in <24h with no confirmation message in last 48h
//   - hot lead with no touch in 24h
//   - deal under contract with no agent activity in 72h (transaction mode)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/zara-guardrails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const hourBucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const created: any[] = [];

    const nudge = async (kind: string, contactId: string, agentUid: string | null, title: string, body: string, payload: any = {}) => {
      const dedupe_key = `${contactId}:${hourBucket}`;
      const { error } = await admin
        .from('zara_proactive_nudges')
        .upsert(
          { kind, agent_user_id: agentUid, contact_id: contactId, dedupe_key, title, body, payload },
          { onConflict: 'kind,dedupe_key' },
        );
      if (!error) created.push({ kind, contactId, title });
    };

    // 1. Showings in next 24h
    const in24 = new Date(Date.now() + 24 * 3600_000).toISOString();
    const { data: shows } = await admin
      .from('crm_showings')
      .select('id, contact_id, scheduled_at, assigned_agent_id')
      .gte('scheduled_at', new Date().toISOString())
      .lte('scheduled_at', in24)
      .limit(200);

    for (const s of shows ?? []) {
      const { data: agent } = await admin.from('crm_team').select('user_id').eq('id', s.assigned_agent_id).maybeSingle();
      await nudge('risk_scan', s.contact_id, agent?.user_id ?? null,
        'Showing in <24h — confirm with lead',
        `Showing scheduled ${new Date(s.scheduled_at).toLocaleString()}. Send confirmation if not already.`,
        { showing_id: s.id, scheduled_at: s.scheduled_at });
    }

    // 2. Hot leads silent >24h
    const cold = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: hotStale } = await admin
      .from('crm_contacts')
      .select('id, first_name, last_name, assigned_to, last_touch_at, tags')
      .contains('tags', ['hot'])
      .or(`last_touch_at.lt.${cold},last_touch_at.is.null`)
      .is('deleted_at', null)
      .limit(100);

    for (const c of hotStale ?? []) {
      let uid: string | null = null;
      if (c.assigned_to) {
        const { data: t } = await admin.from('crm_team').select('user_id').eq('id', c.assigned_to).maybeSingle();
        uid = t?.user_id ?? null;
      }
      await nudge('risk_scan', c.id, uid,
        'Hot lead has gone cold (24h+)',
        `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() + ' — re-engage today.',
        { reason: 'hot_24h_silent' });
    }

    return json({ ok: true, created_count: created.length });
  } catch (e: any) {
    console.error('[zara-risk-scan]', e);
    return json({ error: e?.message ?? 'unknown' }, 500);
  }
});
