// Single source of truth for inbound bridge auth (Presale → DealsFlow).
// Accepts either BRIDGE_SECRET (canonical inbound) or PRESALE_BRIDGE_SECRET
// (used historically by receive-presale-activity) so a rotation on either
// side cannot half-break the surface area.
//
// Returns null on success, or a Response (401/500) the caller should return.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function requireBridgeSecret(req: Request): Response | null {
  const provided = req.headers.get("x-bridge-secret") ?? "";
  const a = Deno.env.get("BRIDGE_SECRET") ?? "";
  const b = Deno.env.get("PRESALE_BRIDGE_SECRET") ?? "";
  const expected = [a, b].filter(Boolean);

  if (!expected.length) {
    return new Response(
      JSON.stringify({ error: "server_misconfigured: no bridge secret set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!provided || !expected.includes(provided)) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return null;
}

export { corsHeaders as bridgeCorsHeaders };
