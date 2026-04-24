// Bridge endpoint: Presale Properties → CRM
// Receives new signups + behavior data. Dedupes by email/phone (merge & enrich).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BehaviorPayload {
  views?: Array<{ property_id?: string; property_name?: string; property_url?: string; action?: string; viewed_at?: string; metadata?: any }>;
  engagement?: Array<{ event_type: string; campaign_id?: string; campaign_name?: string; link_url?: string; occurred_at?: string; metadata?: any }>;
  forms?: Array<{ form_type: string; form_name?: string; property_id?: string; property_name?: string; payload?: any; submitted_at?: string }>;
  sessions?: Array<{ session_id?: string; pages_viewed?: number; duration_seconds?: number; referrer?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; device_type?: string; started_at?: string; ended_at?: string }>;
}

interface IngestRequest {
  lead: {
    // Identity
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    presale_user_id?: string;

    // Source & campaign
    source?: string;
    campaign_source?: string;
    referral_source?: string;

    // Project interest
    project?: string;
    projects?: string[];

    // Shared signup fields (mirror Presale Properties signup form)
    intent?: 'buy' | 'invest' | 'browse' | 'sell';
    timeframe?: '0-3m' | '3-6m' | '6-12m' | '12m+';
    home_type_pref?: 'condo' | 'townhome' | 'detached' | 'any';
    looking_to_buy_in?: string[];     // cities / neighbourhoods
    budget_min?: number;
    budget_max?: number;
    bedrooms_preferred?: string;
    is_pre_approved?: boolean;
    language?: string;
    city?: string;
    province?: string;
    postal_code?: string;
    marketing_consent?: boolean;
    signup_completed_at?: string;     // ISO timestamp

    tags?: string[];
    metadata?: Record<string, any>;   // any extra fields → stored in presale_metadata
  };
  behavior?: BehaviorPayload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = req.headers.get("x-bridge-secret");
    if (!secret || secret !== Deno.env.get("BRIDGE_SECRET")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body: IngestRequest = await req.json();
    if (!body?.lead?.email) {
      return new Response(JSON.stringify({ error: "lead.email required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const L = body.lead;
    const email = L.email.trim().toLowerCase();
    const phone = L.phone?.replace(/\D/g, "") || null;

    // Log raw event to central audit store
    const sourceSlug = (L.source && L.source.toLowerCase().includes("presale")) ? "presale_properties" : (L.source || "presale_properties");
    let eventId: string | null = null;
    try {
      const { data: evtId } = await supabase.rpc("log_source_event", {
        _source_slug: sourceSlug,
        _event_type: "lead_ingest",
        _email: email,
        _phone: phone,
        _external_id: L.presale_user_id || null,
        _payload: body as any,
      });
      eventId = evtId as string;
    } catch (e) {
      console.warn("[bridge-ingest-lead] log_source_event failed (non-fatal):", e);
    }

    // Dedup by presale_user_id, then email or phone (merge & enrich)
    let existing: any = null;
    if (L.presale_user_id) {
      const { data } = await supabase.from("crm_contacts")
        .select("id, first_name, last_name, tags, projects, looking_to_buy_in, source, notes, presale_metadata")
        .eq("presale_user_id", L.presale_user_id).limit(1).maybeSingle();
      existing = data;
    }
    if (!existing) {
      const { data } = await supabase.from("crm_contacts")
        .select("id, first_name, last_name, tags, projects, looking_to_buy_in, source, notes, presale_metadata")
        .or(phone ? `email.eq.${email},phone.eq.${phone}` : `email.eq.${email}`)
        .limit(1).maybeSingle();
      existing = data;
    }

    let contactId: string;
    const incomingProjects = L.projects?.length ? L.projects : (L.project ? [L.project] : []);

    if (existing) {
      // Merge: only fill blanks, append tags/projects/cities, never overwrite manual edits
      const newTags = Array.from(new Set([...(existing.tags || []), ...(L.tags || []), "presale-website"]));
      const newProjects = Array.from(new Set([...(existing.projects || []), ...incomingProjects]));
      const newCities = Array.from(new Set([...(existing.looking_to_buy_in || []), ...(L.looking_to_buy_in || [])]));
      const mergedMeta = { ...(existing.presale_metadata || {}), ...(L.metadata || {}) };

      await supabase.from("crm_contacts").update({
        first_name: existing.first_name || L.first_name || "Lead",
        last_name: existing.last_name || L.last_name || "",
        presale_user_id: L.presale_user_id ?? undefined,
        tags: newTags,
        projects: newProjects,
        looking_to_buy_in: newCities,
        intent: L.intent ?? undefined,
        timeframe: L.timeframe ?? undefined,
        home_type_pref: L.home_type_pref ?? undefined,
        budget_min: L.budget_min ?? undefined,
        budget_max: L.budget_max ?? undefined,
        bedrooms_preferred: L.bedrooms_preferred ?? undefined,
        is_pre_approved: L.is_pre_approved ?? undefined,
        language: L.language ?? undefined,
        city: L.city ?? undefined,
        province: L.province ?? undefined,
        postal_code: L.postal_code ?? undefined,
        marketing_consent: L.marketing_consent ?? undefined,
        signup_completed_at: L.signup_completed_at ?? undefined,
        campaign_source: L.campaign_source ?? undefined,
        referral_source: L.referral_source ?? undefined,
        presale_metadata: mergedMeta,
        sync_source: "presale",
        lofty_synced_at: new Date().toISOString(),
        last_touch_at: new Date().toISOString(),
        last_touch_type: "presale_signup",
      }).eq("id", existing.id);

      contactId = existing.id;
    } else {
      const { data: created, error: insErr } = await supabase.from("crm_contacts").insert({
        first_name: L.first_name || "New",
        last_name: L.last_name || "Lead",
        email,
        phone: L.phone || null,
        presale_user_id: L.presale_user_id || null,
        source: L.source || "presale-website",
        campaign_source: L.campaign_source || null,
        referral_source: L.referral_source || null,
        project: incomingProjects[0] || null,
        projects: incomingProjects,
        looking_to_buy_in: L.looking_to_buy_in || [],
        intent: L.intent || null,
        timeframe: L.timeframe || null,
        home_type_pref: L.home_type_pref || null,
        budget_min: L.budget_min ?? null,
        budget_max: L.budget_max ?? null,
        bedrooms_preferred: L.bedrooms_preferred || null,
        is_pre_approved: L.is_pre_approved ?? false,
        language: L.language || null,
        city: L.city || null,
        province: L.province || 'BC',
        postal_code: L.postal_code || null,
        marketing_consent: L.marketing_consent ?? false,
        signup_completed_at: L.signup_completed_at || null,
        presale_metadata: L.metadata || {},
        tags: Array.from(new Set([...(L.tags || []), "presale-website"])),
        status: "New Lead",
        lead_type: "Pre-Sale",
        sync_source: "presale",
        lofty_synced_at: new Date().toISOString(),
      }).select("id").single();

      if (insErr) throw insErr;
      contactId = created.id;
    }

    // Insert behavior data
    const b = body.behavior || {};
    if (b.views?.length) {
      await supabase.from("crm_lead_behavior_views").insert(
        b.views.map(v => ({ contact_id: contactId, email, presale_user_id: body.lead.presale_user_id, ...v, action: v.action || "view" }))
      );
    }
    if (b.engagement?.length) {
      await supabase.from("crm_lead_behavior_engagement").insert(
        b.engagement.map(e => ({ contact_id: contactId, email, ...e }))
      );
    }
    if (b.forms?.length) {
      await supabase.from("crm_lead_behavior_forms").insert(
        b.forms.map(f => ({ contact_id: contactId, email, ...f }))
      );
    }
    if (b.sessions?.length) {
      await supabase.from("crm_lead_behavior_sessions").insert(
        b.sessions.map(s => ({ contact_id: contactId, email, ...s }))
      );
    }

    if (eventId) {
      try {
        await supabase.rpc("mark_source_event_processed", {
          _event_id: eventId,
          _contact_id: contactId,
          _status: "processed",
          _error: null,
        });
      } catch (e) {
        console.warn("[bridge-ingest-lead] mark_source_event_processed failed:", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, contact_id: contactId, action: existing ? "merged" : "created", event_id: eventId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[bridge-ingest-lead]", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
