import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';

function normalizePhone(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits.length >= 8 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`; // assume NANP
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits.length >= 8 ? `+${digits}` : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
    if (!TWILIO_API_KEY) throw new Error('Twilio is not connected');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const contact_id: string | undefined = body?.contact_id;
    const to_raw: string | undefined = body?.to;
    const message: string | undefined = body?.body;
    const from_override: string | undefined = body?.from;

    if (!contact_id || !to_raw || !message || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'contact_id, to, and body are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (message.length > 1600) {
      return new Response(JSON.stringify({ error: 'Message too long (max 1600 chars)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const to = normalizePhone(to_raw);
    if (!to) {
      return new Response(JSON.stringify({ error: 'Invalid destination phone number' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve "From" number: explicit override -> user's saved setting
    let fromNumber = from_override?.trim();
    if (!fromNumber) {
      const { data: settings } = await supabase
        .from('crm_email_settings')
        .select('twilio_from_number')
        .eq('user_id', user.id)
        .maybeSingle();
      fromNumber = settings?.twilio_from_number ?? undefined;
    }
    const from = fromNumber ? normalizePhone(fromNumber) : null;
    if (!from) {
      return new Response(JSON.stringify({
        error: 'No Twilio sender number configured. Add one in CRM Settings → Email & SMS.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Send via Twilio gateway
    const twilioRes = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: message }),
    });

    const twilioData = await twilioRes.json();

    if (!twilioRes.ok) {
      // Log failure
      await supabase.from('crm_sms_log').insert({
        user_id: user.id,
        contact_id,
        to_number: to,
        from_number: from,
        body: message,
        status: 'failed',
        error_message: twilioData?.message ?? `HTTP ${twilioRes.status}`,
      });
      return new Response(JSON.stringify({
        error: twilioData?.message ?? 'Twilio send failed',
        code: twilioData?.code,
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Log success
    const { data: logged } = await supabase.from('crm_sms_log').insert({
      user_id: user.id,
      contact_id,
      to_number: to,
      from_number: from,
      body: message,
      status: twilioData?.status ?? 'sent',
      twilio_message_sid: twilioData?.sid ?? null,
    }).select('id').maybeSingle();

    return new Response(JSON.stringify({
      ok: true,
      sid: twilioData?.sid,
      status: twilioData?.status,
      log_id: logged?.id,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('send-sms error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
