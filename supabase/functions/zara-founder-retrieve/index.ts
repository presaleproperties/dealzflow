// zara-founder-retrieve — server-side helper. Returns the top N founder principles
// relevant to a given context string. Used at draft time so Zara messages reflect
// Uzair's philosophy without bloating the system prompt.
// POST { query, moduleSlug?, limit? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);
    // Allow any authenticated CRM user to retrieve (read-only). Writes are admin-only.
    const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u } = await anon.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const { query = "", moduleSlug = null, limit = 8 } = await req.json().catch(() => ({}));
    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await svc.rpc("zara_founder_retrieve", {
      _query: String(query ?? ""),
      _module_slug: moduleSlug,
      _limit: Math.min(Math.max(Number(limit) || 8, 1), 30),
    });
    if (error) return json({ error: "retrieve_failed", detail: error.message }, 500);
    return json({ principles: data ?? [] });
  } catch (e: any) {
    return json({ error: "retrieve_failed", detail: String(e?.message ?? e) }, 500);
  }
});
