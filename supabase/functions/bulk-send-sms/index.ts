// Bulk SMS send / blast — creates a campaign + recipient rows, dispatches to send-sms with throttling.
// Body shape:
//   { name, body, media_urls?, contact_ids?: string[], filter?: jsonb, scheduled_for?, throttle_per_min?, dry_run? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function renderTemplate(body: string, contact: Record<string, unknown>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const path = String(key).split('.');
    let v: any = contact;
    for (const p of path) v = v?.[p];
    if (v === null || v === undefined) return '';
    return String(v);
  });
}

function normalizePhone(input: string): string | null {
  if (!input) return null;
  const t = input.trim();
  if (t.startsWith('+')) {
    const d = t.slice(1).replace(/\D/g, '');
    return d.length >= 8 ? `+${d}` : null;
  }
  const d = t.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return d.length >= 8 ? `+${d}` : null;
}

// 🚨 STAGE MODE 2026-05-16 — bulk SMS is staged (campaign created with
// status='draft', per-recipient log rows written with status='staged'). No
// Twilio dispatch. Admin must release from the staged-queue UI.
const SMS_STAGE_MODE = true;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (SMS_STAGE_MODE) {
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
        { global: { headers: { Authorization: authHeader } } }
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
      const payload = await req.json().catch(() => ({}));
      const name: string = (payload?.name || 'Untitled blast').toString().slice(0, 200);
      const text: string = (payload?.body || '').toString();
      const media_urls: string[] = Array.isArray(payload?.media_urls) ? payload.media_urls : [];
      const contact_ids: string[] = Array.isArray(payload?.contact_ids) ? payload.contact_ids : [];
      const channel: 'sms' | 'whatsapp' = payload?.channel === 'whatsapp' ? 'whatsapp' : 'sms';
      if (!text.trim() || contact_ids.length === 0) {
        return new Response(JSON.stringify({ error: 'body and contact_ids are required to stage a blast' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: contacts } = await admin
        .from('crm_contacts').select('id, first_name, last_name, phone')
        .in('id', contact_ids).not('phone', 'is', null);
      const valid = (contacts || [])
        .map((c: any) => ({ contact: c, phone: normalizePhone(c.phone) }))
        .filter((r: any) => r.phone) as { contact: any; phone: string }[];
      if (valid.length === 0) {
        return new Response(JSON.stringify({ error: 'No recipients with valid phone numbers' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: campaign } = await admin.from('crm_sms_campaigns').insert({
        name: `[STAGED] ${name}`,
        body: text, media_urls,
        segment_filter: { contact_ids: valid.map(v => v.contact.id) },
        recipients_count: valid.length,
        status: 'draft',
        throttle_per_min: 60,
        created_by: user.id,
        channel,
      }).select('id').single();
      // Stage one crm_sms_log row per recipient so the topnav badge reflects
      // total staged messages (not just campaigns) and Discard works per-row.
      const rows = valid.map(r => ({
        user_id: user.id,
        contact_id: r.contact.id,
        direction: 'outbound' as const,
        to_number: r.phone,
        from_number: null as string | null,
        body: renderTemplate(text, r.contact),
        media_urls,
        message_type: media_urls.length > 0 ? 'mms' : 'sms',
        status: 'staged' as const,
        campaign_id: campaign?.id ?? null,
        channel,
        error_message: 'STAGED (bulk) — admin must release before this is sent.',
      }));
      for (let i = 0; i < rows.length; i += 500) {
        await admin.from('crm_sms_log').insert(rows.slice(i, i + 500));
      }
      return new Response(JSON.stringify({
        ok: true, staged: true, campaign_id: campaign?.id, recipient_count: valid.length,
        message: 'Blast staged. An admin must release the staged queue before it is sent.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      return new Response(JSON.stringify({ error: msg, staged: false }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

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
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    const name: string = (payload?.name || 'Untitled blast').toString().slice(0, 200);
    const body: string = (payload?.body || '').toString();
    const media_urls: string[] = Array.isArray(payload?.media_urls) ? payload.media_urls : [];
    const contact_ids: string[] = Array.isArray(payload?.contact_ids) ? payload.contact_ids : [];
    const filter = payload?.filter ?? null;
    const scheduled_for: string | null = payload?.scheduled_for ?? null;
    const throttle_per_min: number = Math.min(Math.max(payload?.throttle_per_min || 60, 1), 240);
    const dry_run = !!payload?.dry_run;
    const channel: 'sms' | 'whatsapp' = payload?.channel === 'whatsapp' ? 'whatsapp' : 'sms';

    if (!body || body.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'body is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!contact_ids.length && !filter) {
      return new Response(JSON.stringify({ error: 'Provide contact_ids or filter' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve recipient list
    let query = admin.from('crm_contacts').select('id, first_name, last_name, phone, email, status, lead_type, tags, projects, assigned_to, city');
    if (contact_ids.length) {
      query = query.in('id', contact_ids);
    } else if (filter) {
      if (filter.statuses?.length) query = query.in('status', filter.statuses);
      if (filter.lead_types?.length) query = query.in('lead_type', filter.lead_types);
      if (filter.assigned_to?.length) query = query.in('assigned_to', filter.assigned_to);
      if (filter.cities?.length) query = query.in('city', filter.cities);
      if (filter.tags?.length) query = query.overlaps('tags', filter.tags);
      if (filter.projects?.length) query = query.overlaps('projects', filter.projects);
    }
    query = query.not('phone', 'is', null);
    const { data: contacts, error: contactsErr } = await query.limit(5000);
    if (contactsErr) throw contactsErr;

    // Filter out missing phones + opt-outs
    const validContacts = (contacts || []).filter(c => c.phone && c.phone.trim().length > 0);
    const phones = validContacts.map(c => normalizePhone(c.phone)).filter(Boolean) as string[];
    const { data: optOuts } = await admin.from('crm_sms_opt_outs').select('phone').in('phone', phones).is('re_opted_in_at', null);
    const optOutSet = new Set((optOuts || []).map(o => o.phone));

    const recipients = validContacts
      .map(c => ({ contact: c, phone: normalizePhone(c.phone) }))
      .filter(r => r.phone && !optOutSet.has(r.phone)) as { contact: any; phone: string }[];

    if (dry_run) {
      return new Response(JSON.stringify({
        ok: true,
        recipient_count: recipients.length,
        opted_out_count: optOutSet.size,
        sample: recipients.slice(0, 5).map(r => ({
          name: `${r.contact.first_name || ''} ${r.contact.last_name || ''}`.trim(),
          phone: r.phone,
          preview: renderTemplate(body, r.contact).slice(0, 160),
        })),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid recipients (after opt-out filtering)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create campaign
    const status = scheduled_for ? 'scheduled' : 'sending';
    const { data: campaign, error: campErr } = await admin.from('crm_sms_campaigns').insert({
      name, body, media_urls,
      segment_filter: contact_ids.length ? { contact_ids } : filter,
      recipients_count: recipients.length,
      status,
      scheduled_for,
      throttle_per_min,
      created_by: user.id,
      channel,
      started_at: scheduled_for ? null : new Date().toISOString(),
    }).select().single();
    if (campErr) throw campErr;

    // Create recipient rows
    const recipientRows = recipients.map(r => ({
      campaign_id: campaign.id,
      contact_id: r.contact.id,
      phone: r.phone,
      status: 'queued',
    }));
    // Insert in chunks to avoid payload limits
    for (let i = 0; i < recipientRows.length; i += 500) {
      await admin.from('crm_sms_campaign_recipients').insert(recipientRows.slice(i, i + 500));
    }

    if (scheduled_for) {
      return new Response(JSON.stringify({
        ok: true, scheduled: true, campaign_id: campaign.id, recipient_count: recipients.length,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Dispatch immediately, throttled. Fire-and-forget per-message via send-sms.
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const delayMs = Math.max(60_000 / throttle_per_min, 50);

    // Don't await every send — kick off background loop
    (async () => {
      let sent = 0; let failed = 0;
      for (const r of recipients) {
        try {
          const personalized = renderTemplate(body, r.contact);
          const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader },
            body: JSON.stringify({
              contact_id: r.contact.id,
              to: r.phone,
              body: personalized,
              media_urls,
              campaign_id: campaign.id,
              channel,
              skip_quiet_hours: true, // already gated at campaign creation
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            sent++;
            await admin.from('crm_sms_campaign_recipients').update({
              status: 'sent', sent_at: new Date().toISOString(), sms_log_id: data?.log_id ?? null,
            }).eq('campaign_id', campaign.id).eq('phone', r.phone);
          } else {
            failed++;
            await admin.from('crm_sms_campaign_recipients').update({
              status: 'failed', error_message: data?.error || `HTTP ${res.status}`,
            }).eq('campaign_id', campaign.id).eq('phone', r.phone);
          }
        } catch (e) {
          failed++;
          console.error('bulk-send-sms dispatch error:', e);
        }
        await new Promise(r => setTimeout(r, delayMs));
      }
      await admin.from('crm_sms_campaigns').update({
        status: 'sent',
        sent_count: sent,
        failed_count: failed,
        completed_at: new Date().toISOString(),
      }).eq('id', campaign.id);
    })();

    return new Response(JSON.stringify({
      ok: true, campaign_id: campaign.id, recipient_count: recipients.length, dispatching: true,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('bulk-send-sms error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
