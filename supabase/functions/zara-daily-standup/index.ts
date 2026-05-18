// zara-daily-standup — per-agent morning briefing.
// Cron: 7am local (UTC 15:00) daily. Idempotent via dedupe_key=<agent>:<date>.
// Output: one zara_proactive_nudges row per active agent summarizing:
//   - hot leads needing reply
//   - showings today
//   - tasks overdue
//   - top 3 leads by engagement score
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
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();

    const { data: agents } = await admin
      .from('crm_team')
      .select('id, user_id, display_name')
      .eq('is_active', true)
      .not('user_id', 'is', null);

    const created: any[] = [];
    for (const a of agents ?? []) {
      // Hot/cold counts assigned to this agent
      const { data: leads } = await admin
        .from('crm_contacts')
        .select('id, first_name, last_name, tags, last_touch_at, engagement_score')
        .eq('assigned_to', a.id)
        .is('deleted_at', null)
        .limit(500);

      const hot = (leads ?? []).filter((l: any) => (l.tags ?? []).includes('hot'));
      const cold24 = (leads ?? []).filter(
        (l: any) => !l.last_touch_at || new Date(l.last_touch_at).getTime() < Date.now() - 7 * 86400_000,
      );
      const topByEngagement = [...(leads ?? [])]
        .filter((l: any) => Number(l.engagement_score ?? 0) > 0)
        .sort((x: any, y: any) => (y.engagement_score ?? 0) - (x.engagement_score ?? 0))
        .slice(0, 3);

      const { count: showingsToday } = await admin
        .from('crm_showings')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_agent_id', a.id)
        .gte('scheduled_at', today + 'T00:00:00Z')
        .lt('scheduled_at', today + 'T23:59:59Z');

      const title = `Morning brief — ${hot.length} hot, ${cold24.length} stale, ${showingsToday ?? 0} showings`;
      const body = [
        hot.length ? `${hot.length} hot leads to follow up.` : null,
        topByEngagement.length ? `Top warm: ${topByEngagement.map((l: any) => `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim()).join(', ')}` : null,
        cold24.length ? `${cold24.length} leads with no touch in 7+ days.` : null,
      ].filter(Boolean).join(' ');

      const dedupe_key = `${a.user_id}:${today}`;
      const { error } = await admin
        .from('zara_proactive_nudges')
        .upsert(
          {
            kind: 'daily_standup',
            agent_user_id: a.user_id,
            dedupe_key,
            title,
            body,
            payload: {
              hot_ids: hot.map((l: any) => l.id),
              top_warm_ids: topByEngagement.map((l: any) => l.id),
              showings_today: showingsToday ?? 0,
            },
          },
          { onConflict: 'kind,dedupe_key' },
        );
      if (!error) created.push({ agent: a.display_name, title });
    }
    return json({ ok: true, created });
  } catch (e: any) {
    console.error('[zara-daily-standup]', e);
    return json({ error: e?.message ?? 'unknown' }, 500);
  }
});
