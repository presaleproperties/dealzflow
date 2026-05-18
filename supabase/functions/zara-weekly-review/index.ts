// zara-weekly-review — Sunday 6pm per-agent retrospective.
// Counts of sends, replies, showings booked, deals advanced this week.
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
    const weekStart = new Date(Date.now() - 7 * 86400_000).toISOString();
    const weekKey = new Date().toISOString().slice(0, 10);

    const { data: agents } = await admin
      .from('crm_team')
      .select('id, user_id, display_name')
      .eq('is_active', true)
      .not('user_id', 'is', null);

    for (const a of agents ?? []) {
      const [{ count: showings }, { count: tasks }] = await Promise.all([
        admin.from('crm_showings').select('id', { count: 'exact', head: true }).eq('assigned_agent_id', a.id).gte('created_at', weekStart),
        admin.from('crm_tasks').select('id', { count: 'exact', head: true }).eq('assigned_to', a.id).gte('created_at', weekStart),
      ]);

      const title = `Week in review — ${showings ?? 0} showings, ${tasks ?? 0} tasks`;
      const body = `This week you booked ${showings ?? 0} showings and worked ${tasks ?? 0} tasks. Tap to see top wins.`;

      await admin.from('zara_proactive_nudges').upsert({
        kind: 'weekly_review',
        agent_user_id: a.user_id,
        dedupe_key: `${a.user_id}:${weekKey}`,
        title,
        body,
        payload: { showings, tasks },
      }, { onConflict: 'kind,dedupe_key' });
    }
    return json({ ok: true });
  } catch (e: any) {
    console.error('[zara-weekly-review]', e);
    return json({ error: e?.message ?? 'unknown' }, 500);
  }
});
