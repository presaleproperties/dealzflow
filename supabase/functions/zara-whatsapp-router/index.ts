// zara-whatsapp-router — single Meta Cloud API webhook.
// GET: verify-token handshake. POST: route agent thumbs-up replies and lead inbound messages.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/zara-guardrails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VERIFY_TOKEN = Deno.env.get('META_WHATSAPP_VERIFY_TOKEN');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // GET handshake
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (!VERIFY_TOKEN) return new Response('verify_token_not_configured', { status: 500 });
    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('forbidden', { status: 403 });
  }

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const payload = await req.json();

    // Meta webhook shape: entry[].changes[].value.messages[]
    const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
    for (const m of messages) {
      const from = m.from; // E.164 without leading +
      const text = m.text?.body ?? '';
      const ctxId = m.context?.id; // wamid of message replied to

      // If reply context matches an outgoing Zara notification, treat sender as the AGENT
      if (ctxId) {
        const { data: mapRow } = await admin
          .from('zara_whatsapp_message_map')
          .select('draft_id, agent_id')
          .eq('whatsapp_message_id', ctxId)
          .maybeSingle();
        if (mapRow) {
          const trimmed = text.trim();
          const lower = trimmed.toLowerCase();
          let action: 'approve' | 'edit' | 'reject' | 'unknown' = 'unknown';
          let finalText: string | null = null;

          if (trimmed === '👍' || ['yes', 'send'].includes(lower)) action = 'approve';
          else if (trimmed.startsWith('✏️') || lower.includes('edit:')) {
            action = 'edit';
            finalText = trimmed.replace(/^✏️\s*/, '').replace(/^edit:\s*/i, '').trim();
          } else if (trimmed === '❌' || ['no', 'reject', 'skip'].includes(lower)) action = 'reject';

          if (action === 'approve' || action === 'edit') {
            const { data: draft } = await admin
              .from('zara_suggested_replies')
              .select('draft_text')
              .eq('id', mapRow.draft_id)
              .maybeSingle();
            await admin.functions.invoke('zara-execute-send', {
              body: {
                draftId: mapRow.draft_id,
                finalText: finalText ?? draft?.draft_text ?? '',
                decidedBy: mapRow.agent_id,
                decidedVia: 'whatsapp_thumbs',
              },
            });
          } else if (action === 'reject') {
            await admin.from('zara_suggested_replies').update({ status: 'rejected' }).eq('id', mapRow.draft_id);
            const { data: draft } = await admin.from('zara_suggested_replies').select('contact_id').eq('id', mapRow.draft_id).maybeSingle();
            await admin.from('zara_approval_decisions').insert({
              draft_id: mapRow.draft_id,
              contact_id: draft?.contact_id,
              decision: 'reject',
              original_text: '',
              decided_by: mapRow.agent_id,
              decided_via: 'whatsapp_thumbs',
            });
          } else {
            // ambiguous — could send a help reply, but skip to keep simple
          }
          continue;
        }
      }

      // LEAD inbound — match phone or create contact
      const normalized = from?.replace(/\D/g, '');
      const { data: matched } = await admin
        .from('crm_contacts')
        .select('id, zara_enabled, tags')
        .or(`phone.ilike.%${normalized?.slice(-10)}%,phone_secondary.ilike.%${normalized?.slice(-10)}%`)
        .limit(1)
        .maybeSingle();
      let contactId = matched?.id;
      if (!contactId) {
        const { data: created } = await admin
          .from('crm_contacts')
          .insert({
            first_name: 'WhatsApp',
            last_name: from ?? 'unknown',
            phone: from,
            tags: ['whatsapp_auto_created'],
            status: 'New Lead',
          })
          .select('id')
          .single();
        contactId = created?.id;
      }
      if (!contactId) continue;

      const inboundAt = new Date().toISOString();
      const { data: eventRow } = await admin
        .from('crm_engagement_events')
        .insert({
          contact_id: contactId,
          event_type: 'whatsapp_replied',
          source: 'whatsapp',
          direction: 'inbound',
          metadata: { text, from },
        })
        .select('id')
        .single();

      admin.functions
        .invoke('zara-suggest-reply', {
          body: { contactId, channel: 'whatsapp', inboundText: text, inboundAt, inboundEventId: eventRow?.id },
        })
        .then(() => {});
    }

    return json({ ok: true });
  } catch (e) {
    console.error('[zara-whatsapp-router]', e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
