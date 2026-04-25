// Returns the current Twilio status + webhook delivery history for a single message log.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';

function friendlyTwilioError(code?: unknown, message?: unknown): string | null {
  const c = code === undefined || code === null ? '' : String(code);
  if (c === '63016') {
    return 'WhatsApp free-form messages can only be sent inside the 24-hour customer-service window. Have the contact reply first or use an approved WhatsApp template.';
  }
  if (c === '63007') return 'The configured WhatsApp sender is not enabled or approved for this Twilio account.';
  if (c === '63003') return 'The recipient is not reachable on WhatsApp or has not joined the sandbox.';
  return typeof message === 'string' && message.trim() ? message : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { searchParams } = new URL(req.url);
    let logId = searchParams.get('log_id');
    let sid = searchParams.get('sid');
    if (!logId && !sid && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      logId = body?.log_id ?? logId;
      sid = body?.sid ?? sid;
    }
    if (!logId && !sid) {
      return new Response(JSON.stringify({ error: 'log_id or sid required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up the log row
    let q = admin.from('crm_sms_log').select('*');
    if (logId) q = q.eq('id', logId);
    else if (sid) q = q.eq('twilio_message_sid', sid);
    const { data: log } = await q.maybeSingle();

    if (!log) {
      return new Response(JSON.stringify({ error: 'Log entry not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pull live Twilio status if we have a SID
    let twilio: Record<string, unknown> | null = null;
    let twilioError: string | null = null;
    const messageSid = (log.twilio_message_sid as string) || sid;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');

    if (messageSid && LOVABLE_API_KEY && TWILIO_API_KEY) {
      try {
        const r = await fetch(`${GATEWAY_URL}/Messages/${messageSid}.json`, {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            'X-Connection-Api-Key': TWILIO_API_KEY,
          },
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          const friendlyError = friendlyTwilioError(j.error_code, j.error_message);
          twilio = {
            sid: j.sid,
            status: j.status,
            error_code: j.error_code,
            error_message: friendlyError,
            to: j.to,
            from: j.from,
            num_segments: j.num_segments,
            price: j.price,
            price_unit: j.price_unit,
            date_created: j.date_created,
            date_sent: j.date_sent,
            date_updated: j.date_updated,
          };
          // Sync the log row if Twilio shows a newer status
          if (j.status && j.status !== log.status) {
            await admin.from('crm_sms_log').update({
              status: j.status,
              error_code: j.error_code ? String(j.error_code) : null,
              error_message: friendlyError,
              price: j.price ?? log.price,
              price_unit: j.price_unit ?? log.price_unit,
              updated_at: new Date().toISOString(),
            }).eq('id', log.id);
            log.status = j.status;
          }
        } else {
          twilioError = j?.message || `HTTP ${r.status}`;
        }
      } catch (e) {
        twilioError = (e as Error).message;
      }
    }

    return new Response(JSON.stringify({
      log: {
        id: log.id,
        status: log.status,
        twilio_message_sid: log.twilio_message_sid,
        to_number: log.to_number,
        from_number: log.from_number,
        channel: log.channel,
        body: log.body,
        error_code: log.error_code,
        error_message: log.error_message,
        created_at: log.created_at,
        updated_at: log.updated_at,
        delivered_at: (log as { delivered_at?: string }).delivered_at ?? null,
      },
      twilio,
      twilio_error: twilioError,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
