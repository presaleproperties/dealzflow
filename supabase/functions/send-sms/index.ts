// SMS sending is DISABLED — Twilio integration has been removed.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({
    success: false,
    disabled: true,
    error: 'SMS sending is disabled. Twilio has been removed from this workspace.',
  }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
