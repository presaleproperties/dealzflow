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

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
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

  const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(
    authHeader.replace("Bearer ", "")
  );
  if (claimsErr || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = claimsData.claims.sub as string;

  // Check CRM admin
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: teamRow } = await adminClient
    .from("crm_team")
    .select("role")
    .eq("user_id", userId)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (!teamRow) {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOFTY_API_KEY = Deno.env.get("LOFTY_API_KEY");
  if (!LOFTY_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Lofty API key not configured" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let totalFromLofty = 0;
  let page = 1;
  const pageSize = 100;
  let hasMore = true;

  try {
    while (hasMore) {
      const url = `https://api.lofty.com/api/v1/leads?page=${page}&per_page=${pageSize}`;
      console.log(`Fetching Lofty API: ${url}, key length: ${LOFTY_API_KEY.length}, key prefix: ${LOFTY_API_KEY.substring(0, 8)}...`);
      const resp = await fetch(url, {
        headers: {
          Authorization: `token ${LOFTY_API_KEY}`,
          "Content-type": "application/json",
          Accept: "application/json",
        },
      });

      console.log(`Lofty API response status: ${resp.status}`);

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`Lofty API error body: ${errorText}`);
        return new Response(
          JSON.stringify({
            error: `Lofty API error: ${resp.status}`,
            details: errorText,
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const data = await resp.json();
      const leads = Array.isArray(data) ? data : data.leads || data.data || [];
      totalFromLofty += leads.length;

      if (leads.length === 0 || leads.length < pageSize) {
        hasMore = false;
      }

      for (const lead of leads) {
        try {
          const result = await processLead(adminClient, lead);
          if (result === "inserted") inserted++;
          else if (result === "updated") updated++;
          else skipped++;
        } catch (err) {
          errors++;
          await adminClient.from("crm_sync_log").insert({
            source: "lofty_api_sync",
            event_type: "lead.error",
            lofty_lead_id: String(lead.id || ""),
            contact_email: lead.email || null,
            contact_name: `${lead.first_name || ""} ${lead.last_name || ""}`.trim(),
            status: "failed",
            error_message: String(err),
          });
        }
      }

      page++;
    }

    // Log summary
    await adminClient.from("crm_sync_log").insert({
      source: "lofty_api_sync",
      event_type: "sync.completed",
      contact_name: `Full sync: ${inserted} new, ${updated} updated, ${skipped} skipped, ${errors} errors`,
      status: "success",
    });

    return new Response(
      JSON.stringify({
        success: true,
        total_from_lofty: totalFromLofty,
        inserted,
        updated,
        skipped,
        errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processLead(
  supabase: ReturnType<typeof createClient>,
  lead: Record<string, unknown>
): Promise<"inserted" | "updated" | "skipped"> {
  const contact: Record<string, unknown> = {
    first_name: lead.first_name || lead.firstName || "",
    last_name: lead.last_name || lead.lastName || "",
    email: lead.email || null,
    phone: normalizePhone(lead.phone as string | null),
    source: mapSource((lead.source || lead.lead_source || "Lofty") as string),
    status: mapStatus((lead.status || lead.stage || "New Lead") as string),
    tags: parseTags(lead.tags || []),
    lead_type: lead.property_type || "presale",
    lofty_id: String(lead.id || ""),
    address: lead.address || null,
    notes: lead.notes || null,
    sync_source: "lofty_api_sync",
    lofty_synced_at: new Date().toISOString(),
    contact_type: "lead",
  };

  // Clean nulls
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(contact)) {
    if (v !== null && v !== "" && v !== undefined) clean[k] = v;
  }

  // Deduplicate
  let existingId: string | null = null;

  if (clean.lofty_id) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("lofty_id", clean.lofty_id as string)
      .maybeSingle();
    if (data) existingId = data.id;
  }

  if (!existingId && clean.email) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("email", clean.email as string)
      .maybeSingle();
    if (data) existingId = data.id;
  }

  if (!existingId && clean.phone) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("phone", clean.phone as string)
      .maybeSingle();
    if (data) existingId = data.id;
  }

  if (existingId) {
    // Safe update — don't overwrite Dealzflow-managed fields
    const {
      status: _s,
      assigned_to: _a,
      notes: _n,
      lead_type: _lt,
      ...safeUpdates
    } = clean;

    const { error } = await supabase
      .from("crm_contacts")
      .update({
        ...safeUpdates,
        lofty_updated_at: new Date().toISOString(),
      })
      .eq("id", existingId);

    if (error) throw error;
    return "updated";
  } else {
    const { error } = await supabase.from("crm_contacts").insert(clean);
    if (error) throw error;

    await supabase.from("crm_sync_log").insert({
      source: "lofty_api_sync",
      event_type: "lead.created",
      lofty_lead_id: (clean.lofty_id as string) || null,
      contact_email: (clean.email as string) || null,
      contact_name: `${clean.first_name || ""} ${clean.last_name || ""}`.trim(),
      status: "success",
    });

    return "inserted";
  }
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/[^\d+]/g, "") || null;
}

function mapSource(source: string): string {
  const m: Record<string, string> = {
    facebook: "Facebook Ad",
    "facebook ad": "Facebook Ad",
    instagram: "Instagram",
    tiktok: "TikTok",
    google: "Google Ad",
    website: "presaleproperties.com",
    referral: "Referral",
    manual: "Manual Entry",
    calendly: "Calendly",
    whatsapp: "WhatsApp",
  };
  return m[source.toLowerCase().trim()] || source;
}

function mapStatus(status: string): string {
  const m: Record<string, string> = {
    new: "New Lead",
    "new lead": "New Lead",
    contacted: "Contacted",
    nurturing: "Nurturing",
    hot: "Hot / Engaged",
    "showing booked": "Showing Booked",
    closed: "Closed",
    lost: "Lost / Cold",
  };
  return m[status.toLowerCase().trim()] || "New Lead";
}

function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === "string")
    return tags.split(",").map((t: string) => t.trim()).filter(Boolean);
  return [];
}
