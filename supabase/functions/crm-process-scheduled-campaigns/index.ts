// Cron-driven processor: dispatches campaigns whose `scheduled_for` is due.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Per-recipient token rendering — mirrors src/lib/emailVariables.ts.
// Replaces {{lead.*}}, legacy {{first_name}} etc. with the recipient's data.
function renderForRecipient(input: string, lead: Record<string, unknown>): string {
  if (!input) return input;
  const get = (k: string) => {
    const v = lead[k];
    return v === null || v === undefined ? "" : String(v);
  };
  const first = get("first_name").trim();
  const last = get("last_name").trim();
  const full = [first, last].filter(Boolean).join(" ");
  const budget = (() => {
    const v = lead["budget_max"];
    if (v === null || v === undefined || v === "") return "";
    const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : (v as number);
    return Number.isFinite(n)
      ? n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })
      : String(v);
  })();
  const values: Record<string, string> = {
    "lead.first_name": first,
    "lead.last_name": last,
    "lead.full_name": full,
    "lead.email": get("email"),
    "lead.phone": get("phone"),
    "lead.city": get("city"),
    "lead.intent": get("intent"),
    "lead.budget_max": budget,
    "lead.timeframe": get("timeframe"),
    "lead.home_type": get("home_type") || get("property_type_pref"),
    "cobuyer.full_name": get("co_buyer_name"),
    "cobuyer.email": get("co_buyer_email"),
    first_name: first,
    last_name: last,
    lead_name: full,
  };
  return input.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, raw) => {
    const tok = String(raw);
    if (tok in values) return values[tok];
    const lower = tok.toLowerCase();
    if (lower in values) return values[lower];
    return "";
  });
}

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
      .select("id, email, first_name, last_name, phone, city, intent, budget_max, timeframe, property_type_pref, co_buyer_name, co_buyer_email")
      .not("email", "is", null)
      .eq("marketing_consent", true)
      .limit(2000);
    if (seg.tag && seg.tag !== "__all__") q = q.contains("tags", [seg.tag]);
    if (seg.status && seg.status !== "__all__") q = q.eq("status", seg.status);

    const { data: recipients } = await q;
    const list = ((recipients ?? []) as Record<string, unknown>[]).filter((r) => r.email);

    let sent = 0, failed = 0;
    for (let i = 0; i < list.length; i += 25) {
      const chunk = list.slice(i, i + 25);
      const res = await Promise.all(
        chunk.map((r) => {
          const personalSubject = renderForRecipient(c.subject ?? "", r);
          const personalHtml = renderForRecipient(c.body_html ?? "", r);
          return supabase.functions.invoke("crm-send-via-presale", {
            body: {
              to: r.email,
              to_name: r.first_name,
              subject: personalSubject,
              html: personalHtml,
              template_id: c.template_id ?? undefined,
              template_type: "campaign",
              campaign_id: c.id,
              contact_id: r.id,
            },
          }).then((x) => (x.error ? false : true)).catch(() => false);
        }),
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
