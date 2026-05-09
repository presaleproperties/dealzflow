// Daily 7am warm-up digest.
// Groups warming leads (engagement_score >= 15, activity in last 24h, no high-severity push)
// per assigned agent and inserts ONE notification per agent.
//
// Triggered by pg_cron daily; can also be called manually.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows, error } = await supabase.rpc("crm_warmup_digest_candidates");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Group by assigned_to
  const byAgent = new Map<string, Array<{ contact_id: string; full_name: string | null; engagement_score: number }>>();
  for (const r of (rows ?? []) as any[]) {
    const key = r.assigned_to ?? "";
    if (!byAgent.has(key)) byAgent.set(key, []);
    byAgent.get(key)!.push({
      contact_id: r.contact_id,
      full_name: r.full_name,
      engagement_score: r.engagement_score,
    });
  }

  let totalSent = 0;
  for (const [agentName, leads] of byAgent.entries()) {
    if (!leads.length) continue;
    const { data: recipients } = await supabase.rpc("crm_recipients_for_contact", { _assigned_to: agentName });
    const list = (recipients as string[] | null) ?? [];
    if (!list.length) continue;

    const top = leads.slice(0, 3).map((l) => `${l.full_name ?? "Unknown"} (${l.engagement_score})`).join(", ");
    const more = leads.length > 3 ? ` +${leads.length - 3} more` : "";
    const body = `${leads.length} lead${leads.length === 1 ? "" : "s"} warmed up: ${top}${more}`;
    const today = new Date().toISOString().slice(0, 10);

    const { data: sent } = await supabase.rpc("crm_send_notification", {
      _user_ids: list,
      _title: `🌅 Warm-up digest: ${leads.length} active lead${leads.length === 1 ? "" : "s"}`,
      _body: body,
      _type: "warmup_digest",
      _link_to: "/crm/leads?tab=hot",
      _severity: "low",
      _dedupe_key: `warmup-digest:${today}`,
      _dedupe_window_minutes: 60 * 18,
      _meta: { lead_count: leads.length, top_leads: leads.slice(0, 5) },
    });
    totalSent += Number(sent ?? 0);
  }

  return new Response(JSON.stringify({ ok: true, agents: byAgent.size, total_sent: totalSent }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
