// zara-notify-agent — sends WhatsApp notification with draft preview to the assigned agent.
// Live mode only. Caller decides whether to invoke (zara-suggest-reply enforces).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/zara-guardrails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const META_TOKEN = Deno.env.get('META_WHATSAPP_TOKEN');
const META_PHONE_ID = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { draftId } = await req.json();
    if (!draftId) return json({ error: 'draftId required' }, 400);
    if (!META_TOKEN || !META_PHONE_ID) return json({ error: 'meta_whatsapp_secrets_missing' }, 500);

    const { data: draft } = await admin.from('zara_suggested_replies').select('*').eq('id', draftId).maybeSingle();
    if (!draft) return json({ error: 'draft_not_found' }, 404);

    const { data: contact } = await admin
      .from('crm_contacts')
      .select('first_name, last_name')
      .eq('id', draft.contact_id)
      .maybeSingle();

    let agentPhone: string | null = null;
    let agentId: string | null = draft.assigned_to;
    if (agentId) {
      const { data: profile } = await admin.from('profiles').select('id, phone').eq('id', agentId).maybeSingle();
      agentPhone = profile?.phone ?? null;
    }
    if (!agentPhone) return json({ error: 'agent_phone_unknown' }, 400);

    const leadName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || 'Unknown';
    const inboundSnippet = (draft.inbound_text || '').slice(0, 200);
    const guardrailsStr = (draft.guardrails_hit ?? []).length
      ? `\n⚠ Flags: ${(draft.guardrails_hit ?? []).join(', ')}`
      : '';
    const body = `🤖 Zara draft for ${leadName} (${draft.channel})

Lead said:

"${inboundSnippet}"

Zara suggests:

"${draft.draft_text}"

Intent: ${draft.intent} · Confidence: ${draft.confidence}${guardrailsStr}

👍 send · ✏️ edit: <new text> · ❌ skip`;

    const res = await fetch(`https://graph.facebook.com/v18.0/${META_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: agentPhone,
        type: 'text',
        text: { body },
      }),
    });
    const meta = await res.json();
    if (!res.ok) return json({ error: 'meta_send_failed', detail: meta }, 502);

    const wamid = meta?.messages?.[0]?.id;
    if (wamid && agentId) {
      await admin
        .from('zara_whatsapp_message_map')
        .insert({ whatsapp_message_id: wamid, draft_id: draftId, agent_id: agentId });
    }

    return json({ ok: true, wamid });
  } catch (e) {
    console.error('[zara-notify-agent]', e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
