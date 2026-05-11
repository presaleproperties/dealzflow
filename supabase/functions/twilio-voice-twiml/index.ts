// Twilio TwiML Voice webhook — answers BOTH outbound (browser → PSTN)
// and inbound (PSTN → browser) flows for the in-app dialer.
//
// Outbound (from the Voice SDK):
//   Twilio POSTs with From=client:<auth.uid()>, To=<E.164 lead number>,
//   plus our custom params: contactId, agentUserId, voicemailDropId (opt).
//   We respond with <Dial callerId=OUR_NUMBER record="record-from-answer-dual">
//                          <Number ...statusCallback /></Dial>
//   and write a `crm_call_log` row keyed by CallSid.
//
// Inbound (PSTN → Twilio number):
//   Twilio POSTs with From=<caller>, To=<our Twilio number>.
//   We match the contact by phone, find the assigned agent's user_id, then
//   <Dial><Client>{agentIdentity}</Client></Dial>. Falls back to the owner.
//
// Public webhook — Twilio signature is validated via X-Twilio-Signature.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import twilio from "npm:twilio@5.3.7";
import { isValidTwilioSignature, reconstructTwilioUrl } from "../_shared/twilioSignature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FN_BASE = `${Deno.env.get("SUPABASE_URL")!}/functions/v1`;
const STATUS_URL    = `${FN_BASE}/twilio-voice-status`;
const RECORDING_URL = `${FN_BASE}/twilio-voice-recording`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  try {
    const form = await req.formData();
    const params: Record<string, string> = {};
    for (const [k, v] of form.entries()) params[k] = String(v);

    // SECURITY: Validate Twilio signature. Without this, anyone with the
    // public webhook URL can POST From=client:<arbitrary uid>&To=+1... and
    // place outbound calls on our Twilio bill (toll fraud).
    const sig = req.headers.get("x-twilio-signature");
    const fullUrl = reconstructTwilioUrl(req);
    const valid = await isValidTwilioSignature(sig, fullUrl, params);
    if (!valid) {
      console.warn("[twilio-voice-twiml] invalid signature", { fullUrl, hasSig: !!sig });
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }

    const callSid = params.CallSid;
    const from    = params.From || "";
    const to      = params.To   || "";
    const direction = from.startsWith("client:") ? "outbound" : "inbound";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (direction === "outbound") {
      // Identity from "client:<uuid>"
      const agentUserId = from.replace(/^client:/, "");
      const callerId = Deno.env.get("TWILIO_CALLER_ID") || "";
      const contactId = params.contactId || null;
      const voicemailDropId = params.voicemailDropId || null;

      // Insert/upsert the call log row keyed by CallSid
      await supabase.from("crm_call_log").upsert({
        twilio_call_sid: callSid,
        direction: "outbound",
        from_number: callerId,
        to_number: to,
        agent_user_id: agentUserId || null,
        contact_id: contactId,
        voicemail_dropped_id: voicemailDropId,
        status: "ringing",
        started_at: new Date().toISOString(),
      }, { onConflict: "twilio_call_sid" });

      const dial = twiml.dial({
        callerId,
        answerOnBridge: true,
        record: "record-from-answer-dual",
        recordingStatusCallback: RECORDING_URL,
        recordingStatusCallbackEvent: ["completed"],
      });
      dial.number(
        {
          statusCallback: STATUS_URL,
          statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          statusCallbackMethod: "POST",
        },
        to,
      );
    } else {
      // Inbound: match by caller's phone, ring assigned agent's browser client
      const { data: match } = await supabase.rpc("crm_match_contact_by_phone", { _phone: from });
      const matched = (match as any[])?.[0] ?? null;
      const contactId = matched?.contact_id ?? null;
      const assignedDisplayName = matched?.assigned_to ?? null;

      // Resolve assigned agent's user_id; fallback to owner
      let agentUserId: string | null = null;
      if (assignedDisplayName) {
        const { data: agent } = await supabase
          .from("crm_team")
          .select("user_id")
          .eq("display_name", assignedDisplayName)
          .eq("is_active", true)
          .maybeSingle();
        agentUserId = agent?.user_id ?? null;
      }
      if (!agentUserId) {
        const { data: owner } = await supabase
          .from("crm_team")
          .select("user_id")
          .eq("role", "owner")
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        agentUserId = owner?.user_id ?? null;
      }

      await supabase.from("crm_call_log").upsert({
        twilio_call_sid: callSid,
        direction: "inbound",
        from_number: from,
        to_number: to,
        contact_id: contactId,
        agent_user_id: agentUserId,
        status: "ringing",
        started_at: new Date().toISOString(),
      }, { onConflict: "twilio_call_sid" });

      if (agentUserId) {
        const dial = twiml.dial({
          answerOnBridge: true,
          timeout: 25,
          record: "record-from-answer-dual",
          recordingStatusCallback: RECORDING_URL,
          recordingStatusCallbackEvent: ["completed"],
          action: STATUS_URL, // Twilio POSTs DialCallStatus when leg ends
        });
        dial.client(agentUserId);
      } else {
        twiml.say("Sorry, no agents are available to take this call. Please leave a message after the tone.");
        twiml.record({
          maxLength: 120,
          playBeep: true,
          recordingStatusCallback: RECORDING_URL,
        });
      }
    }

    return new Response(twiml.toString(), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  } catch (e) {
    console.error("[twilio-voice-twiml] error", e);
    twiml.say("An application error occurred. Goodbye.");
    twiml.hangup();
    return new Response(twiml.toString(), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  }
});
