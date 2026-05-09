// Twilio recording status callback — saves recording URL + duration to the
// matching crm_call_log row. Twilio hosts the recording at RecordingUrl.
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
    const recordingSid = p.RecordingSid;
    const recordingUrl = p.RecordingUrl ? `${p.RecordingUrl}.mp3` : null;
    const duration = parseInt(p.RecordingDuration || "0", 10) || null;
    if (!callSid) return new Response("missing CallSid", { status: 400, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await supabase
      .from("crm_call_log")
      .update({
        recording_url: recordingUrl,
        recording_duration_sec: duration,
        recording_sid: recordingSid,
      })
      .eq("twilio_call_sid", callSid);

    return new Response("<Response/>", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  } catch (e) {
    console.error("[twilio-voice-recording] error", e);
    return new Response("<Response/>", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/xml" } });
  }
});
