import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
    ...(payload.tags ? { tags: Array.isArray(payload.tags) ? payload.tags : [] } : {}),
    ...(payload.notes ? { description: payload.notes } : {}),
  };

  const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // Try Bearer first, then token auth
    let res = await fetch(`${LOFTY_API_BASE}/api/v2/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOFTY_API_KEY}`,
      },
      body: JSON.stringify(loftyLead),
    });

    // If Bearer fails, try token format
    if (res.status === 401) {
      await res.text(); // consume body
      res = await fetch(`${LOFTY_API_BASE}/api/v2/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `token ${LOFTY_API_KEY}`,
        },
        body: JSON.stringify(loftyLead),
      });
    }

    const responseBody = await res.text();

    // Log the push attempt
    await serviceClient.from("crm_sync_log").insert({
      source: "lofty_push",
      event_type: res.ok ? "lead.pushed" : "lead.push_failed",
      contact_email: (payload.email as string) || null,
      contact_name: `${payload.first_name || ""} ${payload.last_name || ""}`.trim(),
      status: res.ok ? "success" : "failed",
      error_message: res.ok ? null : `HTTP ${res.status}: ${responseBody.substring(0, 300)}`,
      payload_preview: JSON.stringify(loftyLead).substring(0, 500),
    });

    if (!res.ok) {
      console.error(`Lofty API error [${res.status}]:`, responseBody);
      return new Response(
        JSON.stringify({ success: false, error: `Lofty API returned ${res.status}`, details: responseBody.substring(0, 300) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let loftyResponse;
    try { loftyResponse = JSON.parse(responseBody); } catch { loftyResponse = { raw: responseBody.substring(0, 200) }; }

    // If Lofty returned an ID, update the local contact's lofty_id
    const loftyId = loftyResponse?.id ?? loftyResponse?.data?.id ?? null;
    if (loftyId && payload.contact_id) {
      await serviceClient.from("crm_contacts")
        .update({ lofty_id: String(loftyId), sync_source: "lofty_api_sync", lofty_synced_at: new Date().toISOString() })
        .eq("id", payload.contact_id as string);
    }

    return new Response(
      JSON.stringify({ success: true, lofty_id: loftyId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Lofty push error:", err);
    await serviceClient.from("crm_sync_log").insert({
      source: "lofty_push",
      event_type: "lead.push_failed",
      contact_email: (payload.email as string) || null,
      contact_name: `${payload.first_name || ""} ${payload.last_name || ""}`.trim(),
      status: "failed",
      error_message: String(err),
    });
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
