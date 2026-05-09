// Proxy to Presale Properties' `serve-auto-templates` endpoint.
// - GET  → list available auto-response templates
// - POST → render a template with project + agent + recipient payload
//
// We keep BRIDGE_SECRET server-side only; the CRM never sees it.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const PRESALE_URL =
  "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1/serve-auto-templates";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret =
    Deno.env.get("BRIDGE_SECRET") ?? Deno.env.get("PRESALE_BRIDGE_SECRET");
  if (!secret) return json({ error: "bridge_secret_missing" }, 500);

  // Require an authenticated CRM user (any signed-in user is fine — we only
  // gate the *presence* of a session; per-tenant rules are server-rendered
  // upstream).
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  try {
    if (req.method === "GET") {
      const r = await fetch(PRESALE_URL, {
        method: "GET",
        headers: { "x-bridge-secret": secret },
      });
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.text();
      const r = await fetch(PRESALE_URL, {
        method: "POST",
        headers: {
          "x-bridge-secret": secret,
          "Content-Type": "application/json",
        },
        body,
      });
      const text = await r.text();
      return new Response(text, {
        status: r.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return json({ error: "method_not_allowed" }, 405);
  } catch (e) {
    console.error("[fetch-presale-templates] error", e);
    return json({ error: (e as Error).message }, 502);
  }
});
