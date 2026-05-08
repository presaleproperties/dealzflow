// Issues a one-time SSO link into Presale Properties' Agent Hub.
// Caller must be an authenticated DealsFlow user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRESALE_URL =
  "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1/bridge-issue-agent-token";

const ALLOWED_REDIRECTS = [
  "/dashboard/email-builder",
  "/dashboard/decks",
  "/dashboard/messages",
  "/dashboard/profile",
  "/dashboard",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const requested = (body?.redirect_to || "/dashboard/email-builder").toString();
    const redirect_to =
      ALLOWED_REDIRECTS.find((r) => requested === r || requested.startsWith(r + "?")) ||
      "/dashboard/email-builder";

    const secret = Deno.env.get("PRESALE_BRIDGE_SECRET");
    if (!secret) return json({ error: "PRESALE_BRIDGE_SECRET not configured" }, 500);

    const r = await fetch(PRESALE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-secret": secret,
      },
      body: JSON.stringify({ agent_email: user.email, redirect_to }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.action_link) {
      return json({ error: data?.error || "Handoff failed" }, r.status || 500);
    }

    return json({ ok: true, open_url: data.action_link, agent: data.agent });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
