// Telnyx Call Control webhook.
// Drives the two-leg call: when the agent answers, dial the lead and bridge.
// Also updates crm_call_log status, hangup_cause, and recording URLs.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, telnyxFetch, verifyTelnyxSignature } from '../_shared/telnyx.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY');
const TELNYX_PUBLIC_KEY = Deno.env.get('TELNYX_PUBLIC_KEY');
const TELNYX_VOICE_CONNECTION_ID = Deno.env.get('TELNYX_VOICE_CONNECTION_ID');
const TELNYX_VOICE_FROM = Deno.env.get('TELNYX_VOICE_FROM');

function decodeClientState(b64: string | null | undefined): Record<string, any> | null {
  if (!b64) return null;
  try { return JSON.parse(atob(b64)); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const raw = await req.text();
  const sig = req.headers.get('telnyx-signature-ed25519');
  const ts = req.headers.get('telnyx-timestamp');
  const sigOk = await verifyTelnyxSignature(raw, sig, ts, TELNYX_PUBLIC_KEY);

  let payload: any = null;
  try { payload = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }

  const event = payload?.data;
  const eventType: string = event?.event_type ?? 'unknown';
  const eventId: string | null = event?.id ?? null;
  const resource = event?.payload ?? {};
  const callControlId: string | null = resource?.call_control_id ?? null;
  const callLegId: string | null = resource?.call_leg_id ?? null;
  const state = decodeClientState(resource?.client_state);

  await admin.from('telnyx_webhook_events').insert({
    event_type: eventType,
    event_id: eventId,
    resource_kind: eventType.startsWith('call.recording') ? 'recording' : 'call',
    resource_id: callControlId,
    payload,
    signature_ok: sigOk,
  });

  if (!sigOk && TELNYX_PUBLIC_KEY) return json({ error: 'bad_signature' }, 401);

  try {
    // ---- Agent leg answered → dial the lead and prepare to bridge ----
    if (eventType === 'call.answered' && state?.kind === 'agent_leg' && state?.lead_number && TELNYX_API_KEY) {
      // Originate the lead leg
      const leadCall = await telnyxFetch('/calls', {
        apiKey: TELNYX_API_KEY,
        method: 'POST',
        body: JSON.stringify({
          connection_id: TELNYX_VOICE_CONNECTION_ID,
          to: state.lead_number,
          from: TELNYX_VOICE_FROM,
          record: 'record-from-answer',
          record_channels: 'dual',
          record_format: 'mp3',
          client_state: btoa(JSON.stringify({
            kind: 'lead_leg',
            user_id: state.user_id,
            contact_id: state.contact_id,
            agent_call_control_id: callControlId,
          })),
        }),
      });

      if (!leadCall.ok) {
        console.error('[telnyx-voice-webhook] lead leg failed', leadCall.body);
        // Hang up the agent — nothing to talk to.
        if (callControlId) {
          await telnyxFetch(`/calls/${callControlId}/actions/hangup`, {
            apiKey: TELNYX_API_KEY, method: 'POST', body: JSON.stringify({}),
          });
        }
      }
    }

    // ---- Lead leg answered → bridge to agent ----
    if (eventType === 'call.answered' && state?.kind === 'lead_leg' && state?.agent_call_control_id && callControlId && TELNYX_API_KEY) {
      await telnyxFetch(`/calls/${callControlId}/actions/bridge`, {
        apiKey: TELNYX_API_KEY,
        method: 'POST',
        body: JSON.stringify({ call_control_id: state.agent_call_control_id }),
      });

      await admin
        .from('crm_call_log')
        .update({ status: 'in-progress', answered_at: new Date().toISOString() })
        .eq('provider', 'telnyx')
        .eq('provider_call_id', state.agent_call_control_id);
    }

    // ---- Status updates ----
    if (eventType === 'call.initiated' && callControlId) {
      await admin.from('crm_call_log').update({ status: 'ringing' })
        .eq('provider', 'telnyx').eq('provider_call_id', callControlId);
    }

    if (eventType === 'call.hangup') {
      const targetId = state?.kind === 'lead_leg' ? state?.agent_call_control_id : callControlId;
      if (targetId) {
        await admin.from('crm_call_log').update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          hangup_cause: resource?.hangup_cause ?? null,
        }).eq('provider', 'telnyx').eq('provider_call_id', targetId);
      }
    }

    if (eventType === 'call.recording.saved') {
      const urls = resource?.recording_urls
        ? Object.values(resource.recording_urls).filter(Boolean) as string[]
        : (resource?.public_recording_urls ? Object.values(resource.public_recording_urls).filter(Boolean) as string[] : []);
      const targetId = state?.kind === 'lead_leg' ? state?.agent_call_control_id : callControlId;
      if (targetId && urls.length) {
        await admin.from('crm_call_log').update({ recording_urls: urls })
          .eq('provider', 'telnyx').eq('provider_call_id', targetId);
      }
    }

    await admin.from('telnyx_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', eventId);

    return json({ ok: true });
  } catch (e) {
    console.error('[telnyx-voice-webhook]', e);
    await admin.from('telnyx_webhook_events')
      .update({ processing_error: (e as Error).message })
      .eq('event_id', eventId);
    return json({ error: (e as Error).message }, 500);
  }
});
