// Admin-only Web Behavior sanity check.
// Seeds a known synthetic event batch for a given contact_id, verifies they
// land in the four behavior tables, and returns counts + sample rows so the UI
// can confirm rendering + link integrity end-to-end.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: member } = await admin
      .from("crm_team")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member || !["owner", "admin"].includes(member.role)) {
      return json({ error: "forbidden" }, 403);
    }

    let body: { contact_id?: string; cleanup?: boolean };
    try { body = await req.json(); } catch { body = {}; }
    const contactId = body.contact_id;
    if (!contactId) return json({ error: "contact_id required" }, 400);

    // Cleanup mode: remove prior sanity rows for this contact
    if (body.cleanup) {
      const tables = [
        "crm_lead_behavior_views",
        "crm_lead_behavior_sessions",
        "crm_lead_behavior_forms",
      ];
      for (const t of tables) {
        await admin.from(t).delete().eq("contact_id", contactId).like("event_id", "sanity-%");
      }
      return json({ ok: true, cleaned: true });
    }

    const stamp = Date.now();
    const presaleUserId = `sanity-${contactId.slice(0, 8)}`;

    const viewRows = [
      {
        event_id: `sanity-view-1-${stamp}`,
        contact_id: contactId,
        presale_user_id: presaleUserId,
        property_id: "sanity-pp-1",
        property_name: "Sanity Tower 1",
        property_url: "/property/sanity-tower-1",
        action: "view",
        duration_seconds: 42,
        metadata: { sanity: true },
        viewed_at: new Date().toISOString(),
      },
      {
        event_id: `sanity-view-2-${stamp}`,
        contact_id: contactId,
        presale_user_id: presaleUserId,
        property_id: "sanity-pp-2",
        property_name: "Sanity Tower 2",
        property_url: "https://presaleproperties.com/property/sanity-tower-2",
        action: "favorite",
        duration_seconds: 0,
        metadata: { sanity: true },
        viewed_at: new Date().toISOString(),
      },
    ];
    const sessionRow = {
      event_id: `sanity-session-${stamp}`,
      contact_id: contactId,
      presale_user_id: presaleUserId,
      session_id: `sanity-${stamp}`,
      pages_viewed: 3,
      duration_seconds: 180,
      referrer: "google",
      utm_source: "sanity-check",
      device_type: "desktop",
      landing_page: "/",
      started_at: new Date().toISOString(),
    };
    const formRow = {
      event_id: `sanity-form-${stamp}`,
      contact_id: contactId,
      presale_user_id: presaleUserId,
      form_type: "sanity_check",
      form_name: "Sanity Check Form",
      property_id: "sanity-pp-1",
      property_name: "Sanity Tower 1",
      payload: { page_url: "https://presaleproperties.com/property/sanity-tower-1", sanity: true },
      funnel_step: 1,
      funnel_total_steps: 1,
      submitted_at: new Date().toISOString(),
    };

    const [v, s, f] = await Promise.all([
      admin.from("crm_lead_behavior_views").upsert(viewRows, { onConflict: "event_id", ignoreDuplicates: true }).select("id, property_url"),
      admin.from("crm_lead_behavior_sessions").upsert([sessionRow], { onConflict: "event_id", ignoreDuplicates: true }).select("id, landing_page"),
      admin.from("crm_lead_behavior_forms").upsert([formRow], { onConflict: "event_id", ignoreDuplicates: true }).select("id"),
    ]);

    const errors = [v.error, s.error, f.error].filter(Boolean).map((e) => e!.message);
    if (errors.length) return json({ ok: false, errors }, 500);

    // Re-read to confirm visibility for the contact
    const [vr, sr, fr] = await Promise.all([
      admin.from("crm_lead_behavior_views").select("id, property_url, property_name").eq("contact_id", contactId).like("event_id", "sanity-%"),
      admin.from("crm_lead_behavior_sessions").select("id, landing_page").eq("contact_id", contactId).like("event_id", "sanity-%"),
      admin.from("crm_lead_behavior_forms").select("id, form_name").eq("contact_id", contactId).like("event_id", "sanity-%"),
    ]);

    const viewsOk = (vr.data?.length ?? 0) >= 2;
    const sessionsOk = (sr.data?.length ?? 0) >= 1;
    const formsOk = (fr.data?.length ?? 0) >= 1;
    const linksOk = (vr.data ?? []).every((r: any) => !!r.property_url);

    return json({
      ok: viewsOk && sessionsOk && formsOk && linksOk,
      checks: {
        views_rendered: viewsOk,
        sessions_rendered: sessionsOk,
        forms_rendered: formsOk,
        links_present: linksOk,
      },
      counts: {
        views: vr.data?.length ?? 0,
        sessions: sr.data?.length ?? 0,
        forms: fr.data?.length ?? 0,
      },
      sample: {
        view_url: vr.data?.[0]?.property_url ?? null,
        session_landing: sr.data?.[0]?.landing_page ?? null,
        form_name: fr.data?.[0]?.form_name ?? null,
      },
    });
  } catch (err) {
    console.error("[behavior-sanity-check]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
