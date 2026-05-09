// Twilio call status callback. Updates `crm_call_log` with timing,
// status transitions, and final duration when the call ends.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const form = await req.formData();
    const p: Record<string, string> = {};
    for (const [k, v] of form.entries()) p[k] = String(v);

    const callSid = p.CallSid || p.ParentCallSid;
    if (!callSid) return new Response("missing CallSid", { status: 400, headers: corsHeaders });

    // Twilio sends events like initiated, ringing, in-progress, completed,
    // busy, failed, no-answer, canceled
    const status = (p.CallStatus || p.DialCallStatus || "").toLowerCase();
    const duration = parseInt(p.CallDuration || p.DialCallDuration || "0", 10) || null;
    const errorCode = p.ErrorCode || null;
    const errorMessage = p.ErrorMessage || null;

    const updates: Record<string, unknown> = { status: status || "completed" };
    if (status === "in-progress" || status === "answered") {
      updates.answered_at = new Date().toISOString();
    }
    if (
      status === "completed" || status === "busy" || status === "failed" ||
      status === "no-answer" || status === "canceled"
    ) {
      updates.ended_at = new Date().toISOString();
      if (duration) updates.duration_sec = duration;
      if (errorCode) updates.error_code = errorCode;
      if (errorMessage) updates.error_message = errorMessage;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error } = await supabase
      .from("crm_call_log")
      .update(updates)
      .eq("twilio_call_sid", callSid);
    if (error) console.error("[twilio-voice-status] update failed", error);

    // Mirror to last_touch_at (manual action)
    const { data: row } = await supabase
      .from("crm_call_log")
      .select("contact_id, direction")
      .eq("twilio_call_sid", callSid)
      .maybeSingle();
    if (row?.contact_id && (status === "completed" || status === "in-progress")) {
      await supabase
        .from("crm_contacts")
        .update({
          last_touch_at: new Date().toISOString(),
          last_touch_type: row.direction === "outbound" ? "call_out" : "call_in",
        })
        .eq("id", row.contact_id);
    }

    // Twilio expects 200 with empty TwiML for `action` callback
    return new Response("<Response/>", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  } catch (e) {
    console.error("[twilio-voice-status] error", e);
    return new Response("<Response/>", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  }
});
