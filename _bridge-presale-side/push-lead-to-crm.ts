// DEPLOY THIS ON: Presale Properties project
// Path: supabase/functions/push-lead-to-crm/index.ts
//
// Call this whenever a new signup happens or behavior data accumulates.
// It pushes the lead + behavior into the CRM via the bridge.

const CRM_INGEST_URL = "https://svbilqvudkkdhslxebce.supabase.co/functions/v1/bridge-ingest-lead";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json();
    // payload: { lead: {...}, behavior: {...} }

    const res = await fetch(CRM_INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-secret": Deno.env.get("BRIDGE_SECRET")!,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[push-lead-to-crm]", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
