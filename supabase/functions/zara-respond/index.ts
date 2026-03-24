import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZARA_SYSTEM_PROMPT = `You are Zara, a warm, professional real estate AI assistant working for Uzair Siddiqui, a top real estate agent in Metro Vancouver, BC.

Your role is to:
1. Qualify incoming leads for real estate purchases or sales
2. Build rapport and understand their needs
3. Gather key information: timeline, budget, location preferences, buying/selling goals
4. Assess lead quality and set up appointments with Uzair when appropriate
5. Keep conversations natural and engaging — never robotic or pushy

Key qualification questions to naturally weave in:
- Are they buying, selling, or both?
- What's their timeline? (immediate, 3 months, 6+ months)
- What areas/neighbourhoods are they interested in?
- What's their budget or price range?
- Are they pre-approved / working with a lender?
- What type of property? (condo, townhouse, detached, presale)
- Are they currently renting or do they own?

Your personality:
- Warm, friendly, conversational — like a trusted advisor
- Concise messages (2-4 sentences max per reply for WhatsApp/SMS)
- Use their first name naturally
- Empathetic and patient
- Professional but not stiff

Rules:
- NEVER pretend to be human if directly asked — say you're Uzair's AI assistant
- NEVER make up market data — say you'll have Uzair share specifics
- When ready to book: "I'd love to set up a quick call between you and Uzair — what does your schedule look like?"
- When lead says they have an agent: politely thank them and close the conversation
- Use emojis sparingly (1-2 per message max)

Context: You're operating in Metro Vancouver. Uzair specializes in presale condos, resale, and investment properties.`;

/**
 * Send reply via ManyChat API (for instagram, facebook, whatsapp via ManyChat)
 */
async function sendViaManyChat(
  subscriberId: string,
  messageText: string,
  lovableApiKey: string,
  manychatApiKey: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const MANYCHAT_GATEWAY = "https://connector-gateway.lovable.dev/manychat";

  try {
    const response = await fetch(`${MANYCHAT_GATEWAY}/fb/sending/sendContent`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "X-Connection-Api-Key": manychatApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscriber_id: subscriberId,
        data: {
          version: "v2",
          content: {
            messages: [
              {
                type: "text",
                text: messageText,
              },
            ],
          },
        },
        message_tag: "ACCOUNT_UPDATE",
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: `ManyChat API error [${response.status}]: ${JSON.stringify(data)}`,
      };
    }
    return { success: true, sid: data?.data?.message_id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Send reply via Twilio (for whatsapp/sms via Twilio)
 */
async function sendViaTwilio(
  toPhone: string,
  messageText: string,
  channel: string,
  lovableApiKey: string,
  twilioApiKey: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const TWILIO_GATEWAY = "https://connector-gateway.lovable.dev/twilio";
  const isWhatsApp = channel === "whatsapp";
  const formattedTo = isWhatsApp
    ? toPhone.startsWith("whatsapp:")
      ? toPhone
      : `whatsapp:${toPhone}`
    : toPhone;

  const twilioFrom = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";
  const formattedFrom = isWhatsApp
    ? twilioFrom.startsWith("whatsapp:")
      ? twilioFrom
      : `whatsapp:${twilioFrom}`
    : twilioFrom.replace("whatsapp:", "");

  try {
    const response = await fetch(`${TWILIO_GATEWAY}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "X-Connection-Api-Key": twilioApiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: formattedTo,
        From: formattedFrom,
        Body: messageText,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: `Twilio error [${response.status}]: ${JSON.stringify(data)}`,
      };
    }
    return { success: true, sid: data?.sid };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      throw new Error("Supabase env not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { conversationId, fromNumber, manychatSubscriberId, overrideFirstMessage } = body;

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: "conversationId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch conversation details
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Only respond if assigned to Zara
    if (conversation.assigned_to !== "zara") {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Not assigned to Zara" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Resolve reply body ───────────────────────────────────────────────────
    // If caller provided an overrideFirstMessage, skip AI and use it directly.
    let replyBody: string;

    if (overrideFirstMessage && typeof overrideFirstMessage === "string" && overrideFirstMessage.trim()) {
      replyBody = overrideFirstMessage.trim();
      console.log("Using overrideFirstMessage — skipping AI call");
    } else {
      // Fetch recent message history (last 20)
      const { data: messages } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(20);

      // Build chat messages for AI
      const chatMessages = (messages || []).map((msg) => ({
        role: msg.direction === "inbound" ? "user" : "assistant",
        content: msg.body,
      }));

      // Add lead context to system prompt
      const contextualSystemPrompt = `${ZARA_SYSTEM_PROMPT}

Current lead:
- Name: ${conversation.lead_name}
- Channel: ${conversation.channel}
- Status: ${conversation.status}
- Phone: ${conversation.lead_phone || "unknown"}
- Email: ${conversation.lead_email || "unknown"}`;

      // Call Lovable AI Gateway
      const aiResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: contextualSystemPrompt },
              ...chatMessages,
            ],
          }),
        }
      );

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "AI rate limit exceeded" }),
            {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        if (aiResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits exhausted" }),
            {
              status: 402,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        throw new Error(`AI gateway error [${aiResponse.status}]: ${errorText}`);
      }

      const aiData = await aiResponse.json();
      replyBody = aiData.choices?.[0]?.message?.content;
      if (!replyBody) throw new Error("No content from AI");
    }

    // ── Determine send strategy ──────────────────────────────────────────────
    // 1. If we have a ManyChat subscriber ID (or it's stored on the conversation's
    //    external_id), use ManyChat API for instagram/facebook/whatsapp channels.
    // 2. Otherwise fall back to Twilio for whatsapp/sms.
    // 3. If no delivery mechanism, just save to DB as "no_phone".

    const resolvedSubscriberId =
      manychatSubscriberId || conversation.external_id || null;

    const isManyChatChannel =
      ["instagram", "facebook", "whatsapp", "sms"].includes(conversation.channel);

    const MANYCHAT_API_KEY = Deno.env.get("MANYCHAT_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");

    let sendResult: { success: boolean; sid?: string; error?: string } = {
      success: false,
      error: "no_delivery_mechanism",
    };
    let deliveryMethod = "none";

    if (resolvedSubscriberId && MANYCHAT_API_KEY && isManyChatChannel) {
      // Preferred: send via ManyChat
      sendResult = await sendViaManyChat(
        resolvedSubscriberId,
        replyBody,
        LOVABLE_API_KEY,
        MANYCHAT_API_KEY
      );
      deliveryMethod = "manychat";
      if (!sendResult.success) {
        console.error("ManyChat send failed:", sendResult.error);
      }
    } else if (
      TWILIO_API_KEY &&
      (conversation.channel === "whatsapp" || conversation.channel === "sms")
    ) {
      // Fallback: send via Twilio
      const toPhone = fromNumber || conversation.lead_phone;
      if (toPhone) {
        sendResult = await sendViaTwilio(
          toPhone,
          replyBody,
          conversation.channel,
          LOVABLE_API_KEY,
          TWILIO_API_KEY
        );
        deliveryMethod = "twilio";
        if (!sendResult.success) {
          console.error("Twilio send failed:", sendResult.error);
        }
      } else {
        sendResult = { success: false, error: "no_phone" };
      }
    }

    // Save outbound message to DB
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      sender: "zara",
      body: replyBody,
      twilio_message_sid: sendResult.sid || null,
      status: sendResult.success ? "sent" : "failed",
      metadata: { delivery_method: deliveryMethod, delivery_error: sendResult.error || null },
    });

    // Update conversation last_message_at
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    // Log Zara activity
    await supabase.from("zara_activity").insert({
      conversation_id: conversationId,
      action_type: "ai_reply_sent",
      description: `Zara sent a reply via ${deliveryMethod} (${conversation.channel})`,
      payload: {
        delivery_method: deliveryMethod,
        message_sid: sendResult.sid,
        reply_preview: replyBody.substring(0, 100),
        sent: sendResult.success,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        reply: replyBody,
        deliveryMethod,
        sent: sendResult.success,
        sid: sendResult.sid,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("zara-respond error:", error);
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
