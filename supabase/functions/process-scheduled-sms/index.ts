// Scheduled SMS processor is DISABLED — Twilio integration has been removed.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({
    success: true,
    disabled: true,
    processed: 0,
    note: 'Scheduled SMS processor is a no-op. Twilio has been removed.',
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
