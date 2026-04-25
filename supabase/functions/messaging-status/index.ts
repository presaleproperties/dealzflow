// Messaging status check — reports Twilio + DB readiness for SMS and WhatsApp.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';
const VERIFY_URL = 'https://connector-gateway.lovable.dev/api/v1/verify_credentials';

type Check = {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const checks: Check[] = [];
  const blockers: string[] = [];

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');

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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Twilio connector secret present
    if (TWILIO_API_KEY && LOVABLE_API_KEY) {
      checks.push({ id: 'connector', label: 'Twilio connector linked', status: 'ok', detail: 'TWILIO_API_KEY available via gateway.' });
    } else {
      checks.push({ id: 'connector', label: 'Twilio connector linked', status: 'fail', detail: 'TWILIO_API_KEY missing — connect Twilio in Connectors.' });
      blockers.push('Twilio connector not linked.');
    }

    // 2. Verify credentials via gateway
    let twilioReachable = false;
    if (TWILIO_API_KEY && LOVABLE_API_KEY) {
      try {
        const v = await fetch(VERIFY_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'X-Connection-Api-Key': TWILIO_API_KEY,
          },
        });
        const vj = await v.json().catch(() => ({}));
        if (v.ok && (vj.outcome === 'verified' || vj.outcome === 'skipped')) {
          twilioReachable = true;
          checks.push({ id: 'twilio_auth', label: 'Twilio credentials valid', status: 'ok', detail: `Verified in ${vj.latency_ms ?? '?'}ms.` });
        } else {
          checks.push({ id: 'twilio_auth', label: 'Twilio credentials valid', status: 'fail', detail: vj.error || vj.message || `HTTP ${v.status}` });
          blockers.push('Twilio credentials failed verification.');
        }
      } catch (e) {
        checks.push({ id: 'twilio_auth', label: 'Twilio credentials valid', status: 'fail', detail: (e as Error).message });
        blockers.push('Could not reach Twilio gateway.');
      }
    }

    // 3. SMS settings row
    const { data: settings } = await supabaseAdmin.from('crm_sms_settings').select('*').limit(1).maybeSingle();
    if (settings) {
      checks.push({ id: 'settings_row', label: 'Messaging settings row', status: 'ok', detail: `Quiet hours ${settings.enforce_quiet_hours ? 'on' : 'off'} · Throttle ${settings.default_throttle_per_min}/min` });
    } else {
      checks.push({ id: 'settings_row', label: 'Messaging settings row', status: 'fail', detail: 'No row in crm_sms_settings — go to Setup tab to create defaults.' });
      blockers.push('No messaging settings row.');
    }

    // 4. SMS sender numbers
    const { data: smsNums } = await supabaseAdmin
      .from('crm_sms_numbers').select('phone,label,is_company,is_active,user_id').eq('channel', 'sms').eq('is_active', true);
    const smsCompany = (smsNums || []).filter((n) => n.is_company);
    const smsAgent = (smsNums || []).filter((n) => !n.is_company);
    if ((smsNums?.length || 0) > 0) {
      checks.push({
        id: 'sms_route', label: 'SMS sender route', status: 'ok',
        detail: `${smsCompany.length} company · ${smsAgent.length} agent number(s) · ${(smsNums || []).map((n) => n.phone).join(', ')}`,
      });
    } else if (settings?.messaging_service_sid) {
      checks.push({ id: 'sms_route', label: 'SMS sender route', status: 'ok', detail: `Messaging Service ${settings.messaging_service_sid}` });
    } else {
      checks.push({ id: 'sms_route', label: 'SMS sender route', status: 'fail', detail: 'No SMS numbers and no Messaging Service SID configured.' });
      blockers.push('SMS has no sender route.');
    }

    // 5. WhatsApp enabled
    const waEnabled = !!settings?.whatsapp_enabled;
    const waFrom: string | null = settings?.whatsapp_from ?? null;
    const waMs: string | null = settings?.whatsapp_messaging_service_sid ?? null;
    if (waEnabled) {
      checks.push({ id: 'wa_enabled', label: 'WhatsApp toggle', status: 'ok', detail: 'whatsapp_enabled = true' });
    } else {
      checks.push({ id: 'wa_enabled', label: 'WhatsApp toggle', status: 'warn', detail: 'whatsapp_enabled is false — flip it on in Setup.' });
    }

    // 6. WhatsApp sender
    if (waEnabled && (waFrom || waMs)) {
      checks.push({
        id: 'wa_route', label: 'WhatsApp sender route', status: 'ok',
        detail: waFrom ? `From: ${waFrom}` : `Messaging Service: ${waMs}`,
      });
    } else if (waEnabled) {
      checks.push({ id: 'wa_route', label: 'WhatsApp sender route', status: 'fail', detail: 'No whatsapp_from or whatsapp_messaging_service_sid set.' });
      blockers.push('WhatsApp has no sender (set whatsapp_from to whatsapp:+E164).');
    } else {
      checks.push({ id: 'wa_route', label: 'WhatsApp sender route', status: 'warn', detail: 'Disabled.' });
    }

    // 7. WhatsApp DB number entry (informational — not strictly required for sending)
    const { data: waNums } = await supabaseAdmin
      .from('crm_sms_numbers').select('phone,label').eq('channel', 'whatsapp').eq('is_active', true);
    if ((waNums?.length || 0) > 0) {
      checks.push({ id: 'wa_numbers', label: 'WhatsApp numbers (DB)', status: 'ok', detail: (waNums || []).map((n) => n.phone).join(', ') });
    } else {
      checks.push({ id: 'wa_numbers', label: 'WhatsApp numbers (DB)', status: 'warn', detail: 'No whatsapp rows in crm_sms_numbers (UI listing only — sending uses settings.whatsapp_from).' });
    }

    // 8. Approved sender check via Twilio (best-effort — only if WA configured)
    if (twilioReachable && waEnabled && waFrom) {
      try {
        const e164 = waFrom.replace(/^whatsapp:/, '');
        const r = await fetch(`${GATEWAY_URL}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(e164)}`, {
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'X-Connection-Api-Key': TWILIO_API_KEY!,
          },
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && Array.isArray(j.incoming_phone_numbers) && j.incoming_phone_numbers.length > 0) {
          checks.push({ id: 'wa_twilio', label: 'WhatsApp sender owned in Twilio', status: 'ok', detail: `Found ${e164} on this Twilio account.` });
        } else {
          checks.push({
            id: 'wa_twilio', label: 'WhatsApp sender owned in Twilio',
            status: 'warn',
            detail: `${e164} not found in IncomingPhoneNumbers — confirm WhatsApp Sender approval (or sandbox join) in Twilio Console.`,
          });
        }
      } catch (e) {
        checks.push({ id: 'wa_twilio', label: 'WhatsApp sender owned in Twilio', status: 'warn', detail: `Lookup failed: ${(e as Error).message}` });
      }
    }

    // 9. Recent send activity
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from('crm_sms_log')
      .select('channel,status')
      .gte('created_at', since);
    const r = recent || [];
    const byChannel = (c: string) => r.filter((x) => x.channel === c);
    const failed = (rows: typeof r) => rows.filter((x) => ['failed', 'undelivered'].includes(x.status || '')).length;
    checks.push({
      id: 'recent_sms', label: 'SMS activity (24h)', status: failed(byChannel('sms')) > 0 ? 'warn' : 'ok',
      detail: `${byChannel('sms').length} sent · ${failed(byChannel('sms'))} failed`,
    });
    checks.push({
      id: 'recent_wa', label: 'WhatsApp activity (24h)', status: failed(byChannel('whatsapp')) > 0 ? 'warn' : 'ok',
      detail: `${byChannel('whatsapp').length} sent · ${failed(byChannel('whatsapp'))} failed`,
    });

    const overall: 'ok' | 'warn' | 'fail' =
      checks.some((c) => c.status === 'fail') ? 'fail'
      : checks.some((c) => c.status === 'warn') ? 'warn'
      : 'ok';

    return new Response(JSON.stringify({
      overall,
      blockers,
      checks,
      sms_ready: !blockers.some((b) => b.toLowerCase().includes('sms')) && !blockers.some((b) => b.toLowerCase().includes('twilio')) && !blockers.some((b) => b.toLowerCase().includes('settings')),
      whatsapp_ready: waEnabled && !!(waFrom || waMs) && twilioReachable,
      sender: { sms_from: smsCompany[0]?.phone || null, whatsapp_from: waFrom, whatsapp_messaging_service_sid: waMs },
      generated_at: new Date().toISOString(),
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, checks, blockers }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
