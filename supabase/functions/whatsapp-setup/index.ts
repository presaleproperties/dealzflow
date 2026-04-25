// One-click WhatsApp setup: ensures crm_sms_settings row, enables whatsapp,
// sets whatsapp_from, and inserts/activates a matching crm_sms_numbers row.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeE164(input: string): string | null {
  if (!input) return null;
  const t = input.trim().replace(/^whatsapp:/i, '');
  if (t.startsWith('+')) {
    const d = t.slice(1).replace(/\D/g, '');
    return d.length >= 8 ? `+${d}` : null;
  }
  const d = t.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return d.length >= 8 ? `+${d}` : null;
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

    const body = await req.json().catch(() => ({}));
    const action: 'enable' | 'disable' = body?.action === 'disable' ? 'disable' : 'enable';
    const labelInput: string = (body?.label || 'DealzFlow WhatsApp').toString().slice(0, 60);
    const messagingServiceSid: string | null = body?.messaging_service_sid?.toString().trim() || null;

    // Resolve the phone to use:
    //  1. explicit body.phone
    //  2. an active company SMS number
    //  3. any active SMS number
    let phoneRaw: string | null = body?.phone?.toString() || null;
    if (!phoneRaw) {
      const { data: smsNums } = await admin
        .from('crm_sms_numbers')
        .select('phone,is_company,is_active')
        .eq('channel', 'sms')
        .eq('is_active', true);
      const company = (smsNums || []).find((n) => n.is_company);
      phoneRaw = company?.phone || smsNums?.[0]?.phone || null;
    }

    const phone = phoneRaw ? normalizeE164(phoneRaw) : null;
    if (action === 'enable' && !phone && !messagingServiceSid) {
      return new Response(JSON.stringify({
        error: 'No phone number found. Add an SMS number first or pass { phone: "+1..." }.',
        code: 'NO_PHONE',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1. Ensure a settings row exists
    const { data: existing } = await admin.from('crm_sms_settings').select('id').limit(1).maybeSingle();
    let settingsId = existing?.id as string | undefined;
    if (!settingsId) {
      const { data: created, error: createErr } = await admin
        .from('crm_sms_settings').insert({}).select('id').single();
      if (createErr) throw createErr;
      settingsId = created.id;
    }

    if (action === 'disable') {
      await admin.from('crm_sms_settings').update({
        whatsapp_enabled: false,
        updated_at: new Date().toISOString(),
      }).eq('id', settingsId);
      await admin.from('crm_sms_numbers').update({ is_active: false }).eq('channel', 'whatsapp');
      return new Response(JSON.stringify({ success: true, action: 'disabled' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Enable WhatsApp + sender on settings
    const updates: Record<string, unknown> = {
      whatsapp_enabled: true,
      updated_at: new Date().toISOString(),
    };
    if (phone) updates.whatsapp_from = `whatsapp:${phone}`;
    if (messagingServiceSid) updates.whatsapp_messaging_service_sid = messagingServiceSid;

    const { error: updErr } = await admin.from('crm_sms_settings').update(updates).eq('id', settingsId);
    if (updErr) throw updErr;

    // 3. Upsert WhatsApp channel row in crm_sms_numbers
    let inserted_or_updated_number_id: string | null = null;
    if (phone) {
      const { data: existingWa } = await admin
        .from('crm_sms_numbers')
        .select('id')
        .eq('channel', 'whatsapp')
        .eq('phone', phone)
        .maybeSingle();

      if (existingWa) {
        await admin.from('crm_sms_numbers')
          .update({ is_active: true, label: labelInput, updated_at: new Date().toISOString() })
          .eq('id', existingWa.id);
        inserted_or_updated_number_id = existingWa.id;
      } else {
        const { data: created, error: insErr } = await admin.from('crm_sms_numbers')
          .insert({
            channel: 'whatsapp',
            phone,
            label: labelInput,
            is_active: true,
            is_company: true,
          })
          .select('id').single();
        if (insErr) throw insErr;
        inserted_or_updated_number_id = created.id;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      action: 'enabled',
      settings_id: settingsId,
      whatsapp_from: phone ? `whatsapp:${phone}` : null,
      whatsapp_messaging_service_sid: messagingServiceSid,
      number_id: inserted_or_updated_number_id,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
