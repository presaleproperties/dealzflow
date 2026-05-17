// zara-refresh-memory — summarizes recent engagement events into zara_lead_memory.
// Scheduled nightly via pg_cron at 03:00 Vancouver (10:00 UTC during PST, 11:00 during PDT — picked 10 UTC).
// Manual trigger: POST ?contact_id=<uuid> or {contact_id} body.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/zara-guardrails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

async function summarize(contactRow: any, events: any[]): Promise<string> {
  if (!ANTHROPIC_API_KEY) return `${events.length} recent events; no summary (anthropic_key_missing).`;
  const name = [contactRow.first_name, contactRow.last_name].filter(Boolean).join(' ') || '(unknown)';
  const lines = events
    .map((e) => `- [${e.occurred_at}] ${e.event_type} (${e.source}${e.direction ? '/' + e.direction : ''}) ${JSON.stringify(e.metadata ?? {}).slice(0, 160)}`)
    .join('\n');
  const prompt = `Summarize this lead for Zara, the AI assistant, in 3-5 sentences. Focus on what they've asked, what they want, their language, and any hot signals. No fluff.

LEAD: ${name}, tags=${(contactRow.tags ?? []).join(',')}, budget=${contactRow.budget_min ?? '?'}-${contactRow.budget_max ?? '?'}, project=${contactRow.project_interest ?? '?'}

LAST 50 EVENTS:
${lines}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const j = await res.json();
  if (!res.ok) return `(summary failed: ${j?.error?.message ?? 'unknown'})`;
  return (j?.content?.[0]?.text ?? '').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const url = new URL(req.url);
    let contactId = url.searchParams.get('contact_id');
    if (!contactId && req.method === 'POST') {
      try { contactId = (await req.json())?.contact_id ?? null; } catch { /* empty body */ }
    }

    const targets: string[] = [];
    if (contactId) {
      targets.push(contactId);
    } else {
      // Nightly: contacts with activity in last 30d, cap 500, prioritize newest inbound
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows } = await admin
        .from('crm_engagement_events')
        .select('contact_id, occurred_at, direction')
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(2000);
      const seen = new Set<string>();
      for (const r of rows ?? []) {
        if (!seen.has(r.contact_id)) { seen.add(r.contact_id); targets.push(r.contact_id); }
        if (targets.length >= 500) break;
      }
    }

    let refreshed = 0;
    for (const id of targets) {
      const [{ data: contact }, { data: events }] = await Promise.all([
        admin.from('crm_contacts').select('*').eq('id', id).maybeSingle(),
        admin
          .from('crm_engagement_events')
          .select('event_type, source, direction, occurred_at, metadata')
          .eq('contact_id', id)
          .order('occurred_at', { ascending: false })
          .limit(50),
      ]);
      if (!contact) continue;
      const summary = await summarize(contact, events ?? []);
      await admin
        .from('zara_lead_memory')
        .upsert({
          contact_id: id,
          summary,
          signals: { event_count: (events ?? []).length },
          refreshed_at: new Date().toISOString(),
          refresh_reason: contactId ? 'manual' : 'nightly',
        });
      refreshed++;
    }

    return json({ ok: true, refreshed });
  } catch (e) {
    console.error('[zara-refresh-memory]', e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
