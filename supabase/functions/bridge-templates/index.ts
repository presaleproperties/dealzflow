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

    // Upstream (Presale) edge functions can cold-boot or briefly return 503.
    // Retry transient failures up to 3x with short backoff before surfacing.
    let res: Response | null = null;
    let text = "";
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${PRESALE_FUNCTIONS_URL}/bridge-list-templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bridge-secret": bridgeSecret,
        },
        body: JSON.stringify({}),
      });
      text = await res.text();
      lastStatus = res.status;
      if (res.ok) break;
      // Retry only on transient upstream errors (cold boot / 5xx)
      if (res.status < 500 && res.status !== 408 && res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }

    if (!res || !res.ok) {
      console.error("bridge-list-templates upstream error", lastStatus, text);
      // Graceful fallback so the UI doesn't blank — return empty list w/ 200.
      return json(
        { templates: [], upstream_error: true, status: lastStatus, body: text.slice(0, 200) },
        200,
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
