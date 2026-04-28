// One-shot backfill: maps crm_projects.name -> presale slug via bridge.
// Auth: requires a signed-in CRM admin OR matching x-cron-secret header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { presaleBridge } from "../_shared/presale-bridge.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const cronSecret = req.headers.get("x-cron-secret");
  let allowed = false;

  if (cronSecret && cronSecret === Deno.env.get("CRON_SECRET")) {
    allowed = true;
  } else {
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, { global: { headers: { Authorization: authHeader } } });
      const { data: u } = await userClient.auth.getUser();
      if (u?.user?.id) {
        const { data: row } = await userClient
          .from("crm_team")
          .select("role,is_active")
          .eq("user_id", u.user.id)
          .maybeSingle();
        if (row?.is_active && (row.role === "owner" || row.role === "admin")) allowed = true;
      }
    }
  }

  if (!allowed) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: projects, error } = await supa
    .from("crm_projects")
    .select("id,name,slug")
    .is("presale_slug", null);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  let matched = 0, ambiguous = 0, none = 0, errors = 0;
  const errorSamples: any[] = [];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (const p of projects ?? []) {
    await sleep(600); // throttle to avoid bridge rate limit
    try {
      const raw = await presaleBridge.searchProjects(p.name);
      const arr: any[] = Array.isArray(raw) ? raw : ((raw as any)?.projects ?? (raw as any)?.results ?? (raw as any)?.data ?? []);
      if (!arr || arr.length === 0) {
        none++;
        await supa.from("crm_projects_presale_match_review").insert({ project_id: p.id, project_name: p.name, candidates: [], reason: "no_match" });
      } else if (arr.length === 1) {
        const slug = arr[0].slug ?? arr[0].project_slug;
        if (!slug) {
          errors++;
          await supa.from("crm_projects_presale_match_review").insert({ project_id: p.id, project_name: p.name, candidates: arr, reason: "single_no_slug" });
        } else {
          await supa.from("crm_projects").update({ presale_slug: slug }).eq("id", p.id);
          matched++;
        }
      } else {
        ambiguous++;
        await supa.from("crm_projects_presale_match_review").insert({
          project_id: p.id,
          project_name: p.name,
          candidates: arr.slice(0, 5).map((r: any) => ({ slug: r.slug ?? r.project_slug, name: r.name })),
          reason: "multiple_matches",
        });
      }
    } catch (e) {
      errors++;
      if (errorSamples.length < 5) errorSamples.push({ id: p.id, name: p.name, err: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ total: projects?.length ?? 0, matched, ambiguous, none, errors, errorSamples }, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
