// Cron-driven processor — picks up scheduled SMS rows and scheduled campaigns and dispatches them.
// Designed to run every minute via pg_cron.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    let scheduledSent = 0;
    let scheduledFailed = 0;
    let campaignsStarted = 0;

    // 1. Process due individual scheduled messages
    const { data: due } = await admin
      .from('crm_sms_log').select('*').eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString()).limit(100);

    for (const row of due || []) {
      if (!TWILIO_API_KEY || !LOVABLE_API_KEY) {
        await admin.from('crm_sms_log').update({
          status: 'queued',
          error_message: 'Twilio not connected at scheduled time.',
        }).eq('id', row.id);
        continue;
      }
      try {
        const params = new URLSearchParams();
        const isWa = row.channel === 'whatsapp';
        params.set('To', isWa ? `whatsapp:${row.to_number}` : row.to_number);
        if (row.from_number) params.set('From', isWa ? `whatsapp:${row.from_number}` : row.from_number);
        params.set('Body', row.body);
        (row.media_urls || []).forEach((u: string) => params.append('MediaUrl', u));
        params.set('StatusCallback', `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-sms-webhook?type=status`);

        const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            'X-Connection-Api-Key': TWILIO_API_KEY,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params,
        });
        const td = await res.json();
        if (res.ok) {
          await admin.from('crm_sms_log').update({
            status: td?.status ?? 'sent',
            twilio_message_sid: td?.sid ?? null,
            sent_at: new Date().toISOString(),
          }).eq('id', row.id);
          scheduledSent++;
        } else {
          await admin.from('crm_sms_log').update({
            status: 'failed',
            error_message: td?.message ?? `HTTP ${res.status}`,
            error_code: td?.code ? String(td.code) : null,
          }).eq('id', row.id);
          scheduledFailed++;
        }
      } catch (e) {
        await admin.from('crm_sms_log').update({
          status: 'failed',
          error_message: e instanceof Error ? e.message : 'unknown',
        }).eq('id', row.id);
        scheduledFailed++;
      }
    }

    // 2. Promote scheduled campaigns whose time has come (mark as sending — UI polls)
    const { data: campaigns } = await admin
      .from('crm_sms_campaigns').select('id').eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString()).limit(20);

    for (const c of campaigns || []) {
      // Mark sending and let recipients be processed
      await admin.from('crm_sms_campaigns').update({
        status: 'sending', started_at: new Date().toISOString(),
      }).eq('id', c.id);

      // Process queued recipients in batches
      const { data: queued } = await admin.from('crm_sms_campaign_recipients')
        .select('*').eq('campaign_id', c.id).eq('status', 'queued').limit(200);

      const { data: campData } = await admin.from('crm_sms_campaigns').select('body, media_urls, throttle_per_min, from_number').eq('id', c.id).single();
      const delay = Math.max(60_000 / (campData?.throttle_per_min || 60), 50);

      let sent = 0; let failed = 0;
      for (const r of queued || []) {
        if (!TWILIO_API_KEY || !LOVABLE_API_KEY) {
          await admin.from('crm_sms_campaign_recipients').update({
            status: 'failed', error_message: 'Twilio not connected',
          }).eq('id', r.id);
          failed++;
          continue;
        }
        try {
          const params = new URLSearchParams();
          params.set('To', r.phone);
          if (campData?.from_number) params.set('From', campData.from_number);
          params.set('Body', campData?.body || '');
          (campData?.media_urls || []).forEach((u: string) => params.append('MediaUrl', u));
          params.set('StatusCallback', `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-sms-webhook?type=status`);
          const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              'X-Connection-Api-Key': TWILIO_API_KEY,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
          });
          const td = await res.json();
          if (res.ok) {
            const { data: logged } = await admin.from('crm_sms_log').insert({
              contact_id: r.contact_id, direction: 'outbound',
              to_number: r.phone, from_number: campData?.from_number,
              body: campData?.body || '', media_urls: campData?.media_urls || [],
              message_type: (campData?.media_urls || []).length > 0 ? 'mms' : 'sms',
              status: td?.status ?? 'sent', twilio_message_sid: td?.sid ?? null,
              campaign_id: c.id,
            }).select('id').maybeSingle();
            await admin.from('crm_sms_campaign_recipients').update({
              status: 'sent', sent_at: new Date().toISOString(), sms_log_id: logged?.id,
            }).eq('id', r.id);
            sent++;
          } else {
            await admin.from('crm_sms_campaign_recipients').update({
              status: 'failed', error_message: td?.message ?? `HTTP ${res.status}`,
            }).eq('id', r.id);
            failed++;
          }
        } catch (e) {
          await admin.from('crm_sms_campaign_recipients').update({
            status: 'failed', error_message: e instanceof Error ? e.message : 'unknown',
          }).eq('id', r.id);
          failed++;
        }
        await new Promise(r => setTimeout(r, delay));
      }
      await admin.from('crm_sms_campaigns').update({
        status: 'sent', sent_count: sent, failed_count: failed,
        completed_at: new Date().toISOString(),
      }).eq('id', c.id);
      campaignsStarted++;
    }

    return new Response(JSON.stringify({
      ok: true, scheduledSent, scheduledFailed, campaignsStarted,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('process-scheduled-sms error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
