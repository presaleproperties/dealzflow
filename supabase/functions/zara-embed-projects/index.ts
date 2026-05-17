// zara-embed-projects — admin-trigger / cron entry that enqueues stale
// presale-project embedding jobs and immediately kicks the processor once.
// Idempotent: rows with a fresh embedding (< 7 days) are skipped.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const force = Boolean(body?.force);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { data: enq, error } = await sb.rpc("zara_enqueue_project_embeddings", {
    _force: force,
  });

  if (error) {
    console.error("[zara-embed-projects] enqueue failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Kick the processor once so admins see results without waiting for the cron.
  let processed: unknown = null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/functions/v1/zara-process-embed-queue`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: "{}",
      },
    );
    processed = await r.json().catch(() => null);
  } catch (e) {
    console.warn("[zara-embed-projects] processor kick failed", e);
  }

  return new Response(
    JSON.stringify({ enqueued: enq ?? 0, processed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
