// Public endpoint: returns an agent's profile + active event types for the landing page.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const teamSlug = (url.searchParams.get('team') || '').trim().toLowerCase();
    if (!teamSlug) {
      return new Response(JSON.stringify({ error: 'team required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: agent, error: agentErr } = await supabase
      .from('crm_team')
      .select('user_id, slug, display_name, email, headshot_url, brokerage, license_no, timezone, bio')
      .ilike('slug', teamSlug)
      .eq('is_active', true)
      .maybeSingle();

    if (agentErr) throw agentErr;
    if (!agent) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: eventTypes, error: etErr } = await supabase
      .from('crm_scheduler_event_types')
      .select('id, slug, title, description, duration_min, location_type, requires_payment, price_cents, currency, color, sort_order')
      .eq('agent_user_id', agent.user_id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (etErr) throw etErr;

    return new Response(JSON.stringify({ agent, event_types: eventTypes || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
