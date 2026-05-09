// Drains crm_outbound_webhooks. Signs each payload with PRESALE_WEBHOOK_SECRET
// and POSTs to the target. Exponential backoff: 30s, 2m, 10m, 1h, 6h.
// Triggered by pg_cron every minute.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signPresale } from "../_shared/hmac.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const BACKOFF_MS = [30_000, 120_000, 600_000, 3_600_000, 21_600_000];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows } = await supabase.from("crm_outbound_webhooks")
    .select("*")
    .in("status", ["pending", "retry"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(25);

  const results: any[] = [];
  for (const row of rows ?? []) {
    const body = JSON.stringify(row.payload);
    let signature = "";
    try { signature = await signPresale(body); }
    catch (e) {
      await supabase.from("crm_outbound_webhooks").update({
        status: "error", last_error: `sign_failed: ${e}`,
        last_attempt_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ id: row.id, status: "sign_failed" });
      continue;
    }

    let statusCode = 0; let errMsg: string | null = null;
    try {
      const r = await fetch(row.target_url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-presale-signature": signature,
        },
        body,
      });
      statusCode = r.status;
      if (!r.ok) errMsg = (await r.text()).slice(0, 500);
    } catch (e) { errMsg = String(e); }

    const attempts = (row.attempts ?? 0) + 1;
    const ok = statusCode >= 200 && statusCode < 300;
    if (ok) {
      await supabase.from("crm_outbound_webhooks").update({
        status: "delivered", attempts,
        last_status_code: statusCode, last_error: null,
        last_attempt_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ id: row.id, status: "delivered", code: statusCode });
    } else if (attempts >= (row.max_attempts ?? 5)) {
      await supabase.from("crm_outbound_webhooks").update({
        status: "failed", attempts,
        last_status_code: statusCode || null, last_error: errMsg,
        last_attempt_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ id: row.id, status: "failed", code: statusCode });
    } else {
      const wait = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
      await supabase.from("crm_outbound_webhooks").update({
        status: "retry", attempts,
        last_status_code: statusCode || null, last_error: errMsg,
        last_attempt_at: new Date().toISOString(),
        next_attempt_at: new Date(Date.now() + wait).toISOString(),
      }).eq("id", row.id);
      results.push({ id: row.id, status: "retry", code: statusCode, wait_ms: wait });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
