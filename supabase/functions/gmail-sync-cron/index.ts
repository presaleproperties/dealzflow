// @ts-nocheck
// Cron dispatcher: iterates all connected Gmail accounts and triggers
// an incremental gmail-sync for each. Invoked by pg_cron every 2 minutes.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tokens, error } = await supabase
      .from("gmail_tokens")
      .select("user_id");

    if (error) throw error;
    if (!tokens || tokens.length === 0) {
      return json({ ok: true, dispatched: 0 });
    }

    // Fan out (fire-and-forget per user)
    let dispatched = 0;
    await Promise.allSettled(tokens.map(async (t) => {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/gmail-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ user_id: t.user_id }),
      });
      if (r.ok) dispatched++;
      else console.warn("gmail-sync dispatch failed for", t.user_id, await r.text());
    }));

    return json({ ok: true, total: tokens.length, dispatched });
  } catch (e) {
    console.error("gmail-sync-cron err:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
