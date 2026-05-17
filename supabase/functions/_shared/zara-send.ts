// Shared autonomous sender for Zara — used by zara-plan-outbound when
// crm_zara_settings.autonomous_outbound = true. Mirrors the send path in
// zara-draft-action so behavior stays consistent.
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

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

export async function autoSendDraft(admin: any, draftId: string): Promise<{ ok: boolean; error?: string; meta?: Record<string, unknown> }> {
  const { data: draft } = await admin.from('crm_zara_drafts').select('*').eq('id', draftId).maybeSingle();
  if (!draft) return { ok: false, error: 'draft_missing' };

  const { data: contact } = await admin.from('crm_contacts')
    .select('id, email, phone, first_name, last_name').eq('id', draft.contact_id).maybeSingle();
  if (!contact) return { ok: false, error: 'contact_missing' };

  const { data: zara } = await admin.from('crm_team')
    .select('id, user_id, email, display_name, sender_signature_html').eq('slug', 'zara').maybeSingle();
  if (!zara?.id) return { ok: false, error: 'zara_team_missing' };

  const subject = (draft.subject ?? '').trim();
  const text = (draft.body ?? '').trim();
  if (!text) return { ok: false, error: 'empty_body' };

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
    sent_at: sendOk ? new Date().toISOString() : null,
    send_meta: { ...sendMeta, error: sendErr, autonomous: true },
  }).eq('id', draftId);

  await admin.from('crm_audit_log').insert({
    action: sendOk ? 'zara.autonomous_sent' : 'zara.autonomous_send_failed',
    table_name: 'crm_zara_drafts', record_id: draftId, actor_label: 'zara',
    meta: { channel: draft.channel, contact_id: contact.id, error: sendErr, ...sendMeta },
  });

  // Outbound audit row — final provider decision keyed by draft_id.
  try {
    await admin.from('crm_zara_outbound_audit').insert({
      contact_id: contact.id,
      draft_id: draftId,
      channel: draft.channel,
      trigger_kind: draft.trigger_kind ?? null,
      template_key: draft.trigger_kind ?? null,
      subject: draft.subject ?? null,
      confidence: draft.confidence ?? null,
      decision: sendOk ? 'autosent' : 'send_failed',
      decision_reason: sendOk
        ? `delivered via ${draft.channel}`
        : `provider error: ${sendErr ?? 'unknown'}`,
      provider_message_id: (sendMeta as any)?.gmail_message_id ?? (sendMeta as any)?.sid ?? null,
      rule_evaluation: { source: 'autoSendDraft' },
      meta: sendMeta,
    });
  } catch (e) { console.warn('outbound audit insert failed', e); }

  if (sendOk) {
    // Bump last_touch_at on the contact so cold_nudge logic respects this send.
    await admin.from('crm_contacts').update({ last_touch_at: new Date().toISOString() }).eq('id', contact.id);
  }

  return { ok: sendOk, error: sendErr ?? undefined, meta: sendMeta };
}
