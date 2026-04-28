// One-shot backfill: maps crm_projects.name -> presale slug via bridge.
// Service-role only; protected by CRON_SECRET header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { presaleBridge } from "../_shared/presale-bridge.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type":"application/json" } });
  }

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: projects, error } = await supa
    .from("crm_projects")
    .select("id,name,slug")
    .is("presale_slug", null);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type":"application/json" } });

  let matched = 0, ambiguous = 0, none = 0, errors = 0;
  const details: any[] = [];

  for (const p of projects ?? []) {
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
      details.push({ id: p.id, name: p.name, err: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ total: projects?.length ?? 0, matched, ambiguous, none, errors, errorSamples: details.slice(0,5) }, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
