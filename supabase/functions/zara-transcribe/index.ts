// Zara push-to-talk transcription via ElevenLabs Scribe v2
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ELEVENLABS_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const inForm = await req.formData();
    const audio = inForm.get('audio');
    if (!(audio instanceof File) && !(audio instanceof Blob)) {
      return new Response(JSON.stringify({ error: 'audio file required (field: audio)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const language = (inForm.get('language') as string) || 'eng';

    const apiForm = new FormData();
    apiForm.append('file', audio, (audio as File).name || 'recording.webm');
    apiForm.append('model_id', 'scribe_v2');
    apiForm.append('language_code', language);
    apiForm.append('tag_audio_events', 'false');
    apiForm.append('diarize', 'false');

    const resp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: apiForm,
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('ElevenLabs STT error', resp.status, err);
      return new Response(JSON.stringify({ error: err || `STT failed: ${resp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const json = await resp.json();
    return new Response(
      JSON.stringify({ text: json.text ?? '', language: json.language_code ?? language }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('zara-transcribe fatal', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
