// DEPLOY THIS ON: Presale Properties project
// Path: supabase/functions/sync-templates-with-crm/index.ts
//
// Two-way template sync. Run on a schedule (e.g. every 5 min via pg_cron) OR
// trigger manually after editing templates on Presale.
//
// Strategy:
//  1. PULL: GET CRM templates → upsert any that are newer in Presale's local table
//  2. PUSH: POST Presale's templates back to CRM (only changed ones, via sync_hash)
//
// Replace TEMPLATES_TABLE and field names with whatever Presale uses.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CRM_TEMPLATES_URL = "https://svbilqvudkkdhslxebce.supabase.co/functions/v1/bridge-templates-sync";
const TEMPLATES_TABLE = "email_templates"; // adjust to Presale's table name

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hashContent(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const bridgeSecret = Deno.env.get("BRIDGE_SECRET")!;

    // 1. PULL: fetch CRM templates
    const pullRes = await fetch(CRM_TEMPLATES_URL, {
      headers: { "x-bridge-secret": bridgeSecret },
    });
    const { templates: crmTemplates = [] } = await pullRes.json();

    // Upsert into Presale's template table (use crm_id as external reference)
    let pulled = 0;
    for (const t of crmTemplates) {
      const { data: existing } = await supabase
        .from(TEMPLATES_TABLE)
        .select("id, sync_hash")
        .eq("crm_id", t.id)
        .maybeSingle();

      if (existing && existing.sync_hash === t.sync_hash) continue;

      if (existing) {
        await supabase.from(TEMPLATES_TABLE).update({
          name: t.name,
          subject: t.subject,
          body_html: t.body_html,
          category: t.category,
          merge_tags: t.merge_tags,
          sync_hash: t.sync_hash,
          last_synced_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from(TEMPLATES_TABLE).insert({
          crm_id: t.id,
          name: t.name,
          subject: t.subject,
          body_html: t.body_html,
          category: t.category,
          merge_tags: t.merge_tags,
          source: "crm",
          sync_hash: t.sync_hash,
          last_synced_at: new Date().toISOString(),
        });
      }
      pulled++;
    }

    // 2. PUSH: send Presale-origin templates back to CRM
    const { data: localTemplates = [] } = await supabase
      .from(TEMPLATES_TABLE)
      .select("id, name, subject, body_html, category, merge_tags, sync_hash")
      .eq("source", "presale"); // only push templates created in Presale

    const pushPayload = await Promise.all((localTemplates || []).map(async (t: any) => ({
      external_id: t.id,
      name: t.name,
      subject: t.subject,
      body_html: t.body_html,
      category: t.category,
      merge_tags: t.merge_tags || [],
      sync_hash: await hashContent(`${t.subject}|${t.body_html || ""}`),
    })));

    const pushRes = await fetch(CRM_TEMPLATES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bridge-secret": bridgeSecret },
      body: JSON.stringify({ templates: pushPayload }),
    });
    const pushResult = await pushRes.json();

    return new Response(JSON.stringify({ ok: true, pulled, pushed: pushPayload.length, pushResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[sync-templates-with-crm]", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
