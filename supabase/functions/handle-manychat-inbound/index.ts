import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Maps ManyChat channel strings to our internal channel type
 */
function mapChannel(
  mcChannel: string
): "whatsapp" | "sms" | "facebook" | "instagram" | "email" {
  const ch = (mcChannel || "").toLowerCase();
  if (ch.includes("whatsapp")) return "whatsapp";
  if (ch.includes("sms")) return "sms";
  if (ch.includes("instagram")) return "instagram";
  if (ch.includes("email")) return "email";
  return "facebook"; // default for messenger/unknown
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      throw new Error("Supabase env not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse webhook body — ManyChat sends JSON
    const payload = await req.json();
    console.log("ManyChat inbound payload:", JSON.stringify(payload));

    /*
     * ManyChat webhook payload structure (External Request type):
     * {
     *   "id": "subscriber_id",
     *   "key": "...",
     *   "first_name": "John",
     *   "last_name": "Smith",
     *   "name": "John Smith",
     *   "phone": "+16041234567",
     *   "email": "john@example.com",
     *   "channel": "whatsapp" | "instagram" | "messenger" | "sms",
     *   "last_input_text": "Hey, I'm interested in a condo",
     *   "custom_fields": { ... }
     * }
     *
     * ManyChat also supports Zapier-style POSTs with arbitrary keys.
     * We normalise multiple formats below.
     */

    // Support both ManyChat native webhook and flow-triggered format
    const subscriberId =
      payload.id ||
      payload.subscriber_id ||
      payload.user_id ||
      null;

    const leadName =
      payload.name ||
      [payload.first_name, payload.last_name].filter(Boolean).join(" ") ||
      payload.full_name ||
      "Unknown";

    const messageBody =
      payload.last_input_text ||
      payload.text ||
      payload.message ||
      payload.body ||
      null;

    const leadPhone =
      payload.phone ||
      payload.phone_number ||
      null;

    const leadEmail =
      payload.email ||
      null;

    const rawChannel =
      payload.channel ||
      payload.source ||
      "messenger";

    const channel = mapChannel(rawChannel);

    // We need either a message body or at minimum a subscriber to create a conversation
    if (!subscriberId && !leadPhone && !leadEmail) {
      return new Response(
        JSON.stringify({ error: "Cannot identify subscriber — need id, phone, or email" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Find existing conversation by external_id (ManyChat subscriber ID) or phone
    let conversation = null;

    if (subscriberId) {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("external_id", String(subscriberId))
        .eq("channel", channel)
        .order("created_at", { ascending: false })
        .limit(1);
      conversation = data?.[0] || null;
    }

    // Fallback: match by phone if we didn't find by subscriber ID
    if (!conversation && leadPhone) {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("lead_phone", leadPhone)
        .eq("channel", channel)
        .order("created_at", { ascending: false })
        .limit(1);
      conversation = data?.[0] || null;
    }

    // Determine which user to assign the conversation to
    let userId = conversation?.user_id;

    if (!userId) {
      const defaultUserId = Deno.env.get("MANYCHAT_DEFAULT_USER_ID");
      if (defaultUserId) {
        userId = defaultUserId;
      } else {
        // Fallback: find any active user with platform_connections
        const { data: connections } = await supabase
          .from("platform_connections")
          .select("user_id")
          .eq("is_active", true)
          .limit(1);
        userId = connections?.[0]?.user_id;
      }
    }

    if (!userId) {
      console.error("No user found to assign ManyChat conversation to");
      return new Response(
        JSON.stringify({ success: false, reason: "no_user" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create conversation if it doesn't exist
    if (!conversation) {
      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          lead_name: leadName,
          lead_phone: leadPhone || null,
          lead_email: leadEmail || null,
          channel,
          external_id: subscriberId ? String(subscriberId) : null,
          status: "new",
          assigned_to: "zara",
          last_message_at: new Date().toISOString(),
          heat: 50,
        })
        .select()
        .single();

      if (convError) {
        console.error("Failed to create conversation:", convError);
        return new Response(
          JSON.stringify({ error: "Failed to create conversation" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      conversation = newConv;

      // Log new lead
      await supabase.from("zara_activity").insert({
        conversation_id: conversation.id,
        action_type: "lead_created",
        description: `New ${channel} lead from ManyChat: ${leadName}`,
        payload: { channel, subscriber_id: subscriberId, source: "manychat" },
      });
    } else {
      // Update conversation with latest info
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          lead_name: leadName || conversation.lead_name,
          lead_phone: leadPhone || conversation.lead_phone,
          lead_email: leadEmail || conversation.lead_email,
          status:
            conversation.status === "new" || conversation.status === "contacted"
              ? "engaged"
              : conversation.status,
        })
        .eq("id", conversation.id);
    }

    // Save inbound message (only if there's actual message text)
    if (messageBody && messageBody.trim()) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        direction: "inbound",
        sender: "lead",
        body: messageBody.trim(),
        status: "delivered",
        metadata: {
          source: "manychat",
          subscriber_id: subscriberId,
          raw_channel: rawChannel,
        },
      });

      // Fire Zara to respond if assigned
      if (conversation.assigned_to === "zara") {
        const zaraUrl = `${SUPABASE_URL}/functions/v1/zara-respond`;
        fetch(zaraUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            conversationId: conversation.id,
            // Pass subscriber ID for ManyChat outbound
            manychatSubscriberId: subscriberId,
          }),
        }).catch((err) =>
          console.error("Failed to trigger zara-respond:", err)
        );
      }
    } else {
      // No message body — just a contact/subscriber event (opt-in, etc.)
      await supabase.from("zara_activity").insert({
        conversation_id: conversation.id,
        action_type: "contact_event",
        description: `ManyChat contact event received (no message body)`,
        payload: { source: "manychat", subscriber_id: subscriberId, raw_channel: rawChannel },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        conversation_id: conversation.id,
        lead_name: leadName,
        channel,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("handle-manychat-inbound error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
