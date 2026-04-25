// Single-recipient SMS / MMS send via Twilio
// Handles: opt-out enforcement, quiet hours, per-agent number resolution,
// messaging service fallback, optional scheduling, optional campaign link,
// optional first-message opt-out footer, MMS media URLs.
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
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits.length >= 8 ? `+${digits}` : null;
}

function isQuietHour(start: number, end: number, tz: string): boolean {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz });
    const h = parseInt(fmt.format(new Date()), 10);
    if (start < end) return h >= start && h < end;
    return h >= start || h < end; // crosses midnight
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    const TWILIO_NOT_CONFIGURED = !TWILIO_API_KEY;

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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const contact_id: string | null = body?.contact_id ?? null;
    const to_raw: string | undefined = body?.to;
    const message: string | undefined = body?.body;
    const from_override: string | undefined = body?.from;
    const media_urls: string[] = Array.isArray(body?.media_urls) ? body.media_urls.filter((u: unknown) => typeof u === 'string') : [];
    const campaign_id: string | null = body?.campaign_id ?? null;
    const scheduled_for: string | null = body?.scheduled_for ?? null;
    const skip_quiet_hours = !!body?.skip_quiet_hours;
    const ignore_optout = !!body?.ignore_optout;

    if (!to_raw || !message || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'to and body are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (message.length > 1600) {
      return new Response(JSON.stringify({ error: 'Message too long (max 1600 chars)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (media_urls.length > 10) {
      return new Response(JSON.stringify({ error: 'Max 10 media attachments per message' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const to = normalizePhone(to_raw);
    if (!to) {
      return new Response(JSON.stringify({ error: 'Invalid destination phone number' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load SMS settings (single-row)
    const { data: settings } = await supabaseAdmin.from('crm_sms_settings').select('*').limit(1).maybeSingle();

    // Opt-out check
    if (!ignore_optout) {
      const { data: optOut } = await supabaseAdmin
        .from('crm_sms_opt_outs').select('id').eq('phone', to).is('re_opted_in_at', null).maybeSingle();
      if (optOut) {
        return new Response(JSON.stringify({ error: 'This number has opted out of messages.', code: 'OPTED_OUT' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Quiet hours
    if (settings?.enforce_quiet_hours && !skip_quiet_hours && !scheduled_for) {
      if (isQuietHour(settings.quiet_hours_start, settings.quiet_hours_end, settings.quiet_hours_timezone)) {
        return new Response(JSON.stringify({
          error: `Quiet hours are in effect (${settings.quiet_hours_start}:00–${settings.quiet_hours_end}:00 ${settings.quiet_hours_timezone}). Schedule for later or override.`,
          code: 'QUIET_HOURS',
        }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Resolve sender: explicit override -> per-agent number -> company number -> messaging service SID -> legacy email_settings
    let fromNumber: string | null = from_override ? normalizePhone(from_override) : null;
    let messagingServiceSid: string | null = null;
    if (!fromNumber) {
      const { data: agentNum } = await supabaseAdmin
        .from('crm_sms_numbers').select('phone').eq('user_id', user.id).eq('is_active', true).maybeSingle();
      if (agentNum?.phone) fromNumber = normalizePhone(agentNum.phone);
    }
    if (!fromNumber) {
      const { data: companyNum } = await supabaseAdmin
        .from('crm_sms_numbers').select('phone').eq('is_company', true).eq('is_active', true).maybeSingle();
      if (companyNum?.phone) fromNumber = normalizePhone(companyNum.phone);
    }
    if (!fromNumber) {
      messagingServiceSid = settings?.messaging_service_sid || Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') || null;
    }
    if (!fromNumber) {
      // Legacy fallback
      const { data: legacy } = await supabase
        .from('crm_email_settings').select('twilio_from_number').eq('user_id', user.id).maybeSingle();
      if (legacy?.twilio_from_number) fromNumber = normalizePhone(legacy.twilio_from_number);
    }
    if (!fromNumber && !messagingServiceSid) {
      return new Response(JSON.stringify({
        error: 'No Twilio sender configured. Add a number in CRM Settings → SMS, or set a Messaging Service SID.',
        code: 'NO_SENDER',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Optional opt-out footer on first message to this contact
    let finalBody = message;
    if (settings?.append_optout_first_msg && contact_id) {
      const { count } = await supabaseAdmin
        .from('crm_sms_log').select('id', { count: 'exact', head: true })
        .eq('contact_id', contact_id).eq('direction', 'outbound');
      if ((count ?? 0) === 0 && !finalBody.toLowerCase().includes('stop')) {
        finalBody = finalBody + (settings.optout_footer || ' Reply STOP to opt out.');
      }
    }

    // SCHEDULED — insert log row only, processor will pick it up
    if (scheduled_for) {
      const when = new Date(scheduled_for);
      if (isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
        return new Response(JSON.stringify({ error: 'scheduled_for must be a future ISO timestamp' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: scheduled, error: schedErr } = await supabaseAdmin.from('crm_sms_log').insert({
        user_id: user.id,
        contact_id,
        direction: 'outbound',
        to_number: to,
        from_number: fromNumber,
        body: finalBody,
        media_urls,
        message_type: media_urls.length > 0 ? 'mms' : 'sms',
        status: 'scheduled',
        campaign_id,
        scheduled_for: when.toISOString(),
      }).select('id').maybeSingle();
      if (schedErr) throw schedErr;
      return new Response(JSON.stringify({ ok: true, scheduled: true, log_id: scheduled?.id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If Twilio not configured: log as queued, return ok with note
    if (TWILIO_NOT_CONFIGURED || !LOVABLE_API_KEY) {
      const { data: logged } = await supabaseAdmin.from('crm_sms_log').insert({
        user_id: user.id,
        contact_id,
        direction: 'outbound',
        to_number: to,
        from_number: fromNumber,
        body: finalBody,
        media_urls,
        message_type: media_urls.length > 0 ? 'mms' : 'sms',
        status: 'queued',
        campaign_id,
        error_message: 'Twilio not yet connected — message recorded for later delivery.',
      }).select('id').maybeSingle();
      return new Response(JSON.stringify({
        ok: true, queued: true, twilio_pending: true, log_id: logged?.id,
        message: 'Twilio is not connected yet. Message saved and will send once configured.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build Twilio request
    const params = new URLSearchParams();
    params.set('To', to);
    if (fromNumber) params.set('From', fromNumber);
    if (messagingServiceSid && !fromNumber) params.set('MessagingServiceSid', messagingServiceSid);
    params.set('Body', finalBody);
    media_urls.forEach((u) => params.append('MediaUrl', u));
    // Status webhook
    const statusCallback = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-sms-webhook?type=status`;
    params.set('StatusCallback', statusCallback);

    const twilioRes = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    const twilioData = await twilioRes.json();

    if (!twilioRes.ok) {
      await supabaseAdmin.from('crm_sms_log').insert({
        user_id: user.id, contact_id, direction: 'outbound',
        to_number: to, from_number: fromNumber, body: finalBody, media_urls,
        message_type: media_urls.length > 0 ? 'mms' : 'sms',
        status: 'failed', campaign_id,
        error_message: twilioData?.message ?? `HTTP ${twilioRes.status}`,
        error_code: twilioData?.code ? String(twilioData.code) : null,
      });
      return new Response(JSON.stringify({
        error: twilioData?.message ?? 'Twilio send failed', code: twilioData?.code,
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: logged } = await supabaseAdmin.from('crm_sms_log').insert({
      user_id: user.id, contact_id, direction: 'outbound',
      to_number: to, from_number: fromNumber, body: finalBody, media_urls,
      message_type: media_urls.length > 0 ? 'mms' : 'sms',
      status: twilioData?.status ?? 'sent',
      twilio_message_sid: twilioData?.sid ?? null,
      num_segments: twilioData?.num_segments ? parseInt(twilioData.num_segments, 10) : 1,
      price: twilioData?.price ?? null,
      price_unit: twilioData?.price_unit ?? null,
      campaign_id,
    }).select('id').maybeSingle();

    return new Response(JSON.stringify({
      ok: true, sid: twilioData?.sid, status: twilioData?.status, log_id: logged?.id,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('send-sms error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
