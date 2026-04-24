// DEPLOY TO PRESALE PROPERTIES PROJECT as:
//   supabase/functions/bridge-list-templates/index.ts
//
// Returns all campaign_templates so the Dealzflow CRM can show them in its
// unified template picker. Gated by shared BRIDGE_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-bridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const expected = Deno.env.get("BRIDGE_SECRET");
    const provided = req.headers.get("x-bridge-secret") || "";
    if (!expected || provided !== expected) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("campaign_templates")
      .select("id, project_name, form_data, created_at, updated_at")
      .order("updated_at", { ascending: false });

    if (error) return json({ error: error.message }, 500);

    // Normalize for the CRM picker
    const templates = (data ?? []).map((t: any) => {
      const fd = t.form_data || {};
      const copy = fd.copy || {};
      return {
        id: t.id,
        name: fd.projectName || t.project_name || "Untitled",
        subject: copy.subjectLine || fd.projectName || t.project_name || "Presale Properties",
        body_html: fd.finalHtml || "",
        category: fd.category || "general",
        thumbnail: fd.heroImage || null,
        updated_at: t.updated_at,
        source: "presale_properties",
      };
    });

    return json({ templates }, 200);
  } catch (e) {
    console.error("bridge-list-templates error", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
