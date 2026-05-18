// Drains sms_outbound_queue: picks queued rows whose scheduled_for has passed
// (or is null) and sends via telnyx-send-message using the requesting user's
// service-impersonation. Designed to be cron'd every minute.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const nowIso = new Date().toISOString();

    const { data: rows, error } = await admin
      .from('sms_outbound_queue')
      .select('id, contact_id, to_number, body, media_urls, requested_by, campaign_id, scheduled_for')
      .eq('status', 'queued')
      .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
      .limit(100);
    if (error) return json({ error: error.message }, 500);
    if (!rows || rows.length === 0) return json({ ok: true, processed: 0 });

    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      // Mark sending to avoid double-dispatch if cron overlaps
      await admin.from('sms_outbound_queue').update({ status: 'sending' }).eq('id', row.id);

      try {
        // Direct service-role insert into log + Telnyx call — mirrors what
        // telnyx-send-message does, but skips JWT verification because the
        // user-of-record (requested_by) initiated this already.
        const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY');
        const TELNYX_MESSAGING_PROFILE_ID = Deno.env.get('TELNYX_MESSAGING_PROFILE_ID');
        const TELNYX_SMS_FROM = Deno.env.get('TELNYX_SMS_FROM');
        if (!TELNYX_API_KEY) throw new Error('TELNYX_API_KEY missing');

        const to = (row.to_number || '').toString();
        if (!to || !row.body) throw new Error('to_or_body_missing');

        const payload: Record<string, any> = {
          to,
          text: row.body,
          from: TELNYX_SMS_FROM,
        };
        if (TELNYX_MESSAGING_PROFILE_ID) payload.messaging_profile_id = TELNYX_MESSAGING_PROFILE_ID;
        if (Array.isArray(row.media_urls) && row.media_urls.length) {
          payload.media_urls = row.media_urls;
          payload.type = 'MMS';
        }

        const tlx = await fetch('https://api.telnyx.com/v2/messages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${TELNYX_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const tlxBody = await tlx.json().catch(() => ({}));
        if (!tlx.ok) {
          await admin
            .from('sms_outbound_queue')
            .update({
              status: 'failed',
              rejection_reason: JSON.stringify(tlxBody?.errors ?? tlxBody).slice(0, 500),
            })
            .eq('id', row.id);
          failed++;
          continue;
        }

        const providerId = tlxBody?.data?.id ?? null;
        await admin.from('crm_sms_log').insert({
          user_id: row.requested_by,
          contact_id: row.contact_id,
          direction: 'outbound',
          to_number: to,
          from_number: TELNYX_SMS_FROM,
          body: row.body,
          status: 'queued',
          channel: 'sms',
          message_type: row.media_urls?.length ? 'mms' : 'sms',
          media_urls: row.media_urls?.length ? row.media_urls : null,
          provider: 'telnyx',
          provider_message_id: providerId,
          messaging_profile_id: TELNYX_MESSAGING_PROFILE_ID ?? null,
          campaign_id: row.campaign_id,
          sent_at: new Date().toISOString(),
        });

        await admin
          .from('sms_outbound_queue')
          .update({ status: 'sent', approved_at: new Date().toISOString() })
          .eq('id', row.id);

        if (row.campaign_id) {
          await admin.rpc('crm_increment_sms_campaign_sent', { p_campaign_id: row.campaign_id }).then(
            () => {},
            () => {
              // Fallback if RPC missing — best-effort raw update
              admin
                .from('crm_sms_campaigns')
                .select('sent_count')
                .eq('id', row.campaign_id)
                .single()
                .then(({ data }) => {
                  if (data) {
                    admin
                      .from('crm_sms_campaigns')
                      .update({ sent_count: (data.sent_count ?? 0) + 1 })
                      .eq('id', row.campaign_id);
                  }
                });
            },
          );
        }
        sent++;
      } catch (e) {
        failed++;
        await admin
          .from('sms_outbound_queue')
          .update({ status: 'failed', rejection_reason: String((e as Error).message).slice(0, 500) })
          .eq('id', row.id);
      }
    }

    return json({ ok: true, processed: rows.length, sent, failed });
  } catch (e) {
    console.error('[process-scheduled-sms]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
