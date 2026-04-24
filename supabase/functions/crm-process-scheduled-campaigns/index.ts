// Cron-driven processor: dispatches campaigns whose `scheduled_for` is due.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("crm_email_campaigns")
    .select("id, subject, body_html, segment_filter, template_id")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .limit(10);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];

  for (const c of due ?? []) {
    // Mark sending so concurrent runs don't double-send
    await supabase.from("crm_email_campaigns").update({ status: "sending" }).eq("id", c.id);

    const seg = (c.segment_filter ?? {}) as { tag?: string; status?: string };
    let q = supabase
      .from("crm_contacts")
      .select("email, first_name")
      .not("email", "is", null)
      .eq("marketing_consent", true)
      .limit(2000);
    if (seg.tag && seg.tag !== "__all__") q = q.contains("tags", [seg.tag]);
    if (seg.status && seg.status !== "__all__") q = q.eq("status", seg.status);

    const { data: recipients } = await q;
    const list = (recipients ?? []).filter((r) => r.email);

    let sent = 0, failed = 0;
    for (let i = 0; i < list.length; i += 25) {
      const chunk = list.slice(i, i + 25);
      const res = await Promise.all(
        chunk.map((r) =>
          supabase.functions.invoke("crm-send-via-presale", {
            body: {
              to: r.email,
              to_name: r.first_name,
              subject: c.subject,
              html: c.body_html,
              template_id: c.template_id ?? undefined,
              template_type: "campaign",
              campaign_id: c.id,
            },
          }).then((x) => (x.error ? false : true)).catch(() => false),
        ),
      );
      sent += res.filter(Boolean).length;
      failed += res.filter((b) => !b).length;
    }

    await supabase
      .from("crm_email_campaigns")
      .update({
        status: failed === list.length && list.length > 0 ? "failed" : "sent",
        sent_at: new Date().toISOString(),
        recipients_count: list.length,
      })
      .eq("id", c.id);

    results.push({ id: c.id, sent, failed });
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
