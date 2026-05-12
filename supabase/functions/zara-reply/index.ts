// zara-reply — autonomous inbound reply handler for Zara (assigned-only)
// POST { contact_id, channel: 'email'|'sms'|'whatsapp', message_text, message_id }
// Pipeline: guard RPC -> classify+draft (Lovable AI) -> escalate OR send -> audit log
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Channel = 'email' | 'sms' | 'whatsapp';

const SYSTEM_PROMPT = `You are Zara, the digital concierge for The Presale Properties Group, a Surrey BC presale condo brokerage owned by Uzair Muhammad. You handle inbound replies from leads.

Classify the inbound message into ONE intent: faq, objection, hot_signal, cold_response, unsubscribe, wrong_number.

Then draft a reply (max 2 sentences, in the contact's preferred language). Reply rules:
- If intent=hot_signal (wants to meet, see in person, make offer, financing question, "ready to buy"): DO NOT answer the substance. Reply: "Absolutely — Uzair will text you within the hour to lock in a time."
- If intent=faq: answer warmly with what you know. If asked about a specific project's price/deposit/floorplan, say: "Let me grab the latest deck for that — Uzair will send shortly."
- If intent=unsubscribe: "Got it — you won't hear from me again. If you change your mind, just text START."
- If intent=wrong_number: "My apologies — removing this number from our system now."
- If intent=cold_response: short warm acknowledgment, offer next micro-action (e.g., "Want me to send the floorplans?").
- If intent=objection: empathetic soft-handle, ask one clarifying question, do NOT push.

Never claim to be human. If asked "are you a bot?" -> "I'm Zara, the digital concierge for The Presale Properties Group. Uzair, the realtor, jumps in personally when things move forward."

Return STRICT JSON only:
{ "intent": "...", "confidence": 0.0-1.0, "reply": "...", "escalate": bool, "language": "en|pa|hi" }

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: { contact_id?: string; channel?: Channel; message_text?: string; message_id?: string };
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
Contact preferred language: ${lang}
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

  // ── 4) Escalate path
  if (escalate || !reply) {
    // Add 'hot' tag (idempotent)
    const existingTags: string[] = (contact?.tags as string[] | null) ?? [];
    if (!existingTags.includes('hot')) {
      await admin.from('crm_contacts')
        .update({ tags: Array.from(new Set([...existingTags, 'hot'])) })
        .eq('id', contact_id);
    }

    // Find Uzair (owner) for notification
    const { data: owner } = await admin.from('crm_team')
      .select('user_id, display_name').eq('role', 'owner').limit(1).maybeSingle();

    if (owner?.user_id) {
      try {
        await admin.rpc('notify_crm', {
          _user_ids: [owner.user_id],
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
      meta: { intent, confidence, channel, message_id,
        inbound_preview: message_text.slice(0, 300),
        suggested_reply: reply },
    });

    return json({ sent: false, escalated: true, intent, confidence, suggested_reply: reply });
  }

  // ── 5) Auto-send path
  let sendOk = false;
  let sendErr: string | null = null;

  if (channel === 'sms' || channel === 'whatsapp') {
    const to = contact?.phone;
    if (!to) {
      sendErr = 'no_phone';
    } else {
      try {
        const { data: sendRes, error: sendErrObj } = await admin.functions.invoke('send-sms', {
          body: { contact_id, to_number: to, body: reply, channel,
                  agent_user_id: zaraId, skip_quiet_hours: false },
        });
        if (sendErrObj) sendErr = sendErrObj.message;
        else sendOk = (sendRes as any)?.ok !== false;
      } catch (e) { sendErr = String(e); }
    }
  } else if (channel === 'email') {
    // v0: log as outbound stub. Actual Gmail send requires Zara's OAuth — flag for later.
    const { data: zara } = await admin.from('crm_team')
      .select('email, gmail_address').eq('id', zaraId).maybeSingle();
    if (!zara?.gmail_address) {
      sendErr = 'zara_gmail_not_connected';
    } else {
      // Log the outbound stub so it appears in the thread; real send should be wired
      // through gmail-actions in a follow-up.
      await admin.from('crm_gmail_messages').insert({
        user_id: null,
        contact_id,
        direction: 'outbound',
        from_email: zara.gmail_address,
        from_name: 'Zara Malik',
        to_emails: contact?.email ? [contact.email] : [],
        subject: 'Re: your message',
        snippet: reply.slice(0, 140),
        body_text: reply,
        body_html: `<p>${reply.replace(/\n/g, '<br/>')}</p>`,
        internal_date: new Date().toISOString(),
      } as any);
      sendOk = true;
    }
  }

  await admin.from('crm_audit_log').insert({
    action: sendOk ? 'zara.replied' : 'zara.send_failed',
    table_name: 'crm_contacts',
    record_id: contact_id,
    actor_label: 'zara',
    meta: { intent, confidence, channel, message_id, reply, error: sendErr },
  });

  return json({ sent: sendOk, intent, confidence, reply, error: sendErr });
});
