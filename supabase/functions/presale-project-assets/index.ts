// Returns brochure / floor_plans / pricing availability for a project.
// Source order:
//   1. Manual upload on crm_projects.{brochure_url, floor_plans_url, pricing_url}
//   2. Presale Properties (bridge get-project): pitch_deck_url, floor_plans[], etc.
// Response shape:
// {
//   ok: true,
//   project: { slug, presale_slug },
//   assets: {
//     brochure:    { url: string|null, filename: string|null, source: 'manual'|'presale'|null },
//     floor_plans: { url: string|null, filename: string|null, source: 'manual'|'presale'|null },
//     pricing:     { url: string|null, filename: string|null, source: 'manual'|'presale'|null },
//   }
// }
//
// Auth: requires signed-in CRM user JWT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { presaleBridge } from "../_shared/presale-bridge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type AssetKind = "brochure" | "floor_plans" | "pricing";
interface Asset { url: string | null; filename: string | null; source: "manual" | "presale" | null }

function pickStr(obj: any, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickFromArray(obj: any, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v) && v.length > 0) {
      const first = v[0];
      if (typeof first === "string" && first.trim()) return first.trim();
      if (first && typeof first === "object") {
        const s = pickStr(first, ["url", "file_url", "pdf_url", "src", "href", "link"]);
        if (s) return s;
      }
    }
  }
  return null;
}

function filenameFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  let body: { project_slug?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  const projectSlug = body.project_slug?.trim();
  if (!projectSlug) return json({ error: "project_slug required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Pull manual asset URLs from crm_projects
  const { data: projRow } = await admin
    .from("crm_projects")
    .select("slug, presale_slug, brochure_url, brochure_filename, floor_plans_url, floor_plans_filename, pricing_url, pricing_filename")
    .eq("slug", projectSlug)
    .maybeSingle();

  const assets: Record<AssetKind, Asset> = {
    brochure:    { url: null, filename: null, source: null },
    floor_plans: { url: null, filename: null, source: null },
    pricing:     { url: null, filename: null, source: null },
  };

  if (projRow?.brochure_url) {
    assets.brochure = { url: projRow.brochure_url, filename: projRow.brochure_filename ?? filenameFromUrl(projRow.brochure_url), source: "manual" };
  }
  if (projRow?.floor_plans_url) {
    assets.floor_plans = { url: projRow.floor_plans_url, filename: projRow.floor_plans_filename ?? filenameFromUrl(projRow.floor_plans_url), source: "manual" };
  }
  if (projRow?.pricing_url) {
    assets.pricing = { url: projRow.pricing_url, filename: projRow.pricing_filename ?? filenameFromUrl(projRow.pricing_url), source: "manual" };
  }

  // 2. Fall back to Presale (bridge-get-project) for any kind that's still empty.
  // Canonical bridge fields (confirmed via bridge-get-project response):
  //   first_brochure_url        + brochure_files[]   + pitch_deck_url
  //   first_floorplan_url       + floorplan_files[]
  //   first_pricing_sheet_url   + pricing_sheets[]
  const presaleSlug = projRow?.presale_slug ?? null;
  const needsPresale = presaleSlug && (!assets.brochure.url || !assets.floor_plans.url || !assets.pricing.url);

  if (needsPresale) {
    try {
      const raw = await presaleBridge.getProject(presaleSlug!);
      // Bridge returns either { project: {...} } or the project object itself.
      const project: any = (raw as any)?.project ?? raw ?? {};

      if (!assets.brochure.url) {
        const url =
          pickStr(project, ["first_brochure_url", "brochure_url", "brochureUrl", "pitch_deck_url", "pitchDeckUrl"]) ||
          pickFromArray(project, ["brochure_files", "brochures", "documents", "downloads"]);
        if (url) assets.brochure = { url, filename: filenameFromUrl(url), source: "presale" };
      }
      if (!assets.floor_plans.url) {
        const url =
          pickStr(project, ["first_floorplan_url", "floor_plans_url", "floorPlansUrl", "floorplan_url"]) ||
          pickFromArray(project, ["floorplan_files", "floor_plans", "floorPlans", "plans", "floorplans"]);
        if (url) assets.floor_plans = { url, filename: filenameFromUrl(url), source: "presale" };
      }
      if (!assets.pricing.url) {
        const url =
          pickStr(project, ["first_pricing_sheet_url", "pricing_url", "pricingUrl", "price_sheet_url"]) ||
          pickFromArray(project, ["pricing_sheets", "pricingSheets", "price_sheets", "priceSheets"]);
        if (url) assets.pricing = { url, filename: filenameFromUrl(url), source: "presale" };
      }
    } catch (e) {
      console.warn("[presale-project-assets] bridge fetch failed", (e as Error).message);
    }
  }

  return json({
    ok: true,
    project: { slug: projectSlug, presale_slug: presaleSlug },
    assets,
  });
});
