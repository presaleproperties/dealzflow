// Full-catalog sync of Presale Properties projects into crm_projects.
// The bridge's `bridge-search-projects` returns the top ~25 hits per query,
// so we fan out across a-z + 0-9 + a few high-cardinality terms and dedupe
// by slug. Result is upserted into public.crm_projects keyed by presale_slug.
//
// Auth: signed-in CRM owner/admin OR matching `x-cron-secret` header.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { presaleBridge } from "../_shared/presale-bridge.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Letters + digits + a few common substrings to maximize coverage.
const SWEEP_QUERIES: string[] = [
  "",
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
  ..."0123456789".split(""),
  // common project-name fragments (helps surface anything ranking buries)
  "the", "park", "village", "tower", "heights", "ridge", "view", "walk",
  "place", "square", "court", "house", "homes", "estates", "gardens",
];

interface BridgeProject {
  slug?: string;
  project_slug?: string;
  name?: string;
  city?: string;
  neighborhood?: string;
  developer_name?: string;
  developer?: string;
  project_type?: string;
  starting_price?: number | null;
  status?: string;
  completion_year?: number | null;
  featured_image?: string | null;
  [k: string]: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ---------- AUTH ----------
  const cronSecret = req.headers.get("x-cron-secret");
  let allowed = false;
  let actor = "cron";

  if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
    allowed = true;
  } else {
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (u?.user?.id) {
        const { data: row } = await userClient
          .from("crm_team")
          .select("role,is_active")
          .eq("user_id", u.user.id)
          .maybeSingle();
        if (row?.is_active && (row.role === "owner" || row.role === "admin")) {
          allowed = true;
          actor = u.user.id;
        }
      }
    }
  }

  if (!allowed) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // ---------- SWEEP ----------
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
  const bySlug = new Map<string, BridgeProject>();
  const errors: { q: string; err: string }[] = [];

  // Fetch the public sitemap to build short-slug → SEO-slug map.
  // The sitemap exposes canonical URLs like
  //   https://presaleproperties.com/willoughby-presale-condos-eden
  // We extract the trailing project slug after `presale-(condos|townhomes|homes|duplexes|land)-`
  // and use it to resolve the bridge slug `eden` → full SEO path.
  const seoBySlug = new Map<string, string>();
  try {
    const sitemapRes = await fetch(
      "https://thvlisplwqhtjpzpedhq.supabase.co/functions/v1/generate-sitemap?type=projects",
    );
    if (sitemapRes.ok) {
      const xml = await sitemapRes.text();
      const re = /<loc>https:\/\/presaleproperties\.com\/([^<]+)<\/loc>/g;
      const slugRe = /presale-(?:condos|townhomes|homes|duplexes|land)-(.+)$/;
      for (const m of xml.matchAll(re)) {
        const fullSlug = m[1];
        const sm = fullSlug.match(slugRe);
        if (sm) seoBySlug.set(sm[1], fullSlug);
      }
    }
  } catch (e) {
    errors.push({ q: "sitemap", err: (e as Error).message });
  }

  for (const q of SWEEP_QUERIES) {
    try {
      const raw = await presaleBridge.searchProjects(q);
      const arr: BridgeProject[] = Array.isArray(raw)
        ? (raw as BridgeProject[])
        : (((raw as { projects?: BridgeProject[] })?.projects) ?? []);
      for (const p of arr) {
        const slug = (p.slug ?? p.project_slug ?? "").trim();
        if (!slug) continue;
        if (!bySlug.has(slug)) bySlug.set(slug, p);
      }
    } catch (e) {
      errors.push({ q, err: (e as Error).message });
    }
    // throttle to be polite to the bridge
    await sleep(350);
  }

  // ---------- UPSERT ----------
  let inserted = 0, updated = 0, skipped = 0;

  // Helpers
  const firstString = (...vals: unknown[]): string | null => {
    for (const v of vals) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  const pickFloorPlansUrl = (full: any): string | null => {
    const fp = full?.floor_plans ?? full?.floorPlans;
    if (!fp) return null;
    if (typeof fp === "string" && fp.trim()) return fp.trim();
    if (Array.isArray(fp)) {
      for (const item of fp) {
        const u = firstString(item?.url, item?.pdf_url, item?.file_url, item?.href, item?.src);
        if (u) return u;
      }
    }
    return null;
  };
  const pickHero = (full: any, summary: BridgeProject): string | null =>
    firstString(
      full?.hero_image_url, full?.heroImageUrl, full?.featured_image,
      full?.thumbnail_url, full?.image_url, full?.cover_url,
      summary.featured_image, (summary as any).hero_image_url, (summary as any).image_url,
    );

  for (const p of bySlug.values()) {
    const slug = (p.slug ?? p.project_slug ?? "").trim();
    const name = (p.name ?? "").trim();
    if (!slug || !name) { skipped++; continue; }

    // Pull full project for deck/floor plans/description/hero. Tolerate failures.
    let full: any = null;
    try {
      full = await presaleBridge.getProject(slug);
    } catch (e) {
      errors.push({ q: `get:${slug}`, err: (e as Error).message });
    }
    await sleep(120);

    // Look up existing row by presale_slug FIRST, then by name_lower.
    const { data: existing } = await supa
      .from("crm_projects")
      .select("id,city,neighborhood,developer,property_type,price_from,price_to,status,completion_date,marketing_url,brochure_url,floor_plans_url,hero_image_url,notes,bedrooms_offered")
      .eq("presale_slug", slug)
      .maybeSingle();

    const completionYear = (full?.completion_year ?? p.completion_year) as number | null | undefined;
    const completionDate = completionYear ? `${completionYear}-01-01` : null;
    // Public-facing share URL — prefer SEO slug from sitemap when available.
    const seoSlug = seoBySlug.get(slug);
    const marketingUrl = `https://presaleproperties.com/${seoSlug ?? slug}`;

    // Treat any non-SEO URL (legacy `/projects/`, or short-slug-only) as
    // overwritable so we always upgrade to the SEO slug when available.
    const existingIsLegacy = existing?.marketing_url
      ? existing.marketing_url.includes("/projects/")
        || (!!seoSlug && !existing.marketing_url.includes(seoSlug))
      : true;

    const incomingPriceFrom = (full?.price_min ?? full?.priceRange?.min ?? p.starting_price) as number | null | undefined;
    const incomingPriceTo = (full?.price_max ?? full?.priceRange?.max) as number | null | undefined;
    const incomingDeck = firstString(full?.pitch_deck_url, full?.pitchDeckUrl, (full as any)?.brochure_url);
    const incomingFloorPlans = pickFloorPlansUrl(full);
    const incomingHero = pickHero(full, p);
    const incomingDescription = firstString(full?.description, (full as any)?.overview, (full as any)?.summary);
    const incomingBedrooms = firstString((full as any)?.bedrooms_offered, (full as any)?.bedrooms);

    // COALESCE: never overwrite an existing non-null value with NULL or with a freshly-null incoming value.
    const coalesce = <T,>(existingVal: T | null | undefined, incoming: T | null | undefined): T | null =>
      (existingVal ?? incoming ?? null) as T | null;

    const payload: Record<string, unknown> = {
      name,
      presale_slug: slug,
      slug,
      is_active: true,
      city: coalesce(existing?.city, full?.city ?? p.city),
      neighborhood: coalesce(existing?.neighborhood, full?.neighborhood ?? p.neighborhood),
      developer: coalesce(existing?.developer, full?.developer ?? (full as any)?.developer_name ?? p.developer_name ?? p.developer),
      property_type: coalesce(existing?.property_type, full?.project_type ?? p.project_type),
      price_from: coalesce(existing?.price_from, incomingPriceFrom),
      price_to: coalesce(existing?.price_to, incomingPriceTo),
      status: coalesce(existing?.status, full?.status ?? p.status),
      completion_date: coalesce(existing?.completion_date, completionDate),
      marketing_url: existingIsLegacy ? marketingUrl : existing?.marketing_url,
      brochure_url: coalesce(existing?.brochure_url, incomingDeck),
      floor_plans_url: coalesce(existing?.floor_plans_url, incomingFloorPlans),
      hero_image_url: coalesce(existing?.hero_image_url, incomingHero),
      notes: coalesce(existing?.notes, incomingDescription),
      bedrooms_offered: coalesce(existing?.bedrooms_offered, incomingBedrooms),
    };

    if (existing?.id) {
      const { error } = await supa
        .from("crm_projects")
        .update(payload)
        .eq("id", existing.id);
      if (error) { skipped++; errors.push({ q: slug, err: error.message }); }
      else updated++;
    } else {
      // Try insert; if name_lower collides with an existing manual row,
      // attach the slug instead of failing.
      const { error: insertErr } = await supa
        .from("crm_projects")
        .insert(payload);
      if (insertErr) {
        const { data: byName } = await supa
          .from("crm_projects")
          .select("id")
          .ilike("name", name)
          .is("presale_slug", null)
          .maybeSingle();
        if (byName?.id) {
          const { error: upErr } = await supa
            .from("crm_projects")
            .update(payload)
            .eq("id", byName.id);
          if (upErr) { skipped++; errors.push({ q: slug, err: upErr.message }); }
          else updated++;
        } else {
          skipped++;
          errors.push({ q: slug, err: insertErr.message });
        }
      } else {
        inserted++;
      }
    }
  }

  return new Response(
    JSON.stringify({
      actor,
      sweep_queries: SWEEP_QUERIES.length,
      unique_projects: bySlug.size,
      inserted,
      updated,
      skipped,
      errors: errors.slice(0, 20),
    }, null, 2),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
