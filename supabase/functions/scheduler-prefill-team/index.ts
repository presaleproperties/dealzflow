// Admin-only: pre-fill all crm_team rows from Presale by email match.
// Pulls headshot / brokerage / license / title / bio / signature from Presale
// and stores it in `presale_snapshot` + applies to top-level columns when blank.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { presaleBridge, BridgeAgent } from "../_shared/presale-bridge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const pick = (raw: any, keys: string[]) => {
  for (const k of keys) {
    const v = raw?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

function unwrap(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.agents)) return value.agents;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function normalize(raw: any) {
  if (!raw) return null;
  const name =
    pick(raw, ["name", "full_name", "display_name"]) ??
    [pick(raw, ["first_name"]), pick(raw, ["last_name"])].filter(Boolean).join(" ").trim();
  return {
    slug: pick(raw, ["slug", "id", "agent_slug"]) ?? "",
    name,
    email: pick(raw, ["email", "contact_email"]),
    phone: pick(raw, ["phone", "phone_number", "mobile"]),
    title: pick(raw, ["title", "job_title", "role_title"]),
    headshotUrl: pick(raw, ["headshot_url", "headshotUrl", "photo_url", "avatar_url", "image_url", "headshot"]),
    signatureHtml: pick(raw, ["signature_html", "signatureHtml", "email_signature", "signature"]),
    calendlyUrl: pick(raw, ["calendly_url", "calendlyUrl", "booking_url", "calendar_url"]),
    licenseNumber: pick(raw, ["license_number", "licenseNumber", "license", "real_estate_license"]),
    brokerage: pick(raw, ["brokerage", "brokerage_name", "company"]),
    bio: pick(raw, ["bio", "about", "description"]),
  };
}

const slugify = (s: string) =>
  String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // CRM admin only
  const { data: isAdmin } = await admin.rpc("is_crm_admin", { _user_id: u.user.id });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    let force = url.searchParams.get("force") === "1";
    try {
      const body = req.method === "POST" ? await req.json().catch(() => null) : null;
      if (body && body.force === true) force = true;
    } catch { /* ignore */ }

    const { data: team, error: tErr } = await admin
      .from("crm_team")
      .select("id,user_id,display_name,email,slug,headshot_url,brokerage,license_no,title,bio,phone")
      .eq("is_active", true);
    if (tErr) throw tErr;

    const listed = await presaleBridge.listAgents();
    const agents = unwrap(listed) as BridgeAgent[];

    const results: any[] = [];

    for (const t of team || []) {
      const teamEmail = (t.email || "").toLowerCase();
      const match = agents.find((a) => (a.email ?? "").toLowerCase() === teamEmail);

      if (!match?.slug) {
        results.push({ id: t.id, name: t.display_name, email: t.email, status: "no_presale_match" });
        continue;
      }

      let full: any = match;
      try {
        full = await presaleBridge.getAgent(match.slug);
      } catch { /* fall back to listing record */ }

      const normalized = normalize(full ?? match);
      if (!normalized) {
        results.push({ id: t.id, name: t.display_name, status: "normalize_failed" });
        continue;
      }

      // Presale is source of truth. Overwrite when Presale has a value.
      // (force=true also overwrites slug/email; otherwise we keep existing slug.)
      const patch: Record<string, any> = {
        presale_snapshot: normalized,
        presale_synced_at: new Date().toISOString(),
      };
      const setIfPresale = (col: string, val: any) => {
        if (val !== undefined && val !== null && val !== "") patch[col] = val;
      };
      if ((!t.slug || force) && normalized.slug) patch.slug = slugify(normalized.slug);
      setIfPresale("headshot_url", normalized.headshotUrl);
      setIfPresale("brokerage",    normalized.brokerage);
      setIfPresale("license_no",   normalized.licenseNumber);
      setIfPresale("title",        normalized.title);
      setIfPresale("phone",        normalized.phone);
      if (!t.bio || force) setIfPresale("bio", normalized.bio);

      const { error: uErr } = await admin.from("crm_team").update(patch).eq("id", t.id);
      if (uErr) {
        results.push({ id: t.id, name: t.display_name, status: "update_failed", error: uErr.message });
        continue;
      }

      results.push({
        id: t.id,
        name: t.display_name,
        email: t.email,
        slug: patch.slug || t.slug,
        status: "synced",
        applied: Object.keys(patch).filter((k) => k !== "presale_snapshot" && k !== "presale_synced_at"),
        presale: {
          name: normalized.name,
          headshot: !!normalized.headshotUrl,
          brokerage: normalized.brokerage,
          license: normalized.licenseNumber,
          title: normalized.title,
          phone: normalized.phone,
        },
      });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
