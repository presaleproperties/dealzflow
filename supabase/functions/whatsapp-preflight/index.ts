// Strict WhatsApp send preflight.
// Verifies: settings.whatsapp_enabled + whatsapp_from is set, the number is in
// E.164, it appears as an approved Twilio WhatsApp Sender (or the sandbox
// number), the Twilio gateway is reachable, and the SMS sender match.
// Returns { ok, blockers[], checks[], resolved } so the UI can gate sends.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';
const SANDBOX_NUMBER = '+14155238886';

type Check = { id: string; label: string; status: 'ok' | 'warn' | 'fail'; detail: string };

function isE164(n: string) { return /^\+[1-9]\d{7,14}$/.test(n); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const checks: Check[] = [];
  const blockers: string[] = [];

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');

    // 1. Twilio connector
    if (LOVABLE_API_KEY && TWILIO_API_KEY) {
      checks.push({ id: 'connector', label: 'Twilio connector linked', status: 'ok', detail: 'Gateway credentials present.' });
    } else {
      checks.push({ id: 'connector', label: 'Twilio connector linked', status: 'fail', detail: 'TWILIO_API_KEY missing.' });
      blockers.push('Twilio connector not linked.');
    }

    // 2. Settings row
    const { data: settings } = await admin.from('crm_sms_settings').select('*').limit(1).maybeSingle();
    if (!settings) {
      checks.push({ id: 'settings_row', label: 'Messaging settings row', status: 'fail', detail: 'crm_sms_settings is empty.' });
      blockers.push('Messaging settings row missing.');
    } else {
      checks.push({ id: 'settings_row', label: 'Messaging settings row', status: 'ok', detail: `id ${settings.id}` });
    }

    // 3. whatsapp_enabled
    const waEnabled = !!settings?.whatsapp_enabled;
    if (waEnabled) {
      checks.push({ id: 'wa_enabled', label: 'WhatsApp enabled in settings', status: 'ok', detail: 'whatsapp_enabled = true' });
    } else {
      checks.push({ id: 'wa_enabled', label: 'WhatsApp enabled in settings', status: 'fail', detail: 'whatsapp_enabled = false' });
      blockers.push('WhatsApp toggle is off in messaging settings.');
    }

    // 4. whatsapp_from configured
    const rawFrom: string | null = settings?.whatsapp_from ?? null;
    const waFromE164 = rawFrom ? rawFrom.replace(/^whatsapp:/i, '').trim() : null;
    if (!waFromE164) {
      checks.push({ id: 'wa_from_present', label: 'whatsapp_from configured', status: 'fail', detail: 'No whatsapp_from value in settings.' });
      blockers.push('whatsapp_from is empty in crm_sms_settings.');
    } else if (!isE164(waFromE164)) {
      checks.push({ id: 'wa_from_present', label: 'whatsapp_from configured', status: 'fail', detail: `Not E.164: "${waFromE164}"` });
      blockers.push('whatsapp_from is not in E.164 format (e.g. +17789006978).');
    } else {
      checks.push({ id: 'wa_from_present', label: 'whatsapp_from configured', status: 'ok', detail: rawFrom! });
    }

    // 5. Matches an active whatsapp row in crm_sms_numbers (informational)
    if (waFromE164) {
      const { data: row } = await admin
        .from('crm_sms_numbers')
        .select('phone,is_active,label')
        .eq('channel', 'whatsapp')
        .eq('phone', waFromE164)
        .maybeSingle();
      if (row) {
        checks.push({
          id: 'wa_db_row', label: 'Matches crm_sms_numbers row',
          status: row.is_active ? 'ok' : 'warn',
          detail: row.is_active ? `Active row "${row.label}"` : 'Row exists but inactive.',
        });
      } else {
        checks.push({ id: 'wa_db_row', label: 'Matches crm_sms_numbers row', status: 'warn', detail: 'No row in crm_sms_numbers for this phone.' });
      }
    }

    // 6. Sandbox vs approved sender check via Twilio
    let isSandbox = false;
    let approvedSender = false;
    let twilioDetail = '';

    if (waFromE164 && LOVABLE_API_KEY && TWILIO_API_KEY) {
      isSandbox = waFromE164 === SANDBOX_NUMBER;
      try {
        // Use Messaging v1 Senders endpoint (WhatsApp senders live here, not /IncomingPhoneNumbers).
        const r = await fetch(`https://messaging.twilio.com/v2/Channels/Senders?PageSize=200`, {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            'X-Connection-Api-Key': TWILIO_API_KEY,
          },
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && Array.isArray(j.senders)) {
          const wa = j.senders.filter((s: { sender_id?: string; status?: string }) =>
            (s.sender_id || '').toLowerCase().startsWith('whatsapp:'),
          );
          const match = wa.find((s: { sender_id?: string }) =>
            (s.sender_id || '').replace(/^whatsapp:/i, '') === waFromE164,
          );
          if (match) {
            approvedSender = (match as { status?: string }).status?.toUpperCase() === 'ONLINE';
            twilioDetail = `Sender status: ${(match as { status?: string }).status ?? 'unknown'}`;
          } else {
            twilioDetail = `Not found in Senders v2 (${wa.length} WA senders on account).`;
          }
        } else {
          twilioDetail = j?.message ?? `HTTP ${r.status}`;
        }
      } catch (e) {
        twilioDetail = `Lookup error: ${(e as Error).message}`;
      }

      if (isSandbox) {
        checks.push({
          id: 'wa_sender_approval', label: 'Approved WhatsApp Sender',
          status: 'warn',
          detail: `Using Twilio Sandbox (${SANDBOX_NUMBER}). Recipients must opt in with the join code first; not for production.`,
        });
      } else if (approvedSender) {
        checks.push({ id: 'wa_sender_approval', label: 'Approved WhatsApp Sender', status: 'ok', detail: twilioDetail });
      } else {
        checks.push({
          id: 'wa_sender_approval', label: 'Approved WhatsApp Sender',
          status: 'fail',
          detail: twilioDetail || `${waFromE164} is not an approved WhatsApp Sender on this Twilio account.`,
        });
        blockers.push(`whatsapp_from ${waFromE164} does not match an approved Twilio WhatsApp Sender.`);
      }
    }

    const ok = blockers.length === 0;
    return new Response(JSON.stringify({
      ok,
      blockers,
      checks,
      resolved: {
        whatsapp_from: rawFrom,
        e164: waFromE164,
        is_sandbox: isSandbox,
        approved_sender: approvedSender,
      },
      generated_at: new Date().toISOString(),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, blockers, checks }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
