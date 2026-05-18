// Click-to-call via Telnyx Call Control.
// Server-initiated two-leg call: Telnyx dials the agent's phone, then bridges to the lead.
// Inserts a crm_call_log row; the voice webhook updates status/recordings.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, telnyxFetch, normalizeE164 } from '../_shared/telnyx.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY');
const TELNYX_VOICE_CONNECTION_ID = Deno.env.get('TELNYX_VOICE_CONNECTION_ID');
const TELNYX_VOICE_FROM = Deno.env.get('TELNYX_VOICE_FROM');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    if (!TELNYX_API_KEY) return json({ error: 'TELNYX_API_KEY not configured' }, 500);
    if (!TELNYX_VOICE_CONNECTION_ID) return json({ error: 'TELNYX_VOICE_CONNECTION_ID not configured' }, 500);
    if (!TELNYX_VOICE_FROM) return json({ error: 'TELNYX_VOICE_FROM not configured' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsErr || !claims?.claims?.sub) return json({ error: 'unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const { to, contact_id = null, agent_phone = null, record = true } = body as Record<string, any>;
    if (!to) return json({ error: 'to required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve the agent's phone (either provided, from profile, or 'auto' = error).
    let agentNumber = normalizeE164(agent_phone);
    if (!agentNumber) {
      const { data: profile } = await admin
        .from('profiles')
        .select('phone')
        .eq('id', userId)
        .maybeSingle();
      agentNumber = normalizeE164(profile?.phone ?? null);
    }
    if (!agentNumber) return json({ error: 'agent_phone_required (set phone in profile)' }, 400);

    const leadNumber = normalizeE164(to);
    if (!leadNumber) return json({ error: 'invalid lead number' }, 400);

    // Step 1: dial the AGENT first (Telnyx → agent's mobile). When the agent answers,
    // the voice webhook will transfer/bridge that call to the lead.
    const payload = {
      connection_id: TELNYX_VOICE_CONNECTION_ID,
      to: agentNumber,
      from: TELNYX_VOICE_FROM,
      record: record ? 'record-from-answer' : undefined,
      record_channels: record ? 'dual' : undefined,
      record_format: 'mp3',
      client_state: btoa(
        JSON.stringify({ kind: 'agent_leg', user_id: userId, contact_id, lead_number: leadNumber }),
      ),
    };

    const res = await telnyxFetch('/calls', {
      apiKey: TELNYX_API_KEY,
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error('[telnyx-make-call] call create failed', res.body);
      return json({ ok: false, error: 'telnyx_call_failed', detail: res.body }, 502);
    }

    const call = res.body?.data;
    const callControlId = call?.call_control_id ?? null;

    await admin.from('crm_call_log').insert({
      user_id: userId,
      contact_id,
      direction: 'outbound',
      from_number: TELNYX_VOICE_FROM,
      to_number: leadNumber,
      status: 'initiated',
      provider: 'telnyx',
      provider_call_id: callControlId,
      connection_id: TELNYX_VOICE_CONNECTION_ID,
      started_at: new Date().toISOString(),
    });

    return json({ ok: true, call_control_id: callControlId });
  } catch (e) {
    console.error('[telnyx-make-call]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
