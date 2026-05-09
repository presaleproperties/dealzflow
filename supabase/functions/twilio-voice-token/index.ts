// Mints a Twilio Voice Access Token for the calling user's browser SDK.
// Identity = auth.uid() so the SDK's Client identifier matches our routing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import twilio from "npm:twilio@5.3.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    // Confirm user is on the active CRM team
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: teamRow } = await admin
      .from("crm_team")
      .select("id, slug, display_name, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    if (!teamRow) return json({ error: "not on crm team" }, 403);

    const accountSid = need("TWILIO_ACCOUNT_SID");
    const apiKey = need("TWILIO_API_KEY_SID");
    const apiSecret = need("TWILIO_API_KEY_SECRET");
    const appSid = need("TWILIO_TWIML_APP_SID");

    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: appSid,
      incomingAllow: true,
    });

    const accessToken = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: userId,
      ttl: 3600, // 1 hour
    });
    accessToken.addGrant(voiceGrant);

    return json({
      token: accessToken.toJwt(),
      identity: userId,
      agent: { slug: teamRow.slug, display_name: teamRow.display_name },
      ttl: 3600,
    });
  } catch (e) {
    console.error("[twilio-voice-token] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function need(k: string): string {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Missing secret: ${k}`);
  return v;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
