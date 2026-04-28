// Public endpoint: create a Stripe Checkout session for a paid event type.
// Returns { url } to redirect invitee. On success, Stripe redirects back to
// /book/{team}/{event}/paid?session_id=... which calls scheduler-confirm-paid
// to finalize the booking.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@14.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { team_slug, event_slug, start_at, invitee, timezone, answers, referrer, origin } = body || {};
    if (!team_slug || !event_slug || !start_at || !invitee?.name || (!invitee?.email && !invitee?.phone)) {
      return new Response(JSON.stringify({ error: 'missing required fields' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: resolved, error: resErr } = await supabase.rpc('crm_scheduler_resolve_slug', {
      _team_slug: String(team_slug).toLowerCase(),
      _event_slug: String(event_slug).toLowerCase(),
    });
    if (resErr || !resolved) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: corsHeaders });
    }
    const evt = resolved.event_type;
    if (!evt.requires_payment || !evt.price_cents) {
      return new Response(JSON.stringify({ error: 'event_not_paid' }), { status: 400, headers: corsHeaders });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'stripe_not_configured' }), { status: 500, headers: corsHeaders });
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

    // Persist a pending intent record so the success page can reconstitute the booking.
    const { data: intent, error: intentErr } = await supabase
      .from('crm_scheduler_payment_intents')
      .insert({
        team_slug, event_slug,
        start_at: new Date(start_at).toISOString(),
        timezone: timezone || 'America/Vancouver',
        invitee_payload: invitee,
        answers_payload: answers || [],
        referrer: referrer || null,
        amount_cents: evt.price_cents,
        currency: (evt.currency || 'CAD').toLowerCase(),
        status: 'pending',
      })
      .select('id').single();
    if (intentErr) throw intentErr;

    const baseOrigin = origin || req.headers.get('origin') || '';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: invitee.email || undefined,
      line_items: [{
        price_data: {
          currency: (evt.currency || 'CAD').toLowerCase(),
          product_data: { name: evt.title, description: `Booking with ${resolved.agent.display_name}` },
          unit_amount: evt.price_cents,
        },
        quantity: 1,
      }],
      success_url: `${baseOrigin}/book/${team_slug}/${event_slug}/paid?session_id={CHECKOUT_SESSION_ID}&intent=${intent.id}`,
      cancel_url: `${baseOrigin}/book/${team_slug}/${event_slug}?canceled=1`,
      metadata: { intent_id: intent.id, team_slug, event_slug },
    });

    await supabase.from('crm_scheduler_payment_intents')
      .update({ stripe_session_id: session.id })
      .eq('id', intent.id);

    return new Response(JSON.stringify({ url: session.url, intent_id: intent.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('create-checkout error', e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
