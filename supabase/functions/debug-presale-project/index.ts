// Temporary debug: returns the raw bridge-get-project payload for a slug,
// plus the top-level keys, so we can see what asset fields Presale exposes.
import { presaleBridge } from "../_shared/presale-bridge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "the-loop";
  try {
    const data = await presaleBridge.getProject(slug);
    const keys = data && typeof data === "object" ? Object.keys(data as object) : [];
    return new Response(JSON.stringify({ slug, keys, data }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
