// zara-draft-action — Uzair acts on a pending Zara draft.
// POST { draft_id, action: 'approve'|'reject'|'snooze'|'mute', subject?, body?, reason?, snooze_hours? }
// approve  -> sends via Gmail (email) or send-sms (sms/whatsapp), updates status='sent'
// reject   -> status='rejected' + reason
// snooze   -> status='snoozed' + scheduled_for += hours (default 24)
// mute     -> tags lead with zara:muted for N days (default 7), rejects this draft
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const encodeHeader = (v: string): string => {
  if (!v || !/[^\x00-\x7F]/.test(v)) return v;
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(v)))}?=`;
};

function wrapHtml(text: string, signatureHtml: string | null): string {
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = `<div style="font-family:'Plus Jakarta Sans','DM Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;white-space:pre-wrap">${safe.replace(/\n/g, '<br/>')}</div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff"><tr><td style="padding:24px 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;margin:0 auto"><tr><td>${body}${signatureHtml ?? ''}</td></tr></table></td></tr></table>`;
}

async function getAccess(admin: any, userId: string): Promise<{ access: string; gmailEmail: string } | null> {
  const { data: t } = await admin.from('gmail_tokens').select('*').eq('user_id', userId).maybeSingle();
  if (!t) return null;
  if (new Date(t.token_expires_at).getTime() > Date.now() + 5 * 60_000) return { access: t.access_token, gmailEmail: t.gmail_email };
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')!,
      refresh_token: t.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) return null;
  await admin.from('gmail_tokens').update({
    access_token: j.access_token,
    token_expires_at: new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString(),
  }).eq('user_id', userId);
  return { access: j.access_token, gmailEmail: t.gmail_email };
}

async function sendGmail(admin: any, zaraUserId: string, to: string, subject: string, html: string, text: string, displayName: string) {
  const tok = await getAccess(admin, zaraUserId);
  if (!tok) return { ok: false as const, error: 'zara_gmail_token_missing' };
  const boundary = `bnd_${crypto.randomUUID().replace(/-/g, '')}`;
  const headers = [
    `From: ${encodeHeader(displayName)} <${tok.gmailEmail}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', text,
    `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', html,
    `--${boundary}--`, '',
  ].join('\r\n');
  const raw = headers.join('\r\n') + '\r\n\r\n' + parts;
  const encoded = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok.access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false as const, error: `gmail_send_failed: ${JSON.stringify(j).slice(0, 300)}` };
  return { ok: true as const, gmailMessageId: j.id, gmailThreadId: j.threadId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // Auth: must be a logged-in user with permission on the contact (RLS-checked client).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: { draft_id?: string; action?: string; subject?: string; body?: string; reason?: string; snooze_hours?: number };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  const { draft_id, action } = body;
  if (!draft_id || !action) return json({ error: 'missing draft_id/action' }, 400);

  // Use the user-scoped client for the read so RLS confirms permission.
  const { data: draft, error: dErr } = await userClient
    .from('crm_zara_drafts')
    .select('*')
    .eq('id', draft_id)
    .maybeSingle();
  if (dErr || !draft) return json({ error: 'draft_not_found_or_forbidden' }, 404);
  if (draft.status !== 'pending' && draft.status !== 'snoozed') return json({ error: `draft_status_${draft.status}` }, 409);

  // ── REJECT
  if (action === 'reject') {
    await admin.from('crm_zara_drafts').update({
      status: 'rejected', reject_reason: body.reason ?? null,
      approved_by: user.id, approved_at: new Date().toISOString(),
    }).eq('id', draft_id);
    await admin.from('crm_audit_log').insert({
      action: 'zara.draft_rejected', table_name: 'crm_zara_drafts', record_id: draft_id,
      actor_label: 'uzair', meta: { reason: body.reason, by: user.id },
    });
    return json({ ok: true, action: 'rejected' });
  }

  // ── SNOOZE
  if (action === 'snooze') {
    const hours = Math.max(1, Math.min(168, Number(body.snooze_hours ?? 24)));
    await admin.from('crm_zara_drafts').update({
      status: 'snoozed',
      scheduled_for: new Date(Date.now() + hours * 3600_000).toISOString(),
    }).eq('id', draft_id);
    await admin.from('crm_audit_log').insert({
      action: 'zara.draft_snoozed', table_name: 'crm_zara_drafts', record_id: draft_id,
      actor_label: 'uzair', meta: { hours, by: user.id },
    });
    return json({ ok: true, action: 'snoozed', hours });
  }

  // ── MUTE (also rejects this draft)
  if (action === 'mute') {
    const { data: contact } = await admin.from('crm_contacts').select('tags').eq('id', draft.contact_id).maybeSingle();
    const tags = new Set<string>(((contact?.tags as string[] | null) ?? []));
    tags.add('zara:muted');
    await admin.from('crm_contacts').update({ tags: Array.from(tags) }).eq('id', draft.contact_id);
    await admin.from('crm_zara_drafts').update({
      status: 'rejected', reject_reason: 'muted_lead',
      approved_by: user.id, approved_at: new Date().toISOString(),
    }).eq('id', draft_id);
    await admin.from('crm_audit_log').insert({
      action: 'zara.lead_muted', table_name: 'crm_contacts', record_id: draft.contact_id,
      actor_label: 'uzair', meta: { by: user.id, draft_id },
    });
    return json({ ok: true, action: 'muted' });
  }

  // ── APPROVE & SEND
  if (action !== 'approve') return json({ error: 'unknown_action' }, 400);

  const subject = (body.subject ?? draft.subject ?? '').trim();
  const text = (body.body ?? draft.body ?? '').trim();
  if (!text) return json({ error: 'empty_body' }, 400);

  const { data: contact } = await admin
    .from('crm_contacts').select('id, email, phone, first_name, last_name').eq('id', draft.contact_id).maybeSingle();
  if (!contact) return json({ error: 'contact_missing' }, 404);

  const { data: zara } = await admin.from('crm_team')
    .select('id, user_id, email, display_name, sender_signature_html').eq('slug', 'zara').maybeSingle();
  if (!zara?.id) return json({ error: 'zara_team_missing' }, 500);

  let sendOk = false;
  let sendErr: string | null = null;
  let sendMeta: Record<string, unknown> = {};

  if (draft.channel === 'email') {
    if (!contact.email) sendErr = 'no_recipient_email';
    else if (!zara.user_id) sendErr = 'zara_user_id_missing';
    else {
      const html = wrapHtml(text, zara.sender_signature_html ?? null);
      const finalSubject = subject || `Quick note for ${contact.first_name ?? 'you'}`;
      const r = await sendGmail(admin, zara.user_id, contact.email, finalSubject, html, text, zara.display_name || 'Zara Malik');
      if (!r.ok) sendErr = r.error;
      else {
        sendOk = true;
        sendMeta = { gmail_message_id: r.gmailMessageId, gmail_thread_id: r.gmailThreadId };
        // Mirror into crm_gmail_messages so it shows in the thread
        try {
          await admin.from('crm_gmail_messages').insert({
            user_id: zara.user_id, contact_id: contact.id,
            gmail_message_id: r.gmailMessageId, gmail_thread_id: r.gmailThreadId,
            direction: 'outbound', from_email: zara.email, from_name: zara.display_name || 'Zara Malik',
            to_emails: [contact.email], subject: finalSubject, snippet: text.slice(0, 140),
            body_text: text, body_html: html, internal_date: new Date().toISOString(),
          } as any);
        } catch (e) { console.warn('gmail mirror failed', e); }
        try {
          await admin.from('crm_email_log').insert({
            contact_id: contact.id, user_id: zara.user_id, direction: 'outbound',
            subject: finalSubject, body: html, sent_at: new Date().toISOString(), status: 'sent',
          } as any);
        } catch { /* best-effort */ }
      }
    }
  } else if (draft.channel === 'sms' || draft.channel === 'whatsapp') {
    if (!contact.phone) sendErr = 'no_phone';
    else {
      const { data: sendRes, error: sendErrObj } = await admin.functions.invoke('send-sms', {
        body: {
          contact_id: contact.id, to_number: contact.phone, body: text,
          channel: draft.channel, agent_user_id: zara.id, skip_quiet_hours: false,
        },
      });
      if (sendErrObj) sendErr = sendErrObj.message;
      else { sendOk = (sendRes as any)?.ok !== false; sendMeta = { sid: (sendRes as any)?.sid, channel: (sendRes as any)?.channel }; }
    }
  } else {
    sendErr = 'unknown_channel';
  }

  await admin.from('crm_zara_drafts').update({
    status: sendOk ? 'sent' : 'failed',
    subject: subject || null, body: text,
    approved_by: user.id, approved_at: new Date().toISOString(),
    sent_at: sendOk ? new Date().toISOString() : null,
    send_meta: { ...sendMeta, error: sendErr },
  }).eq('id', draft_id);

  await admin.from('crm_audit_log').insert({
    action: sendOk ? 'zara.draft_sent' : 'zara.draft_send_failed',
    table_name: 'crm_zara_drafts', record_id: draft_id, actor_label: 'uzair',
    meta: { channel: draft.channel, contact_id: contact.id, by: user.id, error: sendErr, ...sendMeta },
  });

  return json({ ok: sendOk, action: 'approved', error: sendErr, ...sendMeta });
});
