// zara-reply — autonomous inbound reply handler for Zara (assigned-only)
// POST { contact_id, channel: 'email'|'sms'|'whatsapp', message_text, message_id?, thread_id?, in_reply_to?, references?, subject? }
// Pipeline: guard RPC -> classify+draft (Lovable AI) -> escalate OR send -> audit log
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Channel = 'email' | 'sms' | 'whatsapp';

const SYSTEM_PROMPT = `You are Zara, the digital concierge for The Presale Properties Group, a Surrey BC presale condo brokerage owned by Uzair Muhammad. You handle inbound replies from leads.

Classify the inbound message into ONE intent: faq, objection, hot_signal, cold_response, unsubscribe, wrong_number.

Then draft a reply (max 2 sentences, ALWAYS in English regardless of the contact's preferred language — the language field is internal metadata for human agents only). Reply rules:
- If intent=hot_signal (wants to meet, see in person, make offer, financing question, "ready to buy"): DO NOT answer the substance. Reply: "Absolutely — Uzair will text you within the hour to lock in a time."
- If intent=faq: answer warmly with what you know. If asked about a specific project's price/deposit/floorplan, say: "Let me grab the latest deck for that — Uzair will send shortly."
- If intent=unsubscribe: "Got it — you won't hear from me again. If you change your mind, just text START."
- If intent=wrong_number: "My apologies — removing this number from our system now."
- If intent=cold_response: short warm acknowledgment, offer next micro-action (e.g., "Want me to send the floorplans?").
- If intent=objection: empathetic soft-handle, ask one clarifying question, do NOT push.

Never claim to be human. If asked "are you a bot?" -> "I'm Zara, the digital concierge for The Presale Properties Group. Uzair, the realtor, jumps in personally when things move forward."

Return STRICT JSON only:
{ "intent": "...", "confidence": 0.0-1.0, "reply": "... (English only)", "escalate": bool, "language": "en" }

Set escalate=true if intent=hot_signal OR confidence < 0.65 OR intent=objection.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function callLovableAI(model: string, system: string, user: string): Promise<string> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) throw new Error('LOVABLE_API_KEY missing');
  const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`AI gateway ${r.status}: ${text}`);
  const data = JSON.parse(text);
  return data?.choices?.[0]?.message?.content ?? '{}';
}

// ─── Gmail send (inlined; we can't auth as Zara via gmail-actions because
//     it requires a user JWT). Uses Zara's stored refresh token directly.
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function getValidAccessToken(supabase: any, userId: string): Promise<{ access: string; gmailEmail: string } | null> {
  const { data: token } = await supabase.from('gmail_tokens').select('*').eq('user_id', userId).maybeSingle();
  if (!token) return null;
  const fresh = new Date(token.token_expires_at).getTime() > Date.now() + 5 * 60 * 1000;
  if (fresh) return { access: token.access_token, gmailEmail: token.gmail_email };
  const clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')!;
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: token.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const r = await res.json();
  if (!res.ok || !r.access_token) return null;
  await supabase.from('gmail_tokens').update({
    access_token: r.access_token,
    token_expires_at: new Date(Date.now() + (r.expires_in || 3600) * 1000).toISOString(),
  }).eq('user_id', userId);
  return { access: r.access_token, gmailEmail: token.gmail_email };
}

const encodeHeader = (value: string): string => {
  if (!value) return value;
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(value)) return value;
  const b64 = btoa(unescape(encodeURIComponent(value)));
  return `=?UTF-8?B?${b64}?=`;
};

function wrapReplyHtml(replyText: string, signatureHtml: string | null): string {
  const safe = replyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = `<div style="font-family:'Plus Jakarta Sans','DM Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111111;white-space:pre-wrap">${safe.replace(/\n/g, '<br/>')}</div>`;
  const sig = signatureHtml ?? '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff"><tr><td style="padding:24px 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;margin:0 auto"><tr><td>${body}${sig}</td></tr></table></td></tr></table>`;
}

async function sendGmailAsZara(opts: {
  supabase: any;
  zaraUserId: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  inReplyTo?: string | null;
  references?: string | null;
  gmailThreadId?: string | null;
  displayName?: string;
}): Promise<{ ok: true; gmailMessageId: string; gmailThreadId: string } | { ok: false; error: string }> {
  const tok = await getValidAccessToken(opts.supabase, opts.zaraUserId);
  if (!tok) return { ok: false, error: 'zara_gmail_token_missing_or_invalid' };
  const fromHeader = opts.displayName ? `${encodeHeader(opts.displayName)} <${tok.gmailEmail}>` : tok.gmailEmail;

  const headers = [
    `From: ${fromHeader}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
  ];
  if (opts.inReplyTo) {
    headers.push(`In-Reply-To: ${opts.inReplyTo}`);
    headers.push(`References: ${opts.references ?? opts.inReplyTo}`);
  }
  headers.push('MIME-Version: 1.0');
  const boundary = `bnd_${crypto.randomUUID().replace(/-/g, '')}`;
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    opts.bodyText,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    opts.bodyHtml,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const raw = headers.join('\r\n') + '\r\n\r\n' + parts;
  const encoded = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok.access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      raw: encoded,
      ...(opts.gmailThreadId ? { threadId: opts.gmailThreadId } : {}),
    }),
  });
  const sent = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `gmail_send_failed: ${JSON.stringify(sent).slice(0, 400)}` };
  return { ok: true, gmailMessageId: sent.id, gmailThreadId: sent.threadId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: {
    contact_id?: string; channel?: Channel; message_text?: string;
    message_id?: string;          // gmail_message_id of inbound
    thread_id?: string;           // crm_gmail_messages.thread_id (uuid) — preferred
    gmail_thread_id?: string;     // raw Gmail threadId
    in_reply_to?: string;         // RFC Message-ID header of inbound
    references?: string;
    subject?: string;
  };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { contact_id, channel, message_text, message_id } = body;
  if (!contact_id || !channel || !message_text) {
    return json({ error: 'missing contact_id/channel/message_text' }, 400);
  }

  // ── 1) Guard
  const { data: guard, error: guardErr } = await admin.rpc('zara_can_send_to', { _contact_id: contact_id });
  if (guardErr) {
    console.error('[zara-reply] guard error', guardErr);
    return json({ sent: false, reason: 'guard_error', error: guardErr.message }, 500);
  }
  const allowed = (guard as any)?.allowed === true;
  const reason = (guard as any)?.reason ?? null;
  const zaraId = (guard as any)?.zara_id ?? null;

  if (!allowed) {
    await admin.from('crm_audit_log').insert({
      action: 'zara.blocked',
      table_name: 'crm_contacts',
      record_id: contact_id,
      actor_label: 'zara',
      meta: { reason, channel, message_id, message_preview: message_text.slice(0, 200) },
    });
    return json({ sent: false, reason });
  }

  // ── 2) Contact + recent thread
  const { data: contact } = await admin
    .from('crm_contacts')
    .select('id, first_name, last_name, language, tags, email, phone')
    .eq('id', contact_id)
    .maybeSingle();

  const lang = contact?.language || 'en';
  const fullName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || 'Lead';

  // Pull last 5 messages for context (gmail + sms)
  const [emailHist, smsHist] = await Promise.all([
    admin.from('crm_gmail_messages').select('direction, body_text, snippet, internal_date')
      .eq('contact_id', contact_id).order('internal_date', { ascending: false }).limit(5),
    admin.from('crm_sms_log').select('direction, body, sent_at')
      .eq('contact_id', contact_id).order('sent_at', { ascending: false }).limit(5),
  ]);
  const history = [
    ...(emailHist.data ?? []).map(m => `[email ${m.direction}] ${m.body_text || m.snippet || ''}`),
    ...(smsHist.data ?? []).map(m => `[sms ${m.direction}] ${m.body || ''}`),
  ].slice(0, 5).join('\n');

  // ── 3) Settings + AI
  const { data: settings } = await admin.from('crm_zara_settings').select('*').eq('id', 1).maybeSingle();
  const model = settings?.model_classify || 'google/gemini-3-flash-preview';

  const userMsg = `Inbound channel: ${channel}
Contact name: ${fullName}
Contact preferred spoken language (internal only — STILL reply in English): ${lang}
Recent thread (newest first):
${history || '(none)'}

INBOUND MESSAGE:
"""${message_text}"""

Return strict JSON per the system spec.`;

  let ai: any;
  try {
    const raw = await callLovableAI(model, SYSTEM_PROMPT, userMsg);
    ai = JSON.parse(raw);
  } catch (e) {
    console.error('[zara-reply] AI failure', e);
    await admin.from('crm_audit_log').insert({
      action: 'zara.error', table_name: 'crm_contacts', record_id: contact_id,
      actor_label: 'zara', meta: { stage: 'ai', error: String(e), channel, message_id },
    });
    return json({ sent: false, reason: 'ai_error' }, 500);
  }

  const intent = String(ai?.intent ?? 'unknown');
  const confidence = Number(ai?.confidence ?? 0);
  const reply = String(ai?.reply ?? '').trim();
  const escalate = ai?.escalate === true || intent === 'hot_signal' || intent === 'objection' || confidence < 0.65;

  // ── 4) Escalate path → Uzair specifically (owner role + email gate)
  if (escalate || !reply) {
    const existingTags: string[] = (contact?.tags as string[] | null) ?? [];
    if (!existingTags.includes('hot')) {
      await admin.from('crm_contacts')
        .update({ tags: Array.from(new Set([...existingTags, 'hot'])) })
        .eq('id', contact_id);
    }

    // Resolve Uzair: prefer explicit email match, fall back to owner role.
    const { data: uzair } = await admin.from('crm_team')
      .select('user_id, display_name, email, role')
      .or('email.ilike.uzair@%,email.ilike.info@presaleproperties.com,role.eq.owner')
      .order('role', { ascending: true })   // 'owner' < other roles alphabetically — fine, we just need one
      .limit(1)
      .maybeSingle();

    if (uzair?.user_id) {
      try {
        await admin.rpc('notify_crm', {
          _user_ids: [uzair.user_id],
          _title: `🔥 Hot lead — ${fullName}`,
          _body: `${intent} via ${channel}: ${message_text.slice(0, 120)}`,
          _type: 'zara_escalation',
          _link_to: `/crm/leads/${contact_id}`,
        });
      } catch (e) { console.warn('notify_crm failed', e); }
    }

    await admin.from('crm_audit_log').insert({
      action: 'zara.escalation',
      table_name: 'crm_contacts',
      record_id: contact_id,
      actor_label: 'zara',
      meta: {
        intent, confidence, channel, message_id,
        notified_user_id: uzair?.user_id ?? null,
        notified_email: uzair?.email ?? null,
        inbound_preview: message_text.slice(0, 300),
        suggested_reply: reply,
      },
    });

    admin.from('crm_engagement_events').insert({
      contact_id,
      event_type: 'zara_escalation',
      source: 'zara',
      metadata: { intent, confidence, channel, message_id, notified_email: uzair?.email ?? null },
    }).then(() => {});

    const SUPABASE_URL_ESC = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY_ESC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    fetch(`${SUPABASE_URL_ESC}/functions/v1/zara-roll-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY_ESC}` },
      body: JSON.stringify({
        contact_id,
        inbound_text: message_text,
        draft_text: null,
        kind: 'escalated',
      }),
    }).catch((e) => console.warn('[zara-reply] roll-memory kick (escalation) failed', e));

    return json({ sent: false, escalated: true, intent, confidence, suggested_reply: reply, notified: uzair?.email ?? null });
  }

  // ── 5) Auto-send path
  let sendOk = false;
  let sendErr: string | null = null;
  let sendMeta: Record<string, unknown> = {};

  if (channel === 'sms' || channel === 'whatsapp') {
    const to = contact?.phone;
    if (!to) {
      sendErr = 'no_phone';
    } else {
      try {
        const { data: sendRes, error: sendErrObj } = await admin.functions.invoke('send-sms', {
          body: {
            contact_id, to_number: to, body: reply, channel,
            agent_user_id: zaraId, skip_quiet_hours: false,
          },
        });
        if (sendErrObj) sendErr = sendErrObj.message;
        else {
          sendOk = (sendRes as any)?.ok !== false;
          sendMeta = { sid: (sendRes as any)?.sid, channel: (sendRes as any)?.channel };
        }
      } catch (e) { sendErr = String(e); }
    }
  } else if (channel === 'email') {
    // Resolve Zara identity + connected mailbox
    const { data: zara } = await admin.from('crm_team')
      .select('user_id, email, display_name, sender_signature_html')
      .eq('id', zaraId).maybeSingle();
    if (!zara?.user_id) {
      sendErr = 'zara_team_row_missing';
    } else if (!contact?.email) {
      sendErr = 'no_recipient_email';
    } else {
      // Look up the inbound gmail message for threading headers (subject, message-id, thread)
      let inbound: any = null;
      if (message_id) {
        const { data } = await admin.from('crm_gmail_messages')
          .select('id, gmail_thread_id, message_id_header, subject, thread_id')
          .eq('gmail_message_id', message_id).maybeSingle();
        inbound = data;
      }

      const subjectRaw = body.subject || inbound?.subject || 'your message';
      const subject = /^re:/i.test(subjectRaw) ? subjectRaw : `Re: ${subjectRaw}`;
      const inReplyTo = body.in_reply_to || inbound?.message_id_header || null;
      const references = body.references || inReplyTo;
      const gmailThreadId = body.gmail_thread_id || inbound?.gmail_thread_id || null;

      const html = wrapReplyHtml(reply, zara.sender_signature_html);
      const text = reply;

      const sendRes = await sendGmailAsZara({
        supabase: admin,
        zaraUserId: zara.user_id,
        to: contact.email,
        subject,
        bodyHtml: html,
        bodyText: text,
        inReplyTo,
        references,
        gmailThreadId,
        displayName: zara.display_name || 'Zara Malik',
      });

      if (!sendRes.ok) {
        sendErr = sendRes.error;
      } else {
        sendOk = true;
        sendMeta = {
          gmail_message_id: sendRes.gmailMessageId,
          gmail_thread_id: sendRes.gmailThreadId,
        };

        // Mirror outbound into crm_gmail_messages so it appears in the thread
        // immediately. The sync sweep would also pick it up, but this keeps
        // the activity feed instant.
        try {
          await admin.from('crm_gmail_messages').insert({
            user_id: zara.user_id,
            thread_id: inbound?.thread_id ?? null,
            contact_id,
            gmail_message_id: sendRes.gmailMessageId,
            gmail_thread_id: sendRes.gmailThreadId,
            in_reply_to: inReplyTo,
            direction: 'outbound',
            from_email: zara.email,
            from_name: zara.display_name || 'Zara Malik',
            to_emails: [contact.email],
            subject,
            snippet: reply.slice(0, 140),
            body_text: text,
            body_html: html,
            internal_date: new Date().toISOString(),
          } as any);
        } catch (e) { console.warn('crm_gmail_messages mirror failed', e); }

        // Also append to crm_email_log so analytics + thread health surfaces
        // pick it up. (No sender_agent_slug column — Zara identity is on
        // user_id via crm_team.)
        try {
          await admin.from('crm_email_log').insert({
            contact_id,
            user_id: zara.user_id,
            direction: 'outbound',
            subject,
            body: html,
            sent_at: new Date().toISOString(),
            status: 'sent',
          } as any);
        } catch (e) { /* best-effort */ }
      }
    }
  }

  await admin.from('crm_audit_log').insert({
    action: sendOk ? 'zara.replied' : 'zara.send_failed',
    table_name: 'crm_contacts',
    record_id: contact_id,
    actor_label: 'zara',
    meta: { intent, confidence, channel, message_id, reply, error: sendErr, ...sendMeta },
  });

  // Log engagement event so the lead timeline + scoring pick up the inbound
  // reply + outbound auto-response.
  admin.from('crm_engagement_events').insert({
    contact_id,
    event_type: sendOk ? 'zara_auto_reply' : 'zara_inbound',
    source: 'zara',
    metadata: { intent, confidence, channel, message_id, sent: sendOk, error: sendErr, ...sendMeta },
  }).then(() => {});

  // Roll per-lead memory with the inbound + the reply we just sent.
  // Fire-and-forget; failures must not block the response.
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  fetch(`${SUPABASE_URL}/functions/v1/zara-roll-memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({
      contact_id,
      inbound_text: message_text,
      draft_text: sendOk ? reply : null,
      kind: sendOk ? 'sent' : 'inbound',
    }),
  }).catch((e) => console.warn('[zara-reply] roll-memory kick failed', e));

  // Trigger the next appropriate outbound step for this lead. The planner
  // checks per-lead weekly caps, sandbox mode, and triggers internally, so
  // it's safe to fire on every inbound.
  if (sendOk) {
    fetch(`${SUPABASE_URL}/functions/v1/zara-plan-outbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ contact_id, limit: 1 }),
    }).catch((e) => console.warn('[zara-reply] plan-outbound kick failed', e));
  }

  return json({ sent: sendOk, intent, confidence, reply, error: sendErr, ...sendMeta });
});
