// Outbound messaging via Telnyx.
// Supports channel = 'sms' | 'mms' | 'whatsapp'. Logs to crm_sms_log.
// Requires authenticated caller; messages are scoped to that user.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, telnyxFetch, normalizeE164 } from '../_shared/telnyx.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY');
const TELNYX_MESSAGING_PROFILE_ID = Deno.env.get('TELNYX_MESSAGING_PROFILE_ID');
const TELNYX_SMS_FROM = Deno.env.get('TELNYX_SMS_FROM');
const TELNYX_WHATSAPP_FROM = Deno.env.get('TELNYX_WHATSAPP_FROM');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    if (!TELNYX_API_KEY) return json({ error: 'TELNYX_API_KEY not configured' }, 500);

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
    const {
      to,
      body: text,
      channel = 'sms',
      contact_id = null,
      media_urls = [],
      from: fromOverride = null,
      client_dedupe_id = null,
    } = body as Record<string, any>;

    if (!to || typeof to !== 'string') return json({ error: 'to required' }, 400);
    if (!text && (!media_urls || media_urls.length === 0))
      return json({ error: 'body or media_urls required' }, 400);
    if (!['sms', 'mms', 'whatsapp'].includes(channel))
      return json({ error: 'channel must be sms|mms|whatsapp' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Dedupe: if a row with this client_dedupe_id already exists for this user, return it.
    if (client_dedupe_id) {
      const { data: existing } = await admin
        .from('crm_sms_log')
        .select('id, provider_message_id, status')
        .eq('user_id', userId)
        .eq('client_dedupe_id', client_dedupe_id)
        .maybeSingle();
      if (existing) return json({ ok: true, deduped: true, log_id: existing.id, provider_message_id: existing.provider_message_id });
    }

    const toE164 = normalizeE164(to);
    if (!toE164) return json({ error: 'invalid to number' }, 400);

    let from: string | null = fromOverride;
    let waTo = toE164;
    let waFrom: string | undefined;

    if (channel === 'whatsapp') {
      from = fromOverride || TELNYX_WHATSAPP_FROM || null;
      if (!from) return json({ error: 'TELNYX_WHATSAPP_FROM not configured' }, 500);
      waFrom = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
      waTo = toE164.startsWith('whatsapp:') ? toE164 : `whatsapp:${toE164}`;
    } else {
      from = fromOverride || TELNYX_SMS_FROM || null;
    }

    const payload: Record<string, any> = {
      to: channel === 'whatsapp' ? waTo : toE164,
      text,
    };
    if (from && channel !== 'whatsapp') payload.from = from;
    if (channel === 'whatsapp') payload.from = waFrom;
    if (TELNYX_MESSAGING_PROFILE_ID && channel !== 'whatsapp') {
      payload.messaging_profile_id = TELNYX_MESSAGING_PROFILE_ID;
    }
    if (Array.isArray(media_urls) && media_urls.length > 0) {
      payload.media_urls = media_urls;
      payload.type = channel === 'whatsapp' ? 'whatsapp' : 'MMS';
    } else if (channel === 'whatsapp') {
      payload.type = 'whatsapp';
    }

    // Insert log row up-front (status=queuing) so UI sees it immediately.
    const { data: logRow, error: logErr } = await admin
      .from('crm_sms_log')
      .insert({
        user_id: userId,
        contact_id,
        direction: 'outbound',
        to_number: toE164,
        from_number: from,
        body: text ?? null,
        status: 'queuing',
        channel,
        message_type: media_urls?.length ? 'mms' : 'sms',
        media_urls: media_urls?.length ? media_urls : null,
        provider: 'telnyx',
        messaging_profile_id: TELNYX_MESSAGING_PROFILE_ID ?? null,
        client_dedupe_id,
      })
      .select('id')
      .single();
    if (logErr) console.error('[telnyx-send-message] log insert error', logErr);

    const res = await telnyxFetch('/messages', {
      apiKey: TELNYX_API_KEY,
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      if (logRow?.id) {
        await admin
          .from('crm_sms_log')
          .update({
            status: 'failed',
            error_message: JSON.stringify(res.body?.errors ?? res.body ?? {}),
            error_code: String(res.status),
          })
          .eq('id', logRow.id);
      }
      return json({ ok: false, error: 'telnyx_send_failed', detail: res.body }, 502);
    }

    const tlxMsg = res.body?.data;
    const providerId = tlxMsg?.id ?? null;

    if (logRow?.id) {
      await admin
        .from('crm_sms_log')
        .update({
          status: 'queued',
          provider_message_id: providerId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', logRow.id);
    }

    return json({ ok: true, log_id: logRow?.id ?? null, provider_message_id: providerId });
  } catch (e) {
    console.error('[telnyx-send-message]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
