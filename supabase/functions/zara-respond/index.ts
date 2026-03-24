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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { conversationId, fromNumber } = await req.json();
    if (!conversationId) {
      return new Response(JSON.stringify({ error: "conversationId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch conversation details
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only respond if assigned to Zara
    if (conversation.assigned_to !== "zara") {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Not assigned to Zara" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
- Phone: ${conversation.lead_phone || "unknown"}`;

    // Call Lovable AI Gateway
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      if (aiResponse.status === 429) {
        console.error("AI rate limit hit");
        return new Response(JSON.stringify({ error: "AI rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        console.error("AI credits exhausted");
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error [${aiResponse.status}]: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const replyBody = aiData.choices?.[0]?.message?.content;
    if (!replyBody) throw new Error("No content from AI");

    // Determine recipient phone number
    const toPhone = fromNumber || conversation.lead_phone;
    if (!toPhone) {
      // Save the message to DB without sending (no phone number)
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        direction: "outbound",
        sender: "zara",
        body: replyBody,
        status: "sent",
      });

      // Log Zara activity
      await supabase.from("zara_activity").insert({
        conversation_id: conversationId,
        action_type: "ai_reply_no_phone",
        description: `Zara generated reply but no phone number available`,
        payload: { reply_preview: replyBody.substring(0, 100) },
      });

      return new Response(
        JSON.stringify({ success: true, reply: replyBody, sent: false, reason: "no_phone" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone for WhatsApp if needed
    const isWhatsApp = conversation.channel === "whatsapp";
    const formattedTo = isWhatsApp
      ? toPhone.startsWith("whatsapp:") ? toPhone : `whatsapp:${toPhone}`
      : toPhone;

    // Send via Twilio gateway
    // The From number should be your Twilio WhatsApp sandbox or approved number
    // We'll fetch it from the TWILIO_WHATSAPP_FROM env or use a default pattern
    const twilioFrom = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886"; // Twilio sandbox default

    const twilioFrom_formatted = isWhatsApp
      ? (twilioFrom.startsWith("whatsapp:") ? twilioFrom : `whatsapp:${twilioFrom}`)
      : twilioFrom.replace("whatsapp:", "");

    const twilioResponse = await fetch(
      "https://connector-gateway.lovable.dev/twilio/Messages.json",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TWILIO_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: formattedTo,
          From: twilioFrom_formatted,
          Body: replyBody,
        }),
      }
    );

    const twilioData = await twilioResponse.json();
    const messageSid = twilioData?.sid || null;
    const sendStatus = twilioResponse.ok ? "sent" : "failed";

    if (!twilioResponse.ok) {
      console.error("Twilio send error:", JSON.stringify(twilioData));
    }

    // Save outbound message to DB
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      sender: "zara",
      body: replyBody,
      twilio_message_sid: messageSid,
      status: sendStatus,
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
      description: `Zara sent a reply via ${conversation.channel}`,
      payload: { message_sid: messageSid, reply_preview: replyBody.substring(0, 100) },
    });

    return new Response(
      JSON.stringify({ success: true, reply: replyBody, messageSid, sent: twilioResponse.ok }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("zara-respond error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
