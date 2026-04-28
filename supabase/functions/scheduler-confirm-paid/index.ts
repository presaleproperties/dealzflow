// Verify a Stripe Checkout session and finalize the booking by calling
// scheduler-public-book server-side, then mark the intent as completed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@14.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session_id') || (await req.json().catch(() => ({})))?.session_id;
    const intentId = url.searchParams.get('intent') || (await req.json().catch(() => ({})))?.intent_id;
    if (!sessionId || !intentId) {
      return new Response(JSON.stringify({ error: 'missing params' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });

    const { data: intent, error: intentErr } = await supabase
      .from('crm_scheduler_payment_intents')
      .select('*').eq('id', intentId).maybeSingle();
    if (intentErr || !intent) throw new Error('intent_not_found');

    // Idempotent: if already confirmed, return the existing booking
    if (intent.status === 'completed' && intent.booking_id) {
      const { data: existing } = await supabase
        .from('crm_scheduler_bookings').select('*').eq('id', intent.booking_id).maybeSingle();
      return new Response(JSON.stringify({ ok: true, booking: existing }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return new Response(JSON.stringify({ error: 'payment_not_completed', status: session.payment_status }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call internal book function with service role
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const bookRes = await fetch(`${SUPABASE_URL}/functions/v1/scheduler-public-book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify({
        team_slug: intent.team_slug,
        event_slug: intent.event_slug,
        start_at: intent.start_at,
        timezone: intent.timezone,
        invitee: intent.invitee_payload,
        answers: intent.answers_payload,
        referrer: intent.referrer,
      }),
    });
    const bookJson = await bookRes.json();
    if (!bookRes.ok) {
      await supabase.from('crm_scheduler_payment_intents')
        .update({ status: 'failed', last_error: JSON.stringify(bookJson) }).eq('id', intentId);
      return new Response(JSON.stringify({ error: bookJson.error || 'book_failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bookingId = bookJson.booking_id;
    await supabase.from('crm_scheduler_bookings').update({
      payment_status: 'paid',
      stripe_session_id: sessionId,
      stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    }).eq('id', bookingId);

    await supabase.from('crm_scheduler_payment_intents')
      .update({ status: 'completed', booking_id: bookingId })
      .eq('id', intentId);

    return new Response(JSON.stringify({ ok: true, booking_id: bookingId, confirmation: bookJson.confirmation }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('confirm-paid error', e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
