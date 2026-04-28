// Generates 3 short quick-reply suggestions for a lead given mode (email/text)
// and the most recent conversation context. Uses Lovable AI Gateway.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const contactId: string | undefined = body.contact_id;
    const mode: 'email' | 'text' = body.mode === 'email' ? 'email' : 'text';
    if (!contactId) {
      return new Response(JSON.stringify({ error: 'contact_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pull lead + recent conversation snippets
    const [{ data: contact }, { data: emails }, { data: sms }, { data: notes }] = await Promise.all([
      supabase.from('crm_contacts')
        .select('first_name, last_name, lead_type, segment, project_interest, source, language_preference, notes')
        .eq('id', contactId).maybeSingle(),
      supabase.from('crm_email_log')
        .select('direction, subject, body, sent_at')
        .eq('contact_id', contactId).order('sent_at', { ascending: false }).limit(4),
      supabase.from('crm_sms_log')
        .select('direction, body, sent_at')
        .eq('contact_id', contactId).order('sent_at', { ascending: false }).limit(6),
      supabase.from('crm_notes')
        .select('content, created_at')
        .eq('contact_id', contactId).order('created_at', { ascending: false }).limit(3),
    ]);

    const stripHtml = (s: string | null | undefined) =>
      (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);

    const transcript = [
      ...(emails ?? []).map((e: any) => `[${e.direction} email] ${e.subject ?? ''} — ${stripHtml(e.body)}`),
      ...(sms ?? []).map((s: any) => `[${s.direction} sms] ${stripHtml(s.body)}`),
      ...(notes ?? []).map((n: any) => `[note] ${stripHtml(n.content)}`),
    ].slice(0, 12).join('\n');

    const channelHint = mode === 'email'
      ? 'Each reply is 2-4 sentences, friendly and specific. Plain text only (no greeting / no signature — those are added separately).'
      : 'Each reply is ONE short SMS, max 160 characters, conversational, no emojis.';

    const sysPrompt = `You are a real-estate agent's assistant generating ${mode === 'email' ? 'EMAIL' : 'SMS'} reply drafts.
${channelHint}
Vary the angle: 1) acknowledge & next step  2) ask a clarifying question  3) propose a meeting/showing.
Use the lead's first name if available. Never invent properties or prices.`;

    const userPrompt = `Lead: ${contact?.first_name ?? ''} ${contact?.last_name ?? ''}
Type: ${contact?.lead_type ?? 'unknown'} · Segment: ${contact?.segment ?? '—'}
Project interest: ${contact?.project_interest ?? '—'}
Language: ${contact?.language_preference ?? 'en'}

Recent conversation (newest first):
${transcript || '(no prior messages)'}

Return 3 distinct draft replies.`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'suggest_replies',
            description: 'Return 3 reply drafts',
            parameters: {
              type: 'object',
              properties: {
                replies: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', description: '2-4 word chip label, e.g. "Confirm showing"' },
                      body:  { type: 'string', description: 'The draft text to insert' },
                    },
                    required: ['label', 'body'],
                  },
                },
              },
              required: ['replies'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'suggest_replies' } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error('AI gateway error', aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited, try again shortly' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'Add credits in Settings → Workspace → Usage' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'AI gateway error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await aiResp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let replies: { label: string; body: string }[] = [];
    try {
      replies = JSON.parse(args ?? '{}').replies ?? [];
    } catch {
      replies = [];
    }

    return new Response(JSON.stringify({ replies }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('lead-quick-replies error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
