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
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    source?: string;
    project?: string;
    presale_user_id?: string;
    tags?: string[];
    metadata?: Record<string, any>;
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
    const email = body.lead.email.trim().toLowerCase();
    const phone = body.lead.phone?.replace(/\D/g, "") || null;

    // Dedup by email or phone (merge & enrich)
    let { data: existing } = await supabase
      .from("crm_contacts")
      .select("id, first_name, last_name, tags, projects, source, notes")
      .or(phone ? `email.eq.${email},phone.eq.${phone}` : `email.eq.${email}`)
      .limit(1)
      .maybeSingle();

    let contactId: string;

    if (existing) {
      // Merge: only fill blanks, append tags, add project, never overwrite manual edits
      const newTags = Array.from(new Set([...(existing.tags || []), ...(body.lead.tags || []), "presale-website"]));
      const newProjects = body.lead.project && !(existing.projects || []).includes(body.lead.project)
        ? [...(existing.projects || []), body.lead.project]
        : existing.projects;

      await supabase.from("crm_contacts").update({
        first_name: existing.first_name || body.lead.first_name || "Lead",
        last_name: existing.last_name || body.lead.last_name || "",
        tags: newTags,
        projects: newProjects,
        sync_source: "presale",
        lofty_synced_at: new Date().toISOString(),
        last_touch_at: new Date().toISOString(),
        last_touch_type: "presale_signup",
      }).eq("id", existing.id);

      contactId = existing.id;
    } else {
      const { data: created, error: insErr } = await supabase.from("crm_contacts").insert({
        first_name: body.lead.first_name || "New",
        last_name: body.lead.last_name || "Lead",
        email,
        phone: body.lead.phone || null,
        source: body.lead.source || "presale-website",
        project: body.lead.project || null,
        projects: body.lead.project ? [body.lead.project] : [],
        tags: Array.from(new Set([...(body.lead.tags || []), "presale-website"])),
        status: "New Lead",
        lead_type: "Pre-Sale",
        sync_source: "presale",
        lofty_synced_at: new Date().toISOString(),
        notes: body.lead.metadata ? `Signed up via Presale: ${JSON.stringify(body.lead.metadata)}` : null,
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

    return new Response(JSON.stringify({ ok: true, contact_id: contactId, action: existing ? "merged" : "created" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[bridge-ingest-lead]", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
