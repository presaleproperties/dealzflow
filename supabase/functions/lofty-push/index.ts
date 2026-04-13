import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Lofty (Chime) API base — adjust if your region differs
const LOFTY_API_BASE = "https://api.lofty.com";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify JWT
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOFTY_API_KEY = Deno.env.get("LOFTY_API_KEY");
  if (!LOFTY_API_KEY) {
    return new Response(
      JSON.stringify({ error: "LOFTY_API_KEY not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Build Lofty lead payload
  const loftyLead: Record<string, unknown> = {
    firstName: payload.first_name || "",
    lastName: payload.last_name || "",
    ...(payload.email ? { emails: [{ email: payload.email }] } : {}),
    ...(payload.phone ? { phones: [{ phone: payload.phone }] } : {}),
    source: payload.source || "DealsFlow CRM",
    ...(payload.tags
      ? { tags: Array.isArray(payload.tags) ? payload.tags : [] }
      : {}),
    ...(payload.notes ? { description: payload.notes } : {}),
  };

    console.log(`Lofty push: key prefix=${LOFTY_API_KEY.substring(0, 6)}..., len=${LOFTY_API_KEY.length}`);

    // Try v1 leads endpoint with token auth (per Lofty docs)
    const res = await fetch(`${LOFTY_API_BASE}/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `token ${LOFTY_API_KEY}`,
      },
      body: JSON.stringify(loftyLead),
    });

    const responseBody = await res.text();

    // Log the push attempt
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await serviceClient.from("crm_sync_log").insert({
      source: "lofty_push",
      event_type: res.ok ? "lead.pushed" : "lead.push_failed",
      contact_email: (payload.email as string) || null,
      contact_name:
        `${payload.first_name || ""} ${payload.last_name || ""}`.trim(),
      status: res.ok ? "success" : "failed",
      error_message: res.ok ? null : `HTTP ${res.status}: ${responseBody.substring(0, 300)}`,
      payload_preview: JSON.stringify(loftyLead).substring(0, 500),
    });

    if (!res.ok) {
      console.error(`Lofty API error [${res.status}]:`, responseBody);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Lofty API returned ${res.status}`,
          details: responseBody.substring(0, 300),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let loftyResponse;
    try {
      loftyResponse = JSON.parse(responseBody);
    } catch {
      loftyResponse = { raw: responseBody.substring(0, 200) };
    }

    return new Response(
      JSON.stringify({ success: true, lofty_id: loftyResponse?.id || null }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Lofty push error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
