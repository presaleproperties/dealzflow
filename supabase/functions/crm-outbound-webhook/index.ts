import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Authenticate user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { webhook_url: string; event: string; contact: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { webhook_url, event, contact } = body;

  if (!webhook_url || !event || !contact) {
    return new Response(
      JSON.stringify({ error: "Missing webhook_url, event, or contact" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validate webhook_url is a Zapier URL
  if (!webhook_url.startsWith("https://hooks.zapier.com/")) {
    return new Response(
      JSON.stringify({ error: "Only Zapier webhook URLs are supported" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const payload = {
      event,
      timestamp: new Date().toISOString(),
      source: "dealzflow_crm",
      contact: {
        id: contact.id,
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        phone: contact.phone,
        status: contact.status,
        source: contact.source,
        lead_type: contact.lead_type,
        tags: contact.tags,
        assigned_to: contact.assigned_to,
        project: contact.project,
        projects: contact.projects,
        notes: contact.notes,
        lofty_id: contact.lofty_id,
        budget_min: contact.budget_min,
        budget_max: contact.budget_max,
        address: contact.address,
        city: contact.city,
      },
    };

    const res = await fetch(webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Log to sync log
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase.from("crm_sync_log").insert({
      source: "zapier_outbound",
      event_type: event,
      contact_email: (contact.email as string) || null,
      contact_name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
      status: res.ok ? "success" : "failed",
      error_message: res.ok ? null : `HTTP ${res.status}`,
      payload_preview: JSON.stringify(payload).substring(0, 500),
    });

    return new Response(
      JSON.stringify({ success: res.ok, status: res.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
