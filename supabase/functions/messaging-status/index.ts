// Messaging status — Twilio has been removed. Reports a clean "disabled" state.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const body = {
    overall: 'warn',
    blockers: ['Twilio integration removed — SMS/WhatsApp sending is disabled.'],
    checks: [
      { id: 'connector', label: 'Twilio connector', status: 'warn', detail: 'Disconnected — SMS/voice/WhatsApp disabled.' },
    ],
    sms_ready: false,
    whatsapp_ready: false,
    sender: { sms_from: null, whatsapp_from: null, whatsapp_messaging_service_sid: null },
    generated_at: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
