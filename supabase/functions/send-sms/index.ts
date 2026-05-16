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

function friendlyTwilioError(code?: unknown, message?: unknown): string | null {
  const c = code === undefined || code === null ? '' : String(code);
  if (c === '63016') {
    return 'WhatsApp free-form messages can only be sent inside the 24-hour customer-service window. Have the contact reply first or use an approved WhatsApp template.';
  }
  if (c === '63007') return 'The configured WhatsApp sender is not enabled or approved for this Twilio account.';
  if (c === '63003') return 'The recipient is not reachable on WhatsApp or has not joined the sandbox.';
  return typeof message === 'string' && message.trim() ? message : null;
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

// 🚨 KILL SWITCH 2026-05-16 — Twilio outbound disabled after billing incident (43k unintended SMS).
// To re-enable: set SMS_KILL_SWITCH_DISABLED to true in this file (and bulk-send-sms + process-scheduled-sms).
const SMS_KILL_SWITCH_ACTIVE = true;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (SMS_KILL_SWITCH_ACTIVE) {
    return new Response(JSON.stringify({
      error: 'SMS sending is temporarily disabled by your admin (billing safeguard). Contact your workspace admin to re-enable.',
      kill_switch: true,
    }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let supabaseAdmin: any = null;
  let fallbackLog: Record<string, unknown> | null = null;

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
    supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SECURITY: only active CRM team members can send SMS. Without this,
    // any signed-in user (including pending workspace applicants) could
    // burn Twilio credits and message arbitrary numbers.
    const { data: teamRow } = await supabaseAdmin
      .from('crm_team')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!teamRow) {
      return new Response(JSON.stringify({ error: 'Not a CRM team member' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    const channel: 'sms' | 'whatsapp' = body?.channel === 'whatsapp' ? 'whatsapp' : 'sms';
    const client_dedupe_id: string | null =
      typeof body?.client_dedupe_id === 'string' && body.client_dedupe_id.length > 0 && body.client_dedupe_id.length <= 100
        ? body.client_dedupe_id
        : null;

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

    // Idempotency: if this client_dedupe_id was already processed, return the prior result
    // so retries from the offline outbox never produce duplicate sends.
    if (client_dedupe_id) {
      const { data: priorLog } = await supabaseAdmin
        .from('crm_sms_log')
        .select('id, status, twilio_message_sid, channel')
        .eq('client_dedupe_id', client_dedupe_id)
        .maybeSingle();
      if (priorLog) {
        return new Response(JSON.stringify({
          ok: true, deduped: true, log_id: priorLog.id,
          sid: priorLog.twilio_message_sid, status: priorLog.status, channel: priorLog.channel,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

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

    // Resolve sender. WhatsApp uses dedicated WA sender from settings; SMS uses agent/company number → MS SID.
    let fromNumber: string | null = from_override ? normalizePhone(from_override) : null;
    let messagingServiceSid: string | null = null;

    if (channel === 'whatsapp') {
      // WhatsApp sender comes from settings.whatsapp_from or env (Twilio sandbox = +14155238886)
      if (!fromNumber) {
        const waFrom = settings?.whatsapp_from || Deno.env.get('TWILIO_WHATSAPP_FROM') || null;
        if (waFrom) fromNumber = normalizePhone(waFrom);
      }
      if (!fromNumber) {
        messagingServiceSid = settings?.whatsapp_messaging_service_sid || null;
      }
    } else {
      if (!fromNumber) {
        const { data: agentNum } = await supabaseAdmin
          .from('crm_sms_numbers').select('phone').eq('user_id', user.id).eq('is_active', true)
          .in('channel', ['sms', 'both']).maybeSingle();
        if (agentNum?.phone) fromNumber = normalizePhone(agentNum.phone);
      }
      if (!fromNumber) {
        const { data: companyNum } = await supabaseAdmin
          .from('crm_sms_numbers').select('phone').eq('is_company', true).eq('is_active', true)
          .in('channel', ['sms', 'both']).maybeSingle();
        if (companyNum?.phone) fromNumber = normalizePhone(companyNum.phone);
      }
      if (!fromNumber) {
        messagingServiceSid = settings?.messaging_service_sid || Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') || null;
      }
      if (!fromNumber) {
        const { data: legacy } = await supabase
          .from('crm_email_settings').select('twilio_from_number').eq('user_id', user.id).maybeSingle();
        if (legacy?.twilio_from_number) fromNumber = normalizePhone(legacy.twilio_from_number);
      }
    }
    if (!fromNumber && !messagingServiceSid) {
      return new Response(JSON.stringify({
        error: channel === 'whatsapp'
          ? 'No WhatsApp sender configured. Add a WhatsApp number in Messaging Settings.'
          : 'No Twilio sender configured. Add a number in CRM Settings → SMS, or set a Messaging Service SID.',
        code: 'NO_SENDER',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Strict WhatsApp guard: settings.whatsapp_from must match the resolved sender
    // and pass a basic E.164 check. Skips when an explicit override or MS SID is in use.
    if (channel === 'whatsapp' && fromNumber && !body?.skip_preflight) {
      const settingsFromRaw = (settings?.whatsapp_from || '').toString();
      const settingsFromE164 = settingsFromRaw.replace(/^whatsapp:/i, '').trim();
      const isE164 = /^\+[1-9]\d{7,14}$/.test(fromNumber);
      if (!isE164) {
        return new Response(JSON.stringify({
          error: `WhatsApp sender ${fromNumber} is not in E.164 format.`,
          code: 'WA_BAD_FORMAT',
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (settingsFromE164 && settingsFromE164 !== fromNumber && !from_override) {
        return new Response(JSON.stringify({
          error: `Resolved WhatsApp sender ${fromNumber} does not match crm_sms_settings.whatsapp_from (${settingsFromE164}). Run Health Check.`,
          code: 'WA_SENDER_MISMATCH',
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Optional SMS-only opt-out footer. Use destination phone + channel, not contact_id,
    // so duplicate CRM contacts with the same phone do not get repeated footers.
    let finalBody = message;
    if (channel === 'sms' && settings?.append_optout_first_msg) {
      const { count } = await supabaseAdmin
        .from('crm_sms_log').select('id', { count: 'exact', head: true })
        .eq('to_number', to).eq('channel', 'sms').eq('direction', 'outbound');
      const footer = (settings.optout_footer || ' Reply STOP to opt out.').trim();
      if ((count ?? 0) === 0 && !finalBody.toLowerCase().includes(footer.toLowerCase())) {
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
        channel,
        client_dedupe_id,
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
        channel,
        client_dedupe_id,
        scheduled_for: new Date(Date.now() + 5 * 60_000).toISOString(),
        error_message: 'Twilio not yet connected — message recorded for later delivery.',
      }).select('id').maybeSingle();
      return new Response(JSON.stringify({
        ok: true, queued: true, twilio_pending: true, log_id: logged?.id,
        message: 'Twilio is not connected yet. Message saved and will send once configured.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build Twilio request — WhatsApp requires "whatsapp:" prefix on To and From
    const twTo = channel === 'whatsapp' ? `whatsapp:${to}` : to;
    const twFrom = channel === 'whatsapp' && fromNumber ? `whatsapp:${fromNumber}` : fromNumber;

    const params = new URLSearchParams();
    params.set('To', twTo);
    if (twFrom) params.set('From', twFrom);
    if (messagingServiceSid && !fromNumber) params.set('MessagingServiceSid', messagingServiceSid);
    params.set('Body', finalBody);
    media_urls.forEach((u) => params.append('MediaUrl', u));
    // Status webhook
    const statusCallback = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-sms-webhook?type=status`;
    params.set('StatusCallback', statusCallback);

    fallbackLog = {
      user_id: user.id, contact_id, direction: 'outbound',
      to_number: to, from_number: fromNumber, body: finalBody, media_urls,
      message_type: media_urls.length > 0 ? 'mms' : 'sms',
      status: 'queued', campaign_id, channel, client_dedupe_id,
      scheduled_for: new Date(Date.now() + 60_000).toISOString(),
      error_message: 'Temporary sending issue — queued for automatic retry.',
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
    };

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
    const friendlyError = friendlyTwilioError(twilioData?.code, twilioData?.message);

    if (!twilioRes.ok) {
      const transient = isTransientStatus(twilioRes.status);
      const { data: logged } = await supabaseAdmin.from('crm_sms_log').insert({
        user_id: user.id, contact_id, direction: 'outbound',
        to_number: to, from_number: fromNumber, body: finalBody, media_urls,
        message_type: media_urls.length > 0 ? 'mms' : 'sms',
        status: transient ? 'queued' : 'failed', campaign_id, channel,
        client_dedupe_id,
        scheduled_for: transient ? new Date(Date.now() + 60_000).toISOString() : null,
        error_message: friendlyError ?? `HTTP ${twilioRes.status}`,
        error_code: twilioData?.code ? String(twilioData.code) : null,
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
      }).select('id').maybeSingle();

      if (transient) {
        return new Response(JSON.stringify({
          ok: true, queued: true, retrying: true, log_id: logged?.id,
          message: 'Message queued for automatic retry.',
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        error: friendlyError ?? twilioData?.message ?? 'Twilio send failed', code: twilioData?.code,
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
      channel,
      client_dedupe_id,
    }).select('id').maybeSingle();

    // Mirror into activity events feed
    if (contact_id) {
      try {
        await supabaseAdmin.from('crm_activity_events').insert({
          type: channel === 'whatsapp' ? 'whatsapp_outbound' : 'sms_outbound',
          contact_id,
          lead_phone: to,
          metadata: {
            body: finalBody.slice(0, 500),
            to_number: to,
            from_number: fromNumber,
            media_count: media_urls.length,
            twilio_message_sid: twilioData?.sid ?? null,
            sms_log_id: logged?.id ?? null,
            campaign_id,
            channel,
          },
          occurred_at: new Date().toISOString(),
        });
      } catch (e) { console.error('activity_events insert failed', e); }
    }

    return new Response(JSON.stringify({
      ok: true, sid: twilioData?.sid, status: twilioData?.status, log_id: logged?.id, channel,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('send-sms error:', msg);
    let logId: string | null = null;
    if (supabaseAdmin && fallbackLog) {
      const { data: logged } = await supabaseAdmin
        .from('crm_sms_log')
        .insert({ ...fallbackLog, error_message: msg })
        .select('id')
        .maybeSingle();
      logId = logged?.id ?? null;
    }
    return new Response(JSON.stringify({ ok: true, queued: true, fallback: true, log_id: logId, message: 'Message queued for retry.', detail: msg }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
