// Verify the latest outbound SMS end-to-end:
// 1. Find the most recent outbound row in crm_sms_log for this user
// 2. Confirm send-sms succeeded (status != 'failed' and has a SID)
// 3. Hit Twilio via the connector gateway to fetch the live message status
// 4. Return a structured verdict the UI can render
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ ok: false, stage: 'auth', error: 'Missing Authorization' }, 401);
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uErr } = await supabaseUser.auth.getUser();
    if (uErr || !user) return json({ ok: false, stage: 'auth', error: 'Not authenticated' }, 401);

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

    let body: any = {};
    try { body = await req.json(); } catch { /* allow empty */ }
    const sidOverride: string | null = body?.sid ?? null;
    const logIdOverride: string | null = body?.log_id ?? null;

    // 1. Find row
    let q = supabaseAdmin.from('crm_sms_log').select('*').eq('direction', 'outbound').eq('user_id', user.id);
    if (sidOverride) q = q.eq('twilio_message_sid', sidOverride);
    else if (logIdOverride) q = q.eq('id', logIdOverride);
    else q = q.order('sent_at', { ascending: false }).limit(1);

    const { data: rows, error: qErr } = await q;
    if (qErr) return json({ ok: false, stage: 'lookup', error: qErr.message }, 500);
    const log = Array.isArray(rows) ? rows[0] : rows;
    if (!log) {
      return json({
        ok: false,
        stage: 'lookup',
        error: 'No outbound messages found. Send a test from the Inbox first.',
      }, 404);
    }

    const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];

    // 2. Edge function (send-sms) outcome — implied by log row existing
    const sendOk = log.status && log.status !== 'failed' && !log.error_code;
    checks.push({
      name: 'send-sms returned 200',
      pass: !!sendOk,
      detail: sendOk
        ? `Row created at ${log.created_at}`
        : `send-sms recorded status=${log.status} ${log.error_code ? `code=${log.error_code}` : ''}`,
    });

    checks.push({
      name: 'Twilio Message SID issued',
      pass: !!log.twilio_message_sid,
      detail: log.twilio_message_sid ? log.twilio_message_sid : 'No SID — Twilio never accepted the message',
    });

    // 3. Live Twilio status
    let twilio: any = null;
    let twilioError: string | null = null;
    if (log.twilio_message_sid && LOVABLE_API_KEY && TWILIO_API_KEY) {
      try {
        const r = await fetch(`${GATEWAY_URL}/Messages/${log.twilio_message_sid}.json`, {
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'X-Connection-Api-Key': TWILIO_API_KEY,
          },
        });
        const data = await r.json();
        if (!r.ok) {
          twilioError = `Twilio API ${r.status}: ${JSON.stringify(data)}`;
        } else {
          twilio = {
            sid: data.sid,
            status: data.status,
            error_code: data.error_code,
            error_message: data.error_message,
            date_sent: data.date_sent,
            date_updated: data.date_updated,
            from: data.from,
            to: data.to,
            num_segments: data.num_segments,
            price: data.price,
            price_unit: data.price_unit,
            direction: data.direction,
          };

          // Sync any newer status back into our log
          const liveStatus = String(data.status || '').toLowerCase();
          const updates: Record<string, unknown> = {};
          if (liveStatus && liveStatus !== log.status) updates.status = liveStatus;
          if (data.error_code && data.error_code !== log.error_code) updates.error_code = String(data.error_code);
          if (data.error_message && data.error_message !== log.error_message) updates.error_message = data.error_message;
          if (liveStatus === 'delivered' && !log.delivered_at) updates.delivered_at = new Date().toISOString();
          if (data.price && data.price !== log.price) {
            updates.price = data.price;
            updates.price_unit = data.price_unit;
          }
          if (Object.keys(updates).length > 0) {
            await supabaseAdmin.from('crm_sms_log').update(updates).eq('id', log.id);
          }
        }
      } catch (e) {
        twilioError = e instanceof Error ? e.message : String(e);
      }
    } else if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
      twilioError = 'Twilio gateway credentials not configured';
    }

    checks.push({
      name: 'Twilio API confirms delivery',
      pass: !!twilio && ['delivered', 'sent', 'queued', 'accepted', 'sending'].includes(String(twilio.status).toLowerCase()),
      detail: twilio
        ? `Twilio status: ${twilio.status}${twilio.error_code ? ` (code ${twilio.error_code})` : ''}`
        : (twilioError || 'Could not reach Twilio'),
    });

    const allPass = checks.every(c => c.pass);
    const verdict = !allPass
      ? 'failed'
      : twilio?.status === 'delivered'
      ? 'delivered'
      : twilio?.status === 'sent'
      ? 'sent'
      : 'in_flight';

    return json({
      ok: allPass,
      verdict,
      checks,
      log: {
        id: log.id,
        to: log.to_number,
        from: log.from_number,
        body: log.body,
        status: log.status,
        sid: log.twilio_message_sid,
        created_at: log.created_at,
        sent_at: log.sent_at,
        delivered_at: log.delivered_at,
        error_code: log.error_code,
        error_message: log.error_message,
      },
      twilio,
      twilio_error: twilioError,
    }, 200);
  } catch (e) {
    return json({ ok: false, stage: 'fatal', error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
