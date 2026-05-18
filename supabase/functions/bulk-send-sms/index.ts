// Bulk SMS sender — Telnyx backed.
// Resolves recipients, renders merge tokens, honors opt-outs, fans out to
// telnyx-send-message. Supports dry_run, immediate fan-out, or scheduling.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function firstName(c: Record<string, any>): string {
  const full = (c.full_name ?? c.name ?? '').toString().trim();
  if (c.first_name) return String(c.first_name).trim();
  if (full) return full.split(/\s+/)[0];
  return 'there';
}

function renderTokens(body: string, c: Record<string, any>): string {
  const map: Record<string, string> = {
    first_name: firstName(c),
    name: firstName(c),
    full_name: (c.full_name ?? c.name ?? firstName(c)).toString(),
    last_name: (c.last_name ?? '').toString(),
    email: (c.email ?? '').toString(),
    phone: (c.phone ?? '').toString(),
    city: (c.city ?? '').toString(),
  };
  return body
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => map[k] ?? '')
    .replace(/\{\$\s*([\w.]+)\s*\}/g, (_, k) => map[k] ?? '')
    .replace(/\$\{\s*([\w.]+)\s*\}/g, (_, k) => map[k] ?? '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) return json({ error: 'unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const {
      name = 'Untitled blast',
      body: text,
      media_urls = [],
      contact_ids = [],
      filter = null,
      scheduled_for = null,
      throttle_per_min = 30,
      dry_run = false,
      channel = 'sms',
    } = body as Record<string, any>;

    if (!text && (!media_urls || media_urls.length === 0)) {
      return json({ error: 'body or media_urls required' }, 400);
    }
    if (!['sms', 'whatsapp'].includes(channel)) {
      return json({ error: 'channel must be sms|whatsapp' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Resolve recipients
    let contacts: any[] = [];
    if (Array.isArray(contact_ids) && contact_ids.length > 0) {
      const { data } = await admin
        .from('crm_contacts')
        .select('id, first_name, last_name, full_name, name, phone, phone_secondary, email, city')
        .in('id', contact_ids)
        .is('deleted_at', null);
      contacts = data ?? [];
    } else if (filter && typeof filter === 'object') {
      let q = admin
        .from('crm_contacts')
        .select('id, first_name, last_name, full_name, name, phone, phone_secondary, email, city')
        .is('deleted_at', null);
      if (filter.assigned_to) q = q.eq('assigned_to', filter.assigned_to);
      if (filter.status) q = q.eq('status', filter.status);
      if (filter.lead_type) q = q.eq('lead_type', filter.lead_type);
      if (Array.isArray(filter.tags) && filter.tags.length) q = q.contains('tags', filter.tags);
      const { data } = await q.limit(2000);
      contacts = data ?? [];
    }

    contacts = contacts.filter((c) => c.phone && String(c.phone).trim().length >= 7);
    if (contacts.length === 0) return json({ error: 'no_recipients' }, 400);

    // 2. Filter opt-outs
    const phones = contacts.map((c) => String(c.phone).replace(/\D/g, '').slice(-10));
    const { data: optOuts } = await admin
      .from('crm_sms_opt_outs')
      .select('phone')
      .in('phone', phones);
    const optOutSet = new Set((optOuts ?? []).map((o: any) => String(o.phone).replace(/\D/g, '').slice(-10)));
    const recipients = contacts.filter((c) => !optOutSet.has(String(c.phone).replace(/\D/g, '').slice(-10)));

    if (recipients.length === 0) return json({ error: 'all_recipients_opted_out' }, 400);

    if (dry_run) {
      return json({
        ok: true,
        dry_run: true,
        recipient_count: recipients.length,
        filtered_opt_outs: contacts.length - recipients.length,
        preview: renderTokens(text ?? '', recipients[0]),
      });
    }

    // 3. Create campaign row
    const { data: campaign, error: campErr } = await admin
      .from('crm_sms_campaigns')
      .insert({
        name,
        body: text ?? '',
        channel,
        media_urls: media_urls?.length ? media_urls : [],
        recipients_count: recipients.length,
        sent_count: 0,
        failed_count: 0,
        status: scheduled_for ? 'scheduled' : 'sending',
        scheduled_for: scheduled_for ?? null,
        started_at: scheduled_for ? null : new Date().toISOString(),
        throttle_per_min,
        created_by: userId,
      })
      .select('id')
      .single();
    if (campErr) return json({ error: 'campaign_create_failed', detail: campErr.message }, 500);

    // 4. Scheduled path → drop rows into sms_outbound_queue, let cron drain.
    if (scheduled_for) {
      const rows = recipients.map((c) => ({
        contact_id: c.id,
        to_number: c.phone,
        body: renderTokens(text ?? '', c),
        media_urls: media_urls?.length ? media_urls : [],
        campaign_id: campaign.id,
        requested_by: userId,
        scheduled_for,
        status: 'queued',
      }));
      // chunk inserts
      for (let i = 0; i < rows.length; i += 500) {
        await admin.from('sms_outbound_queue').insert(rows.slice(i, i + 500));
      }
      return json({ ok: true, scheduled: true, campaign_id: campaign.id, recipient_count: recipients.length });
    }

    // 5. Immediate fan-out via telnyx-send-message (parallel, throttled)
    const SEND_URL = `${SUPABASE_URL}/functions/v1/telnyx-send-message`;
    let sent = 0;
    let failed = 0;

    async function sendOne(c: any) {
      try {
        const res = await fetch(SEND_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            apikey: ANON_KEY,
          },
          body: JSON.stringify({
            to: c.phone,
            body: renderTokens(text ?? '', c),
            channel,
            contact_id: c.id,
            media_urls: media_urls?.length ? media_urls : [],
            client_dedupe_id: `${campaign.id}:${c.id}`,
          }),
        });
        if (res.ok) sent++;
        else failed++;
      } catch (_e) {
        failed++;
      }
    }

    // Simple concurrency = min(8, throttle_per_min/6)
    const concurrency = Math.max(1, Math.min(8, Math.floor((throttle_per_min ?? 30) / 6)));
    for (let i = 0; i < recipients.length; i += concurrency) {
      const chunk = recipients.slice(i, i + concurrency);
      await Promise.all(chunk.map(sendOne));
    }

    await admin
      .from('crm_sms_campaigns')
      .update({
        status: failed > 0 && sent === 0 ? 'failed' : 'sent',
        sent_count: sent,
        failed_count: failed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', campaign.id);

    return json({
      ok: true,
      campaign_id: campaign.id,
      recipient_count: recipients.length,
      sent,
      failed,
    });
  } catch (e) {
    console.error('[bulk-send-sms]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
