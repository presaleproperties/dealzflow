// Bridge endpoint: Presale Properties → CRM
// Receives new signups + behavior data. Dedupes by email/phone (merge & enrich).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireBridgeSecret } from "../_shared/inbound-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Hardcoded fallback if there are no active owners at all (shouldn't happen).
const FALLBACK_AGENT = "Uzair Muhammad";

// Assignee picker. Honors `agent_slug` (matched against crm_team.slug,
// then email/presale_email local-part, then display_name slugified). If no
// explicit slug match, defaults to the team owner — the team lead handles
// triage and re-assigns from there.
async function pickAssignee(
  supabase: any,
  agentSlug?: string | null,
  assignedAgentId?: string | null,
): Promise<string> {
  // 0) Upstream round-robin: presale.com may send assigned_agent_id directly.
  if (assignedAgentId) {
    const { data: byId } = await supabase
      .from("crm_team").select("display_name, is_active")
      .eq("id", assignedAgentId).maybeSingle();
    if (byId?.display_name && byId.is_active !== false) return byId.display_name;
  }
  // 1) Try agent_slug → crm_team
  if (agentSlug) {
    const wanted = agentSlug.trim().toLowerCase();
    const { data: team } = await supabase
      .from("crm_team")
      .select("display_name, slug, email, presale_email")
      .eq("is_active", true);
    const match = (team ?? []).find((t: any) => {
      const nameSlug = (t.display_name ?? "").toLowerCase().replace(/\s+/g, "-");
      const emailLocal = (t.email ?? "").split("@")[0]?.toLowerCase();
      const presaleLocal = (t.presale_email ?? "").split("@")[0]?.toLowerCase();
      return (
        t.slug?.toLowerCase() === wanted ||
        nameSlug === wanted ||
        emailLocal === wanted ||
        presaleLocal === wanted
      );
    });
    if (match?.display_name) return match.display_name;
  }

  // 2) Default: route to the team owner (team lead) for triage.
  const { data: owner } = await supabase
    .from("crm_team")
    .select("display_name")
    .eq("is_active", true)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (owner?.display_name) return owner.display_name;

  return FALLBACK_AGENT;
}

// Resolve the agent record (id/email/phone/photo/calendly) so the website can
// render the assigned-agent card immediately after submission.
async function loadAgentEnvelope(supabase: any, displayName: string) {
  if (!displayName) return null;
  const { data } = await supabase
    .from("crm_team")
    .select("id, display_name, email, phone, avatar_url, calendly_url, presale_email")
    .eq("display_name", displayName)
    .maybeSingle();
  if (!data) return { id: null, name: displayName, email: null, phone: null, photo_url: null, calendly_url: null };
  return {
    id: data.id,
    name: data.display_name,
    email: data.presale_email || data.email || null,
    phone: data.phone || null,
    photo_url: data.avatar_url || null,
    calendly_url: data.calendly_url || null,
  };
}

// Tags that should never appear (the source name itself, raw answer values, etc).
const JUNK_TAGS = new Set([
  "presaleproperties.com", "presale-properties.com", "presale_properties",
  "yes", "no", "true", "false", "n/a", "na", "unknown",
]);

// Lead-source aliases → canonical form-type tag. Prevents duplicates like
// `project_floor_plan` + `floor_plan_request` both showing up.
const LEAD_SOURCE_ALIASES: Record<string, string> = {
  "project_floor_plan": "floor_plan_request",
  "project_floorplan": "floor_plan_request",
  "floorplan_request": "floor_plan_request",
  "project_inquiry": "project_inquiry",
  "contact_form": "contact_form",
  "vip_signup": "vip_registration",
  "vip_registration": "vip_registration",
};

function normalizeTag(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (JUNK_TAGS.has(lower)) return null;
  // Map known aliases to canonical form
  if (LEAD_SOURCE_ALIASES[lower]) return LEAD_SOURCE_ALIASES[lower];
  return t;
}

// Build the tag list per Presale Ingest Mapping rule:
//   presale-website + form:<type> + deck:<name> + (caller tags) — always append.
// Sanitizes junk tags (source name, yes/no), dedupes case-insensitively, and
// collapses lead-source aliases (e.g. `project_floor_plan` → `floor_plan_request`).
function buildTags(existingTags: string[] | null, leadTags: string[] | undefined, meta: any): string[] {
  const seen = new Map<string, string>(); // lowercase → canonical
  const add = (raw?: string | null) => {
    const t = normalizeTag(raw ?? "");
    if (!t) return;
    const k = t.toLowerCase();
    if (!seen.has(k)) seen.set(k, t);
  };

  for (const t of existingTags ?? []) add(t);
  add("presale-website");
  for (const t of leadTags ?? []) add(t);

  const formType = meta?.form_type;
  if (typeof formType === "string" && formType.trim()) add(`form:${formType.trim()}`);
  const deckName = meta?.pitch_deck_name ?? meta?.deck_name ?? meta?.deck?.name;
  if (typeof deckName === "string" && deckName.trim()) add(`deck:${deckName.trim()}`);

  // Hot triggers from this single payload (floorplan download or deck revisit)
  const beh: any = meta?.behavior ?? null;
  if (Array.isArray(beh?.engagement)) {
    for (const e of beh.engagement) {
      const t = (e?.event_type ?? "").toLowerCase();
      if (t === "floorplan_download") add("hot");
      if ((t === "deck_visit" || t === "deck_unlock") && (e?.visit_number ?? 0) >= 2) add("hot");
    }
  }
  return Array.from(seen.values());
}

// Filter out junk project values (yes/no answers, "Working with agent" style
// form-question labels). A real project should be more than 2 chars and not a
// known answer phrase.
const JUNK_PROJECT_PATTERNS = [
  /^working with (an? )?agent$/i,
  /^(have|has) (an? )?agent$/i,
  /^(yes|no|n\/a|na|unknown|true|false)$/i,
  /^agent[_\s-]?status$/i,
];
function sanitizeProjects(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const v = String(raw ?? "").trim();
    if (!v || v.length < 2) continue;
    if (JUNK_PROJECT_PATTERNS.some((re) => re.test(v))) continue;
    const k = v.toLowerCase();
    if (!seen.has(k)) seen.set(k, v);
  }
  return Array.from(seen.values());
}

// Persona → contact_type (buyer/investor/realtor/developer)
function personaToContactType(meta: any): string | null {
  const p = (meta?.persona ?? "").toString().trim().toLowerCase();
  return ["buyer", "investor", "realtor", "developer"].includes(p) ? p : null;
}

// Compose a structured note from granular metadata (lead_source, form_type,
// utm, landing_page, free-text message). Appended — never overwrites existing notes.
function buildNoteAppendix(meta: any): string | null {
  if (!meta || typeof meta !== "object") return null;
  const lines: string[] = [];
  const ts = new Date().toISOString();
  lines.push(`[Presale form @ ${ts}]`);
  if (meta.form_type) lines.push(`Form: ${meta.form_type}`);
  if (meta.lead_source) lines.push(`Lead source: ${meta.lead_source}`);
  if (meta.landing_page) lines.push(`Landing: ${meta.landing_page}`);
  const utm = [meta.utm_source, meta.utm_medium, meta.utm_campaign].filter(Boolean).join(" / ");
  if (utm) lines.push(`UTM: ${utm}`);
  if (typeof meta.message === "string" && meta.message.trim()) lines.push(`Message: ${meta.message.trim()}`);
  return lines.length > 1 ? lines.join("\n") : null;
}


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
    agent_slug?: string;             // optional: route to a specific agent
    assigned_agent_id?: string;      // upstream round-robin from presale.com
    metadata?: Record<string, any>;   // any extra fields → stored in presale_metadata
  };
  behavior?: BehaviorPayload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authFail = requireBridgeSecret(req);
    if (authFail) return authFail;

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
    const incomingProjects = sanitizeProjects(
      L.projects?.length ? L.projects : (L.project ? [L.project] : []),
    );

    // Build merge metadata once (used for tags/notes/persona on both branches)
    const meta = { ...(L.metadata || {}), behavior: body.behavior } as any;
    const personaType = personaToContactType(meta);
    const noteAppendix = buildNoteAppendix(meta);

    if (existing) {
      // Merge: only fill blanks, append tags/projects/cities, never overwrite manual edits
      const newTags = buildTags(existing.tags, L.tags, meta);
      const newProjects = Array.from(new Set([...(existing.projects || []), ...incomingProjects]));
      const newCities = Array.from(new Set([...(existing.looking_to_buy_in || []), ...(L.looking_to_buy_in || [])]));
      const mergedMeta = { ...(existing.presale_metadata || {}), ...(L.metadata || {}) };
      const mergedNotes = noteAppendix
        ? [existing.notes, noteAppendix].filter((s: any) => s && String(s).trim()).join("\n\n")
        : existing.notes;
      const isHot = newTags.includes("hot");

      await supabase.from("crm_contacts").update({
        first_name: existing.first_name || L.first_name || "Lead",
        last_name: existing.last_name || L.last_name || "",
        presale_user_id: L.presale_user_id ?? undefined,
        // Source rule: ALWAYS PresaleProperties.com for inbound presale leads
        source: "PresaleProperties.com",
        contact_type: personaType ?? undefined,
        notes: mergedNotes ?? undefined,
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
        presale_metadata: mergedMeta,
        sync_source: "presale",
        lofty_synced_at: new Date().toISOString(),
        last_touch_at: new Date().toISOString(),
        last_touch_type: "presale_signup",
        ...(isHot ? { lead_tier: "hot" } : {}),
      }).eq("id", existing.id);

      contactId = existing.id;
    } else {
      const assignee = await pickAssignee(supabase, L.agent_slug, (L as any).assigned_agent_id ?? L.metadata?.assigned_agent_id ?? null);
      const newTags = buildTags(null, L.tags, meta);
      const isHot = newTags.includes("hot");
      const { data: created, error: insErr } = await supabase.from("crm_contacts").insert({
        first_name: L.first_name || "New",
        last_name: L.last_name || "Lead",
        email,
        phone: L.phone || null,
        presale_user_id: L.presale_user_id || null,
        source: "PresaleProperties.com",
        contact_type: personaType,
        notes: noteAppendix,
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
        tags: newTags,
        status: "New Lead",
        lead_type: "Pre-Sale",
        lead_tier: isHot ? "hot" : null,
        assigned_to: assignee,
        sync_source: "presale",
        lofty_synced_at: new Date().toISOString(),
      }).select("id, assigned_to").single();

      if (insErr) throw insErr;
      contactId = created.id;
    }

    // Stitch any prior anonymous behavior rows by presale_user_id → this contact
    if (L.presale_user_id) {
      for (const t of [
        "crm_lead_behavior_views",
        "crm_lead_behavior_sessions",
        "crm_lead_behavior_forms",
        "crm_lead_behavior_engagement",
      ]) {
        await supabase.from(t)
          .update({ contact_id: contactId, email })
          .eq("presale_user_id", L.presale_user_id)
          .is("contact_id", null);
      }
    }

    // Insert behavior data bundled with the signup
    const b = body.behavior || {};
    const psu = L.presale_user_id || null;
    if (b.views?.length) {
      await supabase.from("crm_lead_behavior_views").upsert(
        b.views.map((v: any) => ({ contact_id: contactId, email, presale_user_id: psu, ...v, action: v.action || "view" })),
        { onConflict: "event_id", ignoreDuplicates: true },
      );
    }
    if (b.engagement?.length) {
      await supabase.from("crm_lead_behavior_engagement").upsert(
        b.engagement.map((e: any) => ({ contact_id: contactId, email, presale_user_id: psu, ...e })),
        { onConflict: "event_id", ignoreDuplicates: true },
      );
    }
    if (b.forms?.length) {
      await supabase.from("crm_lead_behavior_forms").upsert(
        b.forms.map((f: any) => ({ contact_id: contactId, email, presale_user_id: psu, ...f })),
        { onConflict: "event_id", ignoreDuplicates: true },
      );
    }
    if (b.sessions?.length) {
      await supabase.from("crm_lead_behavior_sessions").upsert(
        b.sessions.map((s: any) => ({ contact_id: contactId, email, presale_user_id: psu, ...s })),
        { onConflict: "event_id", ignoreDuplicates: true },
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

    // Resolve assigned_agent envelope so Presale can render the agent card
    const { data: contactRow } = await supabase
      .from("crm_contacts")
      .select("assigned_to")
      .eq("id", contactId)
      .maybeSingle();
    const assignedAgent = await loadAgentEnvelope(supabase, contactRow?.assigned_to ?? "");

    return new Response(JSON.stringify({
      ok: true,
      contact_id: contactId,
      crm_contact_id: contactId,
      action: existing ? "merged" : "created",
      event_id: eventId,
      assigned_agent: assignedAgent,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[bridge-ingest-lead]", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
