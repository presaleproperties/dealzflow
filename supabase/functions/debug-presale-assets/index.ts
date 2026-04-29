import { presaleBridge } from "../_shared/presale-bridge.ts";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const slugs = (url.searchParams.get("slugs") ?? "the-loop,102-park,atlin,aria").split(",").map(s => s.trim()).filter(Boolean);
  const out: any[] = [];
  for (const slug of slugs) {
    try {
      const raw = await presaleBridge.getProject(slug) as any;
      const p = raw?.project ?? raw ?? {};
      out.push({
        slug,
        first_brochure_url: p.first_brochure_url ?? null,
        brochure_files_count: Array.isArray(p.brochure_files) ? p.brochure_files.length : 0,
        first_floorplan_url: p.first_floorplan_url ?? null,
        floorplan_files_count: Array.isArray(p.floorplan_files) ? p.floorplan_files.length : 0,
        first_pricing_sheet_url: p.first_pricing_sheet_url ?? null,
        pricing_sheets_count: Array.isArray(p.pricing_sheets) ? p.pricing_sheets.length : 0,
        pitch_deck_url: p.pitch_deck_url ?? null,
      });
    } catch (e) {
      out.push({ slug, error: (e as Error).message });
    }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
