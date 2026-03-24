import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Parses Twilio's form-encoded webhook body
 */
async function parseTwilioWebhook(req: Request): Promise<Record<string, string>> {
  const text = await req.text();
  const params: Record<string, string> = {};
  for (const pair of text.split("&")) {
    const [key, val] = pair.split("=");
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(val || "").replace(/\+/g, " ");
  }
  return params;
}

/**
 * Map Twilio channel type from the From number format
 */
function detectChannel(from: string): "whatsapp" | "sms" {
  return from.startsWith("whatsapp:") ? "whatsapp" : "sms";
}

/**
 * Strip whatsapp: prefix for storage
 */
function cleanPhone(phone: string): string {
  return phone.replace(/^whatsapp:/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse webhook body
    let params: Record<string, string> = {};
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      params = await parseTwilioWebhook(req);
    } else if (contentType.includes("application/json")) {
      params = await req.json();
    } else {
      // Try form-encoded as fallback
      params = await parseTwilioWebhook(req);
    }

    console.log("Inbound webhook params:", JSON.stringify(params));

    const {
      From: rawFrom,
      To: rawTo,
      Body: body,
      MessageSid: messageSid,
      ProfileName: profileName,
      WaId: waId, // WhatsApp ID (phone without +)
    } = params;

    if (!rawFrom || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: From, Body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const channel = detectChannel(rawFrom);
    const fromPhone = cleanPhone(rawFrom);
    const leadName = profileName || `+${waId || fromPhone.replace(/\D/g, "")}`;

    // Find existing conversation by phone number and channel
    // Use service role to search across all users - we need to find the owner
    // In production, you'd tie the Twilio number to a specific user
    // For now, find by phone + channel (most recent)
    const { data: existingConversations } = await supabase
      .from("conversations")
      .select("*")
      .eq("lead_phone", fromPhone)
      .eq("channel", channel)
      .order("created_at", { ascending: false })
      .limit(1);

    let conversation = existingConversations?.[0] || null;

    // If no conversation found, we need a user to assign to
    // Fetch the first active user (in production, tie Twilio number → user)
    // This can be configured via a TWILIO_DEFAULT_USER_ID secret
    let userId = conversation?.user_id;

    if (!userId) {
      const defaultUserId = Deno.env.get("TWILIO_DEFAULT_USER_ID");
      if (defaultUserId) {
        userId = defaultUserId;
      } else {
        // Fallback: look for any user with platform_connections
        const { data: connections } = await supabase
          .from("platform_connections")
          .select("user_id")
          .eq("is_active", true)
          .limit(1);
        userId = connections?.[0]?.user_id;
      }
    }

    if (!userId) {
      console.error("No user found to assign conversation to");
      // Return 200 to Twilio so it doesn't retry
      return new Response("<Response></Response>", {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Create conversation if it doesn't exist
    if (!conversation) {
      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          lead_name: leadName,
          lead_phone: fromPhone,
          channel,
          status: "new",
          assigned_to: "zara",
          last_message_at: new Date().toISOString(),
          heat: 50,
        })
        .select()
        .single();

      if (convError) {
        console.error("Failed to create conversation:", convError);
        return new Response("<Response></Response>", {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        });
      }

      conversation = newConv;

      // Log new lead activity
      await supabase.from("zara_activity").insert({
        conversation_id: conversation.id,
        action_type: "lead_created",
        description: `New ${channel} lead received from ${fromPhone}`,
        payload: { channel, from: rawFrom, to: rawTo },
      });
    } else {
      // Update last message time
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          // Update status to engaged if they're replying
          status: conversation.status === "new" || conversation.status === "contacted"
            ? "engaged"
            : conversation.status,
        })
        .eq("id", conversation.id);
    }

    // Save inbound message
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "inbound",
      sender: "lead",
      body,
      twilio_message_sid: messageSid || null,
      status: "delivered",
    });

    // Trigger Zara to respond if assigned to her
    if (conversation.assigned_to === "zara") {
      // Call zara-respond asynchronously (fire and forget pattern via fetch)
      const supabaseUrl = SUPABASE_URL;
      const zaraUrl = `${supabaseUrl}/functions/v1/zara-respond`;

      // We don't await this so Twilio gets a fast 200 response
      fetch(zaraUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          conversationId: conversation.id,
          fromNumber: rawFrom, // Keep whatsapp: prefix for Twilio
        }),
      }).catch((err) => console.error("Failed to trigger zara-respond:", err));
    } else {
      // Log that message was received but Uzair is handling it
      await supabase.from("zara_activity").insert({
        conversation_id: conversation.id,
        action_type: "message_received_manual",
        description: `Inbound message received — assigned to Uzair (manual mode)`,
        payload: { body_preview: body.substring(0, 100) },
      });
    }

    // Return empty TwiML response (Twilio requires 200 with XML)
    return new Response("<Response></Response>", {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("handle-message-inbound error:", error);
    // Always return 200 to Twilio to prevent retries
    return new Response("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
});
