import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * handle-lead-inbound
 *
 * Unified inbound webhook for:
 *   - Facebook Lead Ads  (via Meta webhook or Zapier/ManyChat relay)
 *   - TikTok Lead Gen    (via Zapier relay or TikTok Events API webhook)
 *   - ManyChat           (External Request step — contact + opt-in events)
 *
 * On a new lead:
 *   1. Normalises the payload into a common LeadPayload shape
 *   2. Upserts the conversation (de-dupes by email/phone + channel)
 *   3. Stores a synthetic "first message" from the lead
 *   4. Fires zara-respond asynchronously so Zara sends the first outbound message
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadPayload {
  source: "facebook" | "tiktok" | "manychat" | "unknown";
  channel: "facebook" | "instagram" | "whatsapp" | "sms" | "tiktok";
  leadName: string;
  leadPhone: string | null;
  leadEmail: string | null;
  externalId: string | null;          // subscriber / lead ID from the platform
  firstMessage: string;               // synthetic opening context for Zara
  rawData: Record<string, unknown>;
  manychatSubscriberId: string | null;
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

/**
 * Facebook Lead Ads webhook payload
 *
 * Meta sends a GET for verification and POST for lead events:
 * {
 *   "object": "page",
 *   "entry": [{ "changes": [{ "field": "leadgen", "value": { ... } }] }]
 * }
 *
 * A Zapier/ManyChat relay typically simplifies to flat JSON.
 * We support both.
 */
function normalizeFacebook(body: Record<string, unknown>): LeadPayload {
  // Nested Meta webhook format
  const entry = (body.entry as Array<Record<string, unknown>> | undefined)?.[0];
  const change = (entry?.changes as Array<Record<string, unknown>> | undefined)?.[0];
  const value = (change?.value as Record<string, unknown> | undefined) ?? body;

  const fieldData = value.field_data as Array<{ name: string; values: string[] }> | undefined;
  const getField = (name: string) =>
    fieldData?.find((f) => f.name === name)?.values?.[0] ?? null;

  const firstName = getField("first_name") ?? (value.first_name as string) ?? "";
  const lastName = getField("last_name") ?? (value.last_name as string) ?? "";
  const fullName =
    getField("full_name") ??
    (value.full_name as string) ??
    [firstName, lastName].filter(Boolean).join(" ") ||
    (value.name as string) ||
    "Unknown";

  const email =
    getField("email") ?? (value.email as string) ?? null;
  const phone =
    getField("phone_number") ??
    getField("phone") ??
    (value.phone as string) ??
    null;

  const adName = (value.ad_name as string) ?? (value.form_name as string) ?? "Facebook Ad";
  const leadId = (value.leadgen_id as string) ?? (value.id as string) ?? null;

  return {
    source: "facebook",
    channel: "facebook",
    leadName: fullName,
    leadPhone: phone,
    leadEmail: email,
    externalId: leadId,
    firstMessage: `New Facebook Lead Ad submission from "${adName}". Lead filled out the form and is interested in real estate.`,
    rawData: value as Record<string, unknown>,
    manychatSubscriberId: null,
  };
}

/**
 * TikTok Lead Gen webhook
 *
 * TikTok Events API sends:
 * { "lead_id": "...", "ad_id": "...", "campaign_id": "...", "questions": [{ "question_type": "CUSTOM_1", "answer": "..." }] }
 *
 * Zapier/relay flattens it.
 */
function normalizeTikTok(body: Record<string, unknown>): LeadPayload {
  const getAnswer = (type: string) => {
    const questions = body.questions as Array<{ question_type: string; answer: string }> | undefined;
    return questions?.find((q) => q.question_type === type)?.answer ?? null;
  };

  const firstName =
    getAnswer("FIRST_NAME") ?? getAnswer("FIRST NAME") ?? (body.first_name as string) ?? "";
  const lastName =
    getAnswer("LAST_NAME") ?? getAnswer("LAST NAME") ?? (body.last_name as string) ?? "";
  const fullName =
    getAnswer("FULL_NAME") ??
    [firstName, lastName].filter(Boolean).join(" ") ||
    (body.name as string) ||
    "Unknown";

  const email =
    getAnswer("EMAIL") ?? (body.email as string) ?? null;
  const phone =
    getAnswer("PHONE_NUMBER") ?? getAnswer("PHONE") ?? (body.phone as string) ?? null;

  const adId = (body.ad_id as string) ?? (body.campaign_name as string) ?? "TikTok Ad";
  const leadId = (body.lead_id as string) ?? null;

  return {
    source: "tiktok",
    channel: "tiktok",
    leadName: fullName,
    leadPhone: phone,
    leadEmail: email,
    externalId: leadId,
    firstMessage: `New TikTok Lead Gen form submission from ad "${adId}". Lead is interested in real estate.`,
    rawData: body,
    manychatSubscriberId: null,
  };
}

/**
 * ManyChat External Request / Flow-triggered webhook
 *
 * {
 *   "id": "subscriber_id", "name": "John Smith",
 *   "phone": "+1...", "email": "...",
 *   "channel": "whatsapp|instagram|messenger|sms",
 *   "last_input_text": "Hey I'm interested"
 * }
 */
function normalizeManyChat(body: Record<string, unknown>): LeadPayload {
  const mapChannel = (
    ch: string
  ): "facebook" | "instagram" | "whatsapp" | "sms" | "tiktok" => {
    const c = (ch || "").toLowerCase();
    if (c.includes("whatsapp")) return "whatsapp";
    if (c.includes("instagram")) return "instagram";
    if (c.includes("sms")) return "sms";
    return "facebook";
  };

  const subscriberId =
    (body.id as string) ?? (body.subscriber_id as string) ?? null;
  const leadName =
    (body.name as string) ??
    [(body.first_name as string), (body.last_name as string)]
      .filter(Boolean)
      .join(" ") ||
    "Unknown";
  const messageText =
    (body.last_input_text as string) ??
    (body.message as string) ??
    (body.text as string) ??
    null;

  const rawChannel =
    (body.channel as string) ?? (body.source as string) ?? "messenger";
  const channel = mapChannel(rawChannel);

  return {
    source: "manychat",
    channel,
    leadName,
    leadPhone: (body.phone as string) ?? null,
    leadEmail: (body.email as string) ?? null,
    externalId: subscriberId,
    firstMessage:
      messageText ??
      `New ManyChat lead from ${rawChannel}. ${leadName} opted into your flow.`,
    rawData: body,
    manychatSubscriberId: subscriberId,
  };
}

/**
 * Auto-detect source from the payload shape
 */
function detectAndNormalize(body: Record<string, unknown>): LeadPayload {
  // TikTok: has lead_id or questions array
  if (body.lead_id || Array.isArray(body.questions)) {
    return normalizeTikTok(body);
  }

  // Facebook native: has entry[] or field_data[]
  if (body.entry || body.field_data || body.leadgen_id || body.object === "page") {
    return normalizeFacebook(body);
  }

  // ManyChat: has subscriber_id/id + channel field
  if (body.id || body.subscriber_id) {
    return normalizeManyChat(body);
  }

  // Flat form: treat as Facebook-style
  if (body.email || body.phone || body.full_name || body.first_name) {
    return normalizeFacebook(body);
  }

  // Fallback: unknown — still try to create a conversation
  return {
    source: "unknown",
    channel: "facebook",
    leadName: (body.name as string) ?? "Unknown Lead",
    leadPhone: (body.phone as string) ?? null,
    leadEmail: (body.email as string) ?? null,
    externalId: (body.id as string) ?? null,
    firstMessage: "New lead received from an unknown source.",
    rawData: body,
    manychatSubscriberId: null,
  };
}

// ─── Meta Webhook Verification ───────────────────────────────────────────────

function handleFacebookVerification(url: URL): Response | null {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge) {
    const expected = Deno.env.get("FB_VERIFY_TOKEN") ?? "commissioniq_verify";
    if (token === expected) {
      console.log("Facebook webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Facebook verification GET request
  if (req.method === "GET") {
    const verificationResponse = handleFacebookVerification(new URL(req.url));
    if (verificationResponse) return verificationResponse;
    return new Response("Not found", { status: 404 });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      throw new Error("Supabase env not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse body — support JSON and form-encoded
    let rawBody: Record<string, unknown> = {};
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      rawBody = await req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      for (const pair of text.split("&")) {
        const [k, v] = pair.split("=");
        if (k) rawBody[decodeURIComponent(k)] = decodeURIComponent(v ?? "").replace(/\+/g, " ");
      }
    } else {
      // try JSON as fallback
      const text = await req.text();
      try { rawBody = JSON.parse(text); } catch { rawBody = { raw: text }; }
    }

    // Allow caller to hint the source via query param or X-Lead-Source header
    const urlObj = new URL(req.url);
    const sourceHint =
      urlObj.searchParams.get("source") ??
      req.headers.get("x-lead-source") ??
      null;

    let lead: LeadPayload;
    if (sourceHint === "facebook") lead = normalizeFacebook(rawBody);
    else if (sourceHint === "tiktok") lead = normalizeTikTok(rawBody);
    else if (sourceHint === "manychat") lead = normalizeManyChat(rawBody);
    else lead = detectAndNormalize(rawBody);

    console.log(`handle-lead-inbound [${lead.source}/${lead.channel}]:`, lead.leadName);

    // Facebook can send batched entries — for now we take first entry.
    // A more complete implementation would loop through entries.

    // ── Determine which user to assign the conversation to ──────────────────
    let userId: string | null = null;

    // Try LEAD_DEFAULT_USER_ID first (most explicit)
    const defaultUserId = Deno.env.get("LEAD_DEFAULT_USER_ID") ?? Deno.env.get("MANYCHAT_DEFAULT_USER_ID");
    if (defaultUserId) {
      userId = defaultUserId;
    } else {
      // Fallback: any active platform connection owner
      const { data: connections } = await supabase
        .from("platform_connections")
        .select("user_id")
        .eq("is_active", true)
        .limit(1);
      userId = connections?.[0]?.user_id ?? null;
    }

    if (!userId) {
      console.error("No user found to assign lead to");
      return new Response(
        JSON.stringify({ success: false, reason: "no_user" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── De-duplicate conversation ────────────────────────────────────────────
    let conversation: Record<string, unknown> | null = null;

    // 1. Match by external_id (subscriber ID / lead ID) + channel
    if (lead.externalId) {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("external_id", lead.externalId)
        .eq("channel", lead.channel)
        .order("created_at", { ascending: false })
        .limit(1);
      conversation = data?.[0] ?? null;
    }

    // 2. Match by email
    if (!conversation && lead.leadEmail) {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("lead_email", lead.leadEmail)
        .eq("channel", lead.channel)
        .order("created_at", { ascending: false })
        .limit(1);
      conversation = data?.[0] ?? null;
    }

    // 3. Match by phone
    if (!conversation && lead.leadPhone) {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("lead_phone", lead.leadPhone)
        .eq("channel", lead.channel)
        .order("created_at", { ascending: false })
        .limit(1);
      conversation = data?.[0] ?? null;
    }

    const isNewLead = !conversation;

    // ── Create conversation if new ───────────────────────────────────────────
    if (!conversation) {
      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          lead_name: lead.leadName,
          lead_phone: lead.leadPhone ?? null,
          lead_email: lead.leadEmail ?? null,
          channel: lead.channel,
          external_id: lead.externalId ?? null,
          status: "new",
          assigned_to: "zara",
          last_message_at: new Date().toISOString(),
          heat: 60, // new ad leads start warmer
        })
        .select()
        .single();

      if (convError || !newConv) {
        console.error("Failed to create conversation:", convError);
        return new Response(
          JSON.stringify({ error: "Failed to create conversation" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      conversation = newConv;

      // Log new lead activity
      await supabase.from("zara_activity").insert({
        conversation_id: newConv.id,
        action_type: "lead_created",
        description: `New ${lead.source} lead: ${lead.leadName} via ${lead.channel}`,
        payload: {
          source: lead.source,
          channel: lead.channel,
          external_id: lead.externalId,
          email: lead.leadEmail,
          phone: lead.leadPhone,
        },
      });
    } else {
      // Existing lead — update contact info and bump status
      await supabase
        .from("conversations")
        .update({
          lead_name: lead.leadName || (conversation.lead_name as string),
          lead_phone: lead.leadPhone || (conversation.lead_phone as string) || null,
          lead_email: lead.leadEmail || (conversation.lead_email as string) || null,
          last_message_at: new Date().toISOString(),
          status:
            conversation.status === "new" || conversation.status === "contacted"
              ? "engaged"
              : (conversation.status as string),
        })
        .eq("id", conversation.id);
    }

    const conversationId = conversation.id as string;

    // ── Store the synthetic first-contact message ────────────────────────────
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "inbound",
      sender: "lead",
      body: lead.firstMessage,
      status: "delivered",
      metadata: {
        source: lead.source,
        raw_channel: lead.channel,
        external_id: lead.externalId,
        is_synthetic: true,    // marks this as an auto-generated context message
      },
    });

    // ── Trigger Zara to send the FIRST outbound message ──────────────────────
    // Only fire Zara on new leads so she doesn't double-respond to existing ones
    if (isNewLead || (conversation.assigned_to as string) === "zara") {
      const zaraUrl = `${SUPABASE_URL}/functions/v1/zara-respond`;
      // Fire-and-forget so we return fast
      fetch(zaraUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          conversationId,
          ...(lead.manychatSubscriberId
            ? { manychatSubscriberId: lead.manychatSubscriberId }
            : {}),
        }),
      }).catch((err) => console.error("Failed to trigger zara-respond:", err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        conversation_id: conversationId,
        lead_name: lead.leadName,
        source: lead.source,
        channel: lead.channel,
        is_new_lead: isNewLead,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("handle-lead-inbound error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
