// CRM proxy → Presale Properties' bridge-list-templates.
// Returns the live list of campaign_templates from Presale,
// authenticated with PRESALE_BRIDGE_SECRET + PRESALE_ANON_KEY.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Prefer the canonical Presale env names; fall back to legacy names so we
// don't regress if only one set is provisioned.
const BRIDGE_URL =
  Deno.env.get("PRESALE_BRIDGE_URL") ??
  "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1";
const BRIDGE_SECRET =
  Deno.env.get("PRESALE_BRIDGE_SECRET") ?? Deno.env.get("BRIDGE_SECRET") ?? "";
const ANON_KEY = Deno.env.get("PRESALE_ANON_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const missing: string[] = [];
    if (!BRIDGE_SECRET) missing.push("PRESALE_BRIDGE_SECRET");
    if (!ANON_KEY) missing.push("PRESALE_ANON_KEY");
    if (missing.length) {
      return json({ error: `Missing env: ${missing.join(", ")}`, templates: [] }, 500);
    }

    // Upstream (Presale) edge functions can cold-boot or briefly return 503.
    // Retry transient failures up to 3x with short backoff before surfacing.
    let res: Response | null = null;
    let text = "";
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${BRIDGE_URL}/bridge-list-templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bridge-secret": BRIDGE_SECRET,
          "Authorization": `Bearer ${ANON_KEY}`,
          "apikey": ANON_KEY,
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
        { templates: [], upstream_error: true, status: lastStatus, body: text.slice(0, 300) },
        200,
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { templates: [] };
    }
    return json(data, 200);
  } catch (e) {
    console.error("bridge-templates error", e);
    return json(
      { error: e instanceof Error ? e.message : "Internal error", templates: [] },
      500,
    );
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
