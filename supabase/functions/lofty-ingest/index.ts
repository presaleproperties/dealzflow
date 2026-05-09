import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

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

  // Validate webhook secret — required to prevent unauthenticated lead injection.
  const expectedSecret = Deno.env.get("LOFTY_INGEST_SECRET");
  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const providedSecret =
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-lofty-secret") ||
    new URL(req.url).searchParams.get("secret");
  if (providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Map Zapier/Lofty fields → crm_contacts columns
  // Name handling: never write literal "Unknown". If last name is missing
  // but first name has multiple words, split on the last space.
  let _firstName = String(
    payload.first_name || payload.firstName || payload["First Name"] || ""
  ).trim();
  let _lastName = String(
    payload.last_name || payload.lastName || payload["Last Name"] || ""
  ).trim();

  if (_firstName && /\s/.test(_firstName) && (!_lastName || /^(unknown|\(unknown\))$/i.test(_lastName))) {
    const idx = _firstName.lastIndexOf(" ");
    _lastName = _firstName.slice(idx + 1).trim();
    _firstName = _firstName.slice(0, idx).trim();
  }
  if (/^(unknown|\(unknown\))$/i.test(_lastName)) _lastName = "";
  if (/^(unknown|\(unknown\))$/i.test(_firstName)) _firstName = "";

  const contact: Record<string, unknown> = {
    first_name: _firstName,
    last_name: _lastName,
    email: payload.email || payload.Email || payload.emails || null,
    phone: normalizePhone(
      (payload.phone ||
        payload.Phone ||
        payload.phone_number ||
        payload["Phone Number"] ||
        null) as string | null
    ),
    source: mapSource(
      (payload.source ||
        payload.Source ||
        payload.lead_source ||
        payload["Lead Source"] ||
        "Lofty") as string
    ),
    status: mapStatus(
      (payload.status ||
        payload.Status ||
        payload.stage ||
        payload["Lead Stage"] ||
        "New Lead") as string
    ),
    tags: parseTags(payload.tags || payload.Tags || []),
    lead_type:
      payload.property_type || payload["Property Type"] || "presale",
    lofty_id: String(
      payload.id || payload.Id || payload.lead_id || payload["Lead ID"] || ""
    ),
    address:
      payload.address || payload.Address || payload["Property Address"] || null,
    notes: payload.notes || payload.Notes || payload.description || null,
    sync_source: "zapier_lofty",
    lofty_synced_at: new Date().toISOString(),
    contact_type: "lead",
  };

  // Clean: remove null/empty
  const cleanContact: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(contact)) {
    if (v !== null && v !== "" && v !== undefined) cleanContact[k] = v;
  }

  // Duplicate detection: lofty_id → email → phone
  let existingId: string | null = null;

  if (cleanContact.lofty_id) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("lofty_id", cleanContact.lofty_id as string)
      .maybeSingle();
    if (data) existingId = data.id;
  }

  if (!existingId && cleanContact.email) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("email", cleanContact.email as string)
      .maybeSingle();
    if (data) existingId = data.id;
  }

  if (!existingId && cleanContact.phone) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("phone", cleanContact.phone as string)
      .maybeSingle();
    if (data) existingId = data.id;
  }

  let action = "inserted";

  try {
    if (existingId) {
      // UPDATE — don't overwrite Dealzflow-managed fields
      const {
        status: _s,
        assigned_to: _a,
        notes: _n,
        lead_type: _lt,
        ...safeUpdates
      } = cleanContact;
      const { error: updateErr } = await supabase
        .from("crm_contacts")
        .update({
          ...safeUpdates,
          lofty_updated_at: new Date().toISOString(),
        })
        .eq("id", existingId);
      if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);
      action = "updated";
    } else {
      // INSERT new — default assignment to the team owner (team lead triages)
      const { data: owner } = await supabase
        .from("crm_team")
        .select("display_name")
        .eq("is_active", true)
        .eq("role", "owner")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const defaultAssignee = owner?.display_name || "Uzair Muhammad";
      const { error: insertErr } = await supabase
        .from("crm_contacts")
        .insert({ ...cleanContact, assigned_to: defaultAssignee });
      if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);
      action = "inserted";
    }

    // Log success
    await supabase.from("crm_sync_log").insert({
      source: "zapier_lofty",
      event_type: action === "inserted" ? "lead.created" : "lead.updated",
      lofty_lead_id: (cleanContact.lofty_id as string) || null,
      contact_email: (cleanContact.email as string) || null,
      contact_name:
        `${cleanContact.first_name || ""} ${cleanContact.last_name || ""}`.trim(),
      status: "success",
      payload_preview: JSON.stringify(payload).substring(0, 500),
    });

    return new Response(
      JSON.stringify({
        success: true,
        action,
        lofty_id: cleanContact.lofty_id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    // Log failure
    await supabase.from("crm_sync_log").insert({
      source: "zapier_lofty",
      event_type: "lead.error",
      lofty_lead_id: (cleanContact.lofty_id as string) || null,
      contact_email: (cleanContact.email as string) || null,
      contact_name:
        `${cleanContact.first_name || ""} ${cleanContact.last_name || ""}`.trim(),
      status: "failed",
      error_message: String(err),
      payload_preview: JSON.stringify(payload).substring(0, 500),
    });

    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// --- HELPERS ---

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned || null;
}

function mapSource(source: string): string {
  const m: Record<string, string> = {
    facebook: "Facebook Ad",
    "facebook ad": "Facebook Ad",
    facebook_ad: "Facebook Ad",
    fb: "Facebook Ad",
    instagram: "Instagram",
    ig: "Instagram",
    tiktok: "TikTok",
    "tik tok": "TikTok",
    google: "Google Ad",
    "google ad": "Google Ad",
    google_ad: "Google Ad",
    ppc: "Google Ad",
    website: "presaleproperties.com",
    web: "presaleproperties.com",
    "presaleproperties.com": "presaleproperties.com",
    referral: "Referral",
    manual: "Manual Entry",
    "manual entry": "Manual Entry",
    csv: "CSV Import",
    "csv import": "CSV Import",
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
    active: "Contacted",
    "attempted contact": "Contacted",
    nurturing: "Nurturing",
    warm: "Nurturing",
    "long term": "Nurturing",
    hot: "Hot / Engaged",
    "hot lead": "Hot / Engaged",
    "appointment set": "Showing Booked",
    appointment: "Showing Booked",
    showing: "Showing Booked",
    "under contract": "Offer Made",
    "in contract": "Offer Made",
    pending: "Offer Made",
    closed: "Closed",
    "closed won": "Closed",
    sold: "Closed",
    lost: "Lost / Cold",
    "closed lost": "Lost / Cold",
    dead: "Lost / Cold",
    trash: "Lost / Cold",
    junk: "Lost / Cold",
    "do not contact": "Lost / Cold",
  };
  return m[status.toLowerCase().trim()] || "New Lead";
}

function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === "string")
    return tags
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);
  return [];
}
