// zara-handoff-brief — fills pending handoff brief rows (from the trigger)
// with a Zara-generated summary so the incoming agent gets context.
// Can also be called on-demand with { contactId, toUserId }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/zara-guardrails.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let { briefId, contactId, toUserId } = await req.json().catch(() => ({}));

    // If no briefId, find or create one
    let brief: any = null;
    if (briefId) {
      const { data } = await admin.from('zara_handoff_briefs').select('*').eq('id', briefId).maybeSingle();
      brief = data;
    } else {
      // sweep all pending briefs
      const { data: pending } = await admin
        .from('zara_handoff_briefs')
        .select('*')
        .filter('brief->>pending', 'eq', 'true')
        .order('created_at', { ascending: true })
        .limit(20);
      const results: any[] = [];
      for (const b of pending ?? []) results.push(await fillBrief(admin, b));
      return json({ ok: true, filled: results.length });
    }

    if (!brief) return json({ error: 'brief_not_found' }, 404);
    const filled = await fillBrief(admin, brief);
    return json({ ok: true, brief: filled });
  } catch (e: any) {
    console.error('[zara-handoff-brief]', e);
    return json({ error: e?.message ?? 'unknown' }, 500);
  }
});

async function fillBrief(admin: any, brief: any) {
  const { data: contact } = await admin.from('crm_contacts').select('*').eq('id', brief.contact_id).maybeSingle();
  const { data: memory } = await admin.from('zara_lead_memory').select('summary, facts').eq('contact_id', brief.contact_id).maybeSingle();

  const facts = memory?.facts ?? {};
  const summary = memory?.summary ?? 'No prior Zara memory.';

  const briefPayload = {
    lead_name: `${contact?.first_name ?? ''} ${contact?.last_name ?? ''}`.trim() || '(unknown)',
    stage: contact?.status ?? null,
    summary,
    budget: facts.budget_min || facts.budget_max ? `${facts.budget_min ?? '?'} – ${facts.budget_max ?? '?'}` : null,
    timeline: facts.timeline ?? null,
    must_haves: facts.must_haves ?? [],
    next_steps: facts.next_steps ?? [],
    last_objection: facts.last_objection ?? null,
    pending: false,
    generated_at: new Date().toISOString(),
  };

  const summaryLine =
    `${briefPayload.lead_name} — ${briefPayload.stage ?? 'no stage'}. ` +
    [briefPayload.budget && `Budget ${briefPayload.budget}`, briefPayload.timeline].filter(Boolean).join(' · ');

  await admin
    .from('zara_handoff_briefs')
    .update({ brief: briefPayload, summary: summaryLine })
    .eq('id', brief.id);

  return { ...brief, brief: briefPayload, summary: summaryLine };
}
