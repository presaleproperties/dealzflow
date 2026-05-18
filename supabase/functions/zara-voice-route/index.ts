// zara-voice-route — push-to-talk pipeline for agents on a lead.
// Accepts: { contactId, audio_base64, mime } OR { contactId, text }
// 1. Transcribe via zara-transcribe (if audio).
// 2. Treat the agent's voice note as an "inbound coaching prompt" — call
//    zara-suggest-reply with kind='draft' channel='sms' so a draft appears
//    in zara_suggested_replies for the lead.
// 3. Return { transcript, draftId }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/zara-guardrails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json();
    const { contactId, audio_base64, mime, text, channel = 'sms' } = body ?? {};
    if (!contactId) return json({ error: 'contactId required' }, 400);

    let transcript: string | null = text ?? null;

    if (!transcript && audio_base64) {
      const tr = await fetch(`${SUPABASE_URL}/functions/v1/zara-transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ audio_base64, mime: mime ?? 'audio/webm' }),
      });
      const tj = await tr.json().catch(() => null);
      transcript = tj?.text ?? null;
      if (!transcript) return json({ error: 'transcription_failed', detail: tj }, 502);
    }

    if (!transcript) return json({ error: 'no_transcript_or_text' }, 400);

    // Hand off to suggest-reply as if the agent is coaching Zara: this becomes
    // the inbound prompt that Zara drafts a response to. Recorded with the
    // voice marker so analytics can distinguish.
    const sr = await fetch(`${SUPABASE_URL}/functions/v1/zara-suggest-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        contactId,
        channel,
        inboundText: transcript,
        inboundAt: new Date().toISOString(),
        // inbound_event_id is a uuid column; voice notes don't have one — let suggest-reply default to null.
        inboundEventId: null,
      }),
    });
    const srBody = await sr.json().catch(() => null);

    return json({ transcript, suggest: srBody });
  } catch (e: any) {
    console.error('[zara-voice-route]', e);
    return json({ error: e?.message ?? 'unknown' }, 500);
  }
});
