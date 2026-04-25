// Twilio webhook handler — handles BOTH inbound SMS and message status callbacks.
// Routing via ?type=inbound (default) or ?type=status query param.
// IMPORTANT: this endpoint must be configured as Twilio's "A MESSAGE COMES IN" webhook
//   AND the StatusCallback URL on outbound messages.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

const STOP_WORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'];
const START_WORDS = ['start', 'unstop', 'yes'];
const HELP_WORDS = ['help', 'info'];

function twiml(body?: string): Response {
  const xml = body
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${body}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new Response(xml, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/xml' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'inbound';

    const formData = await req.formData();
    const data: Record<string, string> = {};
    for (const [k, v] of formData.entries()) data[k] = String(v);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ============== STATUS CALLBACK ==============
    if (type === 'status') {
      const sid = data.MessageSid || data.SmsSid;
      const status = data.MessageStatus || data.SmsStatus;
      const errorCode = data.ErrorCode;
      const errorMessage = data.ErrorMessage;
      if (sid && status) {
        const update: Record<string, unknown> = { status };
        if (status === 'delivered') update.delivered_at = new Date().toISOString();
        if (errorCode) update.error_code = errorCode;
        if (errorMessage) update.error_message = errorMessage;
        await admin.from('crm_sms_log').update(update).eq('twilio_message_sid', sid);

        // Update campaign counters
        const { data: row } = await admin.from('crm_sms_log').select('campaign_id').eq('twilio_message_sid', sid).maybeSingle();
        if (row?.campaign_id) {
          if (status === 'delivered') {
            try { await admin.rpc('increment_sms_campaign_delivered', { _campaign_id: row.campaign_id }); } catch {}
            await admin.from('crm_sms_campaign_recipients').update({
              status: 'delivered', delivered_at: new Date().toISOString(),
            }).eq('campaign_id', row.campaign_id).eq('sms_log_id', (await admin.from('crm_sms_log').select('id').eq('twilio_message_sid', sid).maybeSingle()).data?.id);
          } else if (status === 'failed' || status === 'undelivered') {
            await admin.from('crm_sms_campaigns').update({
              failed_count: (await admin.from('crm_sms_campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', row.campaign_id).eq('status', 'failed')).count || 0,
            }).eq('id', row.campaign_id);
          }
        }
      }
      return new Response('ok', { status: 200, headers: corsHeaders });
    }

    // ============== INBOUND MESSAGE ==============
    const fromNum = data.From;
    const toNum = data.To;
    const bodyText = (data.Body || '').trim();
    const sid = data.MessageSid;
    const numMedia = parseInt(data.NumMedia || '0', 10);
    const mediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const u = data[`MediaUrl${i}`];
      if (u) mediaUrls.push(u);
    }

    if (!fromNum || !toNum) {
      return twiml();
    }

    // Match contact by phone (loose: match last 10 digits)
    const last10 = fromNum.replace(/\D/g, '').slice(-10);
    const { data: contact } = await admin
      .from('crm_contacts').select('id, first_name, last_name, assigned_to')
      .or(`phone.ilike.%${last10}%`).limit(1).maybeSingle();

    // STOP / START / HELP handling
    const word = bodyText.toLowerCase().replace(/[^a-z]/g, '');
    if (STOP_WORDS.includes(word)) {
      await admin.from('crm_sms_opt_outs').upsert({
        phone: fromNum, contact_id: contact?.id ?? null, source: 'stop_keyword',
        opted_out_at: new Date().toISOString(), re_opted_in_at: null,
      }, { onConflict: 'phone' });
      // Log the inbound STOP
      await admin.from('crm_sms_log').insert({
        contact_id: contact?.id ?? null, direction: 'inbound',
        to_number: toNum, from_number: fromNum, body: bodyText,
        message_type: 'sms', status: 'received', twilio_message_sid: sid,
      });
      return twiml('You have been unsubscribed and will no longer receive messages. Reply START to opt back in.');
    }
    if (START_WORDS.includes(word)) {
      await admin.from('crm_sms_opt_outs').update({ re_opted_in_at: new Date().toISOString() }).eq('phone', fromNum);
      await admin.from('crm_sms_log').insert({
        contact_id: contact?.id ?? null, direction: 'inbound',
        to_number: toNum, from_number: fromNum, body: bodyText,
        message_type: 'sms', status: 'received', twilio_message_sid: sid,
      });
      return twiml('You are re-subscribed. Reply STOP to opt out at any time.');
    }
    if (HELP_WORDS.includes(word)) {
      await admin.from('crm_sms_log').insert({
        contact_id: contact?.id ?? null, direction: 'inbound',
        to_number: toNum, from_number: fromNum, body: bodyText,
        message_type: 'sms', status: 'received', twilio_message_sid: sid,
      });
      return twiml('Reply STOP to opt out. Standard message rates may apply.');
    }

    // Regular inbound message — log it
    const { data: logged } = await admin.from('crm_sms_log').insert({
      contact_id: contact?.id ?? null, direction: 'inbound',
      to_number: toNum, from_number: fromNum, body: bodyText, media_urls: mediaUrls,
      message_type: numMedia > 0 ? 'mms' : 'sms',
      status: 'received', twilio_message_sid: sid,
    }).select('id').maybeSingle();

    // Notify CRM team if this is a known contact
    if (contact) {
      const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'A lead';
      const { data: recipients } = await admin.rpc('crm_recipients_for_contact', { _assigned_to: contact.assigned_to });
      if (recipients) {
        try {
          await admin.rpc('notify_crm', {
            _user_ids: recipients,
            _title: `📱 ${fullName} replied`,
            _body: bodyText.slice(0, 140),
            _type: 'sms_inbound',
            _link_to: `/crm/leads/${contact.id}`,
          });
        } catch {}
      }

      // If part of an active campaign, mark recipient as replied
      const { data: lastOutbound } = await admin
        .from('crm_sms_log').select('campaign_id').eq('contact_id', contact.id)
        .eq('direction', 'outbound').not('campaign_id', 'is', null)
        .order('sent_at', { ascending: false }).limit(1).maybeSingle();
      if (lastOutbound?.campaign_id) {
        await admin.from('crm_sms_campaign_recipients').update({
          status: 'replied', replied_at: new Date().toISOString(),
        }).eq('campaign_id', lastOutbound.campaign_id).eq('contact_id', contact.id);
        // Bump reply_count
        const { count } = await admin.from('crm_sms_campaign_recipients').select('id', { count: 'exact', head: true })
          .eq('campaign_id', lastOutbound.campaign_id).eq('status', 'replied');
        await admin.from('crm_sms_campaigns').update({ reply_count: count || 0 }).eq('id', lastOutbound.campaign_id);
      }
    }

    return twiml();
  } catch (err) {
    console.error('twilio-sms-webhook error:', err);
    return twiml();
  }
});
