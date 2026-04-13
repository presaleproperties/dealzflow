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

  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!isCron) {
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error } = await anonClient.auth.getUser();
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const LOFTY_API_KEY = Deno.env.get("LOFTY_API_KEY");
  if (!LOFTY_API_KEY) {
    return new Response(
      JSON.stringify({ error: "LOFTY_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    let allLeads: Record<string, unknown>[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore && page <= 50) {
      const url = `${LOFTY_API_BASE}/api/v2/leads?page=${page}&pageSize=${pageSize}`;
      console.log(`Fetching Lofty leads page ${page}...`);

      // Lofty API Key auth: "token [KEY]" per official docs
      const res = await fetchWithAuthFallback(url, LOFTY_API_KEY);

      if (!res.ok) {
        const body = await res.text();
        console.error(`Lofty API error [${res.status}]:`, body);
        await logSync(supabase, "failed", 0, 0, 0, `Lofty API error: ${res.status} - ${body.substring(0, 300)}`);
        return new Response(
          JSON.stringify({ success: false, error: `Lofty API returned ${res.status}`, details: body.substring(0, 300) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      const leads = data.data ?? data.leads ?? (Array.isArray(data) ? data : []);

      if (!Array.isArray(leads) || leads.length === 0) {
        hasMore = false;
        continue;
      }

      allLeads = allLeads.concat(leads);
      hasMore = leads.length >= pageSize;
      page++;
    }

    console.log(`Fetched ${allLeads.length} total leads from Lofty`);

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const lead of allLeads) {
      try {
        const contact = mapLoftyToContact(lead);
        if (!contact.first_name && !contact.last_name) continue;

        let existingId: string | null = null;

        if (contact.lofty_id) {
          const { data } = await supabase.from("crm_contacts").select("id").eq("lofty_id", contact.lofty_id).maybeSingle();
          if (data) existingId = data.id;
        }
        if (!existingId && contact.email) {
          const { data } = await supabase.from("crm_contacts").select("id").eq("email", contact.email).maybeSingle();
          if (data) existingId = data.id;
        }
        if (!existingId && contact.phone) {
          const { data } = await supabase.from("crm_contacts").select("id").eq("phone", contact.phone).maybeSingle();
          if (data) existingId = data.id;
        }

        if (existingId) {
          const { status: _s, assigned_to: _a, notes: _n, lead_type: _lt, tags: _t, ...safeUpdates } = contact;
          const { error } = await supabase.from("crm_contacts")
            .update({ ...safeUpdates, lofty_updated_at: new Date().toISOString() })
            .eq("id", existingId);
          if (!error) updated++; else errors++;
        } else {
          const { error } = await supabase.from("crm_contacts").insert(contact);
          if (!error) created++; else { console.error("Insert error:", error); errors++; }
        }
      } catch (e) {
        console.error("Lead processing error:", e);
        errors++;
      }
    }

    await logSync(supabase, "success", allLeads.length, created, updated, errors > 0 ? `${errors} errors` : null);

    return new Response(
      JSON.stringify({ success: true, total_fetched: allLeads.length, created, updated, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("lofty-pull error:", err);
    await logSync(supabase, "failed", 0, 0, 0, String(err));
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Try "token" auth first (per Lofty docs for API keys), fall back to "Bearer"
async function fetchWithAuthFallback(url: string, apiKey: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "Authorization": `token ${apiKey}`, "Content-Type": "application/json" },
  });
  if (res.status === 401) {
    await res.text(); // consume
    return fetch(url, {
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
  }
  return res;
}

function mapLoftyToContact(lead: Record<string, unknown>): Record<string, unknown> {
  const emails = lead.emails as { email?: string }[] | undefined;
  const phones = lead.phones as { phone?: string }[] | undefined;
  return {
    first_name: (lead.firstName ?? lead.first_name ?? "") as string,
    last_name: (lead.lastName ?? lead.last_name ?? "") as string,
    email: emails?.[0]?.email ?? (lead.email as string | null) ?? null,
    phone: normalizePhone(phones?.[0]?.phone ?? (lead.phone as string | null) ?? null),
    source: mapSource((lead.source as string) || "Lofty"),
    status: mapStatus((lead.stage ?? lead.status ?? "New Lead") as string),
    tags: parseTags(lead.tags),
    lead_type: (lead.propertyType ?? lead.property_type ?? "presale") as string,
    lofty_id: String(lead.id ?? lead.leadId ?? ""),
    address: (lead.address ?? lead.streetAddress ?? null) as string | null,
    notes: (lead.description ?? lead.notes ?? null) as string | null,
    sync_source: "lofty_api_sync",
    lofty_synced_at: new Date().toISOString(),
    contact_type: "lead",
  };
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/[^\d+]/g, "") || null;
}

function mapSource(source: string): string {
  const m: Record<string, string> = {
    facebook: "Facebook Ad", "facebook ad": "Facebook Ad", facebook_ad: "Facebook Ad", fb: "Facebook Ad",
    instagram: "Instagram", ig: "Instagram",
    tiktok: "TikTok", "tik tok": "TikTok",
    google: "Google Ad", "google ad": "Google Ad", google_ad: "Google Ad", ppc: "Google Ad",
    website: "presaleproperties.com", web: "presaleproperties.com",
    referral: "Referral", manual: "Manual Entry",
    calendly: "Calendly", lofty: "Lofty",
  };
  return m[source.toLowerCase().trim()] || source;
}

function mapStatus(status: string): string {
  const m: Record<string, string> = {
    new: "New Lead", "new lead": "New Lead",
    contacted: "Contacted", active: "Contacted", "attempted contact": "Contacted",
    nurturing: "Nurturing", warm: "Nurturing", "long term": "Nurturing",
    hot: "Hot / Engaged", "hot lead": "Hot / Engaged",
    "appointment set": "Showing Booked", appointment: "Showing Booked", showing: "Showing Booked",
    "under contract": "Offer Made", "in contract": "Offer Made", pending: "Offer Made",
    closed: "Closed", "closed won": "Closed", sold: "Closed",
    lost: "Lost / Cold", "closed lost": "Lost / Cold", dead: "Lost / Cold", trash: "Lost / Cold",
    junk: "Lost / Cold", "do not contact": "Lost / Cold",
  };
  return m[status.toLowerCase().trim()] || "New Lead";
}

function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === "string") return tags.split(",").map((t: string) => t.trim()).filter(Boolean);
  return [];
}

async function logSync(
  supabase: ReturnType<typeof createClient>,
  status: string, processed: number, created: number, updated: number, errorMsg: string | null
) {
  await supabase.from("crm_sync_log").insert({
    source: "lofty_pull",
    event_type: status === "success" ? "sync.completed" : "sync.failed",
    status,
    contact_name: `Processed: ${processed}, Created: ${created}, Updated: ${updated}`,
    error_message: errorMsg,
    payload_preview: JSON.stringify({ processed, created, updated }),
  });
}
