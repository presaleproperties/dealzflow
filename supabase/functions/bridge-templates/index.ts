// CRM proxy → Presale Properties' bridge-list-templates.
// Returns the live list of campaign_templates from Presale,
// authenticated end-to-end with BRIDGE_SECRET.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PRESALE_FUNCTIONS_URL =
  "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const bridgeSecret = Deno.env.get("BRIDGE_SECRET");
    if (!bridgeSecret) {
      return json({ error: "BRIDGE_SECRET not configured" }, 500);
    }

    const res = await fetch(`${PRESALE_FUNCTIONS_URL}/bridge-list-templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-secret": bridgeSecret,
      },
      body: JSON.stringify({}),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("bridge-list-templates upstream error", res.status, text);
      return json(
        { error: "Upstream error", status: res.status, body: text.slice(0, 500) },
        502,
      );
    }

    let data: any;
    try { data = JSON.parse(text); } catch { data = { templates: [] }; }
    return json(data, 200);
  } catch (e) {
    console.error("bridge-templates error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
