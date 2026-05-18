// Inbound + delivery-receipt webhook for Telnyx Messaging (SMS/MMS/WhatsApp).
// Verifies Ed25519 signature, stores raw event, then maps to crm_sms_log.
// Public endpoint (no JWT) — security is the signature check.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, verifyTelnyxSignature } from '../_shared/telnyx.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELNYX_PUBLIC_KEY = Deno.env.get('TELNYX_PUBLIC_KEY');

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
  const resourceId: string | null = resource?.id ?? null;

  // Always log first (audit)
  await admin.from('telnyx_webhook_events').insert({
    event_type: eventType,
    event_id: eventId,
    resource_kind: 'messaging',
    resource_id: resourceId,
    payload,
    signature_ok: sigOk,
  });

  if (!sigOk && TELNYX_PUBLIC_KEY) {
    // If a public key is set, require valid signature.
    return json({ error: 'bad_signature' }, 401);
  }

  try {
    if (eventType === 'message.received') {
      const from = resource?.from?.phone_number ?? null;
      const to = resource?.to?.[0]?.phone_number ?? null;
      const text = resource?.text ?? '';
      const media = Array.isArray(resource?.media)
        ? resource.media.map((m: any) => m?.url).filter(Boolean)
        : [];
      const channel = (resource?.messaging_profile_id && resource?.type === 'whatsapp')
        ? 'whatsapp'
        : 'sms';

      // Try to match the inbound number to a contact (and route to its assigned agent).
      let contactId: string | null = null;
      let assignedUserId: string | null = null;
      if (from) {
        const { data: match } = await admin.rpc('crm_match_contact_by_phone', { p_phone: from });
        if (match) {
          contactId = (match as any).contact_id ?? null;
          assignedUserId = (match as any).user_id ?? null;
        }
      }

      await admin.from('crm_sms_log').insert({
        user_id: assignedUserId,
        contact_id: contactId,
        direction: 'inbound',
        to_number: to,
        from_number: from,
        body: text,
        status: 'received',
        channel,
        message_type: media.length ? 'mms' : 'sms',
        media_urls: media.length ? media : null,
        provider: 'telnyx',
        provider_message_id: resourceId,
        messaging_profile_id: resource?.messaging_profile_id ?? null,
        sent_at: resource?.received_at ?? new Date().toISOString(),
      });
    } else if (
      eventType === 'message.sent' ||
      eventType === 'message.finalized' ||
      eventType.startsWith('message.')
    ) {
      // Delivery receipt / status update.
      const toEntry = resource?.to?.[0];
      const status = toEntry?.status ?? resource?.to?.[0]?.status ?? eventType.split('.').pop();
      const cost = resource?.cost ?? null;
      const updates: Record<string, any> = { status };
      if (cost?.amount) updates.price_amount = Number(cost.amount);
      if (cost?.currency) updates.price_currency = cost.currency;
      if (status === 'delivered') updates.delivered_at = new Date().toISOString();
      if (resource?.errors?.length) {
        updates.error_message = JSON.stringify(resource.errors);
        updates.error_code = resource.errors[0]?.code ?? null;
      }
      if (resourceId) {
        await admin
          .from('crm_sms_log')
          .update(updates)
          .eq('provider', 'telnyx')
          .eq('provider_message_id', resourceId);
      }
    }

    await admin
      .from('telnyx_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', eventId);

    return json({ ok: true });
  } catch (e) {
    console.error('[telnyx-messaging-webhook]', e);
    await admin
      .from('telnyx_webhook_events')
      .update({ processing_error: (e as Error).message })
      .eq('event_id', eventId);
    return json({ error: (e as Error).message }, 500);
  }
});
