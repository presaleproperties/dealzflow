// get-zara-context — bundles a contact + last-touch summary + last 20
// engagement events for downstream Zara surfaces. Service-role read; the
// caller's JWT is verified manually so we can keep the response shape simple.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is signed in.
    const auth = req.headers.get("authorization") || "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { contact_id?: string; contactId?: string } = {};
    try { body = await req.json(); } catch { /* empty body */ }
    const contactId = body.contact_id || body.contactId;
    if (!contactId || typeof contactId !== "string") {
      return new Response(JSON.stringify({ error: "contact_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const [contactRes, lastTouchRes, eventsRes, memoryRes, intelRes, recentNotesRes, recentSmsRes] = await Promise.all([
      admin.from("crm_contacts").select("*").eq("id", contactId).maybeSingle(),
      admin.from("crm_contact_last_touch").select("*").eq("contact_id", contactId).maybeSingle(),
      admin
        .from("crm_engagement_events")
        .select("*")
        .eq("contact_id", contactId)
        .order("occurred_at", { ascending: false })
        .limit(20),
      admin.from("zara_lead_memory").select("*").eq("contact_id", contactId).maybeSingle(),
      admin.from("zara_note_intelligence")
        .select("*")
        .eq("contact_id", contactId)
        .order("analyzed_at", { ascending: false })
        .limit(10),
      admin.from("crm_notes")
        .select("id, content, note_type, event_at, created_at, user_id")
        .eq("contact_id", contactId)
        .not("note_type", "in", "(import_archive,ai_summary,system,website_behavior)")
        .order("created_at", { ascending: false })
        .limit(6),
      admin.from("crm_sms_log")
        .select("id, direction, body, channel, status, sent_at, created_at, to_number, from_number")
        .eq("contact_id", contactId)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(20),
    ]);

    return new Response(
      JSON.stringify({
        contact: contactRes.data ?? null,
        lastTouch: lastTouchRes.data ?? null,
        recentEvents: eventsRes.data ?? [],
        // Lead Intelligence Memory — manual agent notes are the highest-priority signal.
        leadMemory: memoryRes.data ?? null,
        noteIntelligence: intelRes.data ?? [],
        recentNotes: recentNotesRes.data ?? [],
        recentSms: recentSmsRes.data ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("get-zara-context error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
